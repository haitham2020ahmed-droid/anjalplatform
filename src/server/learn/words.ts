/**
 * 📗 Learn → Words: an explanation for EVERY vocabulary word of the Curriculum Map, filtered Grade → Unit → Selection
 * ("Grade 4 · Unit 1 · A World of Change").
 *
 * The words of a selection: data/curriculum-map/lesson-details.json "vocabulary" + the school's own vocabulary words of
 * that selection (Lesson.metadata.vocabularyWords) + words a teacher added. The card of a word: a teacher's own version
 * (the reader's own / a student's class teachers') → the school's version (approved) → data/learn/words/G*.json → the
 * school dictionary's meaning (WordEntry: meaning / Arabic / sentence only) → "No explanation yet" (staff: Write /
 * ✨ AI draft, saved through the same private-edit → admin approval flow as lessons).
 * One selection per request; bounded reads; the school's vocabulary rows are kept 5 minutes per school and grade.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { safeIfBehind } from "../db/schema-errors";
import { remember } from "../cache/lru";
import { aiSettings, callJson } from "../ai/engine";
import type { EnvLike } from "../ai/engine";
import { checkWordCard, type WordCard } from "../../lib/learn/format";
import { curriculumSelections, readWordFiles, selectionKey, selectionLabel, wordKey, type SelectionRef } from "./files";
import { classTeacherIds, pickEdit, staffSchool, teacherIdOf, type EditSource } from "./edits";

const s = (v: unknown) => String(v ?? "");
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };
export const PRACTICE_WORDS = 5;

export type WordSource = EditSource | "DICTIONARY";
export interface WordView { key: string; word: string; card: WordCard | null; source: WordSource; partial: { meaning: string; arabic: string; example: string; pos: string } | null; editId: string | null }
export interface SelectionView { sel: SelectionRef; label: string; words: WordView[] }

// ------------------------------------------------------------------ the school's own vocabulary rows (cached)

const vocabCache = new WeakMap<object, Map<string, { at: number; p: Promise<Map<string, string[]>> }>>();
export function clearLearnWords(repo: Repo): void { vocabCache.delete(repo); }
/** grade → (selection key → words) from the school's Lesson rows (unit number + lesson number). 4 reads, cached 5 min. */
function schoolVocab(repo: Repo, schoolId: string, grade: number): Promise<Map<string, string[]>> {
  let m = vocabCache.get(repo); if (!m) vocabCache.set(repo, (m = new Map()));
  const key = `${schoolId}|${grade}`, hit = m.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.p;
  const p = (async () => {
    const out = new Map<string, string[]>();
    const g = (await repo.findMany("Grade", { schoolId, level: grade }, { select: ["id"], take: 1 }))[0];
    if (!g) return out;
    const curs = await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] });
    const units = curs.length ? await repo.findMany("Unit", { curriculumId: { in: curs.map((c) => s(c.id)) }, deletedAt: null }, { select: ["id", "number"] }) : [];
    const lessons = units.length ? await repo.findMany("Lesson", { unitId: { in: units.map((u) => s(u.id)) }, deletedAt: null }, { select: ["unitId", "number", "metadata"] }) : [];
    for (const l of lessons) {
      const words = json<{ vocabularyWords?: unknown }>(l.metadata, {}).vocabularyWords;
      if (!Array.isArray(words) || !words.length) continue;
      const u = units.find((x) => x.id === l.unitId);
      if (!u) continue;
      const k = selectionKey(grade, Number(u.number), Number(l.number));
      out.set(k, [...new Set([...(out.get(k) ?? []), ...words.map((w) => s(w).trim()).filter(Boolean)])]);
    }
    return out;
  })();
  remember(m, key, { at: Date.now(), p }, 32);
  p.catch(() => m!.delete(key));
  return p;
}

// ------------------------------------------------------------------ one selection

export function findSelection(key: string | null | undefined): SelectionRef | null {
  return curriculumSelections().find((x) => x.key === s(key)) ?? null;
}

/** The words of one selection with their cards as this reader gets them (teacherIds: whose own versions count). */
export async function selectionWords(repo: Repo, schoolId: string, sel: SelectionRef, teacherIds: readonly string[], ownTeacherId: string | null = null): Promise<SelectionView> {
  const files = readWordFiles().cards;
  const [vocab, edits] = await Promise.all([
    safeIfBehind("learn.vocab", () => schoolVocab(repo, schoolId, sel.grade), new Map<string, string[]>()),
    safeIfBehind("learn.word-edits", () => repo.findMany("LearnEdit", { schoolId, kind: "WORD", ref: { contains: `${sel.key}|` }, status: { in: ["APPROVED", "PENDING", "REJECTED"] } }, { select: ["id", "ref", "status", "authorTeacherId", "content", "updatedAt"], orderBy: [{ field: "updatedAt", dir: "desc" }], take: 400 }), [] as Row[]),
  ]);
  const mine = edits.filter((e) => s(e.ref).startsWith(`${sel.key}|`));
  const names: string[] = [];
  const add = (w: string) => { const t = w.trim(); if (t && !names.some((n) => n.toLowerCase() === t.toLowerCase())) names.push(t); };
  sel.vocabulary.forEach(add);
  (vocab.get(sel.key) ?? []).forEach(add);
  // words a teacher added (visible like their edits: the school's, or the reader's own / class teachers')
  for (const e of mine) { const c = json<WordCard | null>(e.content, null); if (c?.word && pickEdit(mine.filter((x) => x.ref === e.ref), teacherIds) === e) add(c.word); }
  const missing = names.filter((w) => !files.has(wordKey(sel.key, w)));
  const dict = missing.length ? await safeIfBehind("learn.dictionary", () => repo.findMany("WordEntry", { schoolId, word: { in: missing.map((w) => w.toLowerCase()) } }, { select: ["word", "meanings", "arabicGloss", "contextSentence"] }), [] as Row[]) : [];
  const words: WordView[] = names.map((w) => {
    const key = wordKey(sel.key, w);
    const e = pickEdit(mine.filter((x) => x.ref === key), teacherIds);
    if (e) {
      const own = ownTeacherId !== null && s(e.authorTeacherId) === ownTeacherId && e.status !== "APPROVED";
      return { key, word: w, card: json<WordCard>(e.content, null as unknown as WordCard), source: e.status === "APPROVED" ? "SCHOOL" : own ? "MINE" : "TEACHER", partial: null, editId: s(e.id) };
    }
    const f = files.get(key);
    if (f) return { key, word: w, card: f, source: "FILE", partial: null, editId: null };
    const d = dict.find((x) => s(x.word) === w.toLowerCase());
    const m0 = d ? (json<Record<string, unknown>[]>(d.meanings, [])[0] ?? {}) : null;
    if (d && (s(m0?.definition) || s(d.arabicGloss))) return { key, word: w, card: null, source: "DICTIONARY", partial: { meaning: s(m0?.definition), arabic: s(d.arabicGloss), example: s(d.contextSentence) || s(m0?.example), pos: s(m0?.partOfSpeech) }, editId: null };
    return { key, word: w, card: null, source: "NONE", partial: null, editId: null };
  });
  return { sel, label: selectionLabel(sel), words };
}

// ------------------------------------------------------------------ the Words section (student + teacher)

export interface WordsPage { grades: number[]; grade: number; units: number[]; unit: number | null; selections: { key: string; name: string; unit: number; words: number }[]; view: SelectionView | null }

function filterOf(grade: number, unitIn: unknown, selIn: unknown): { grade: number; units: number[]; unit: number | null; selections: SelectionRef[]; sel: SelectionRef | null } {
  const all = curriculumSelections().filter((x) => x.grade === grade);
  const units = [...new Set(all.map((x) => x.unit))].sort((a, b) => a - b);
  const sel = findSelection(s(selIn));
  const unit = sel && sel.grade === grade ? sel.unit : units.includes(Number(unitIn)) ? Number(unitIn) : null;
  return { grade, units, unit, selections: all.filter((x) => unit === null || x.unit === unit), sel: sel && sel.grade === grade ? sel : null };
}
const GRADES = () => [...new Set(curriculumSelections().map((x) => x.grade))].sort((a, b) => a - b);

/** Student: their grade by default (any grade can be chosen), one selection's cards. */
export async function studentWords(repo: Repo, actor: Actor, q: { grade?: unknown; unit?: unknown; sel?: unknown } = {}): Promise<WordsPage> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Students only.");
  const grades = GRADES();
  let grade = Number(q.grade);
  const sel0 = findSelection(s(q.sel));
  if (sel0) grade = sel0.grade;
  if (!grades.includes(grade)) {
    const st = await repo.findUnique("Student", { id: actor.studentId });
    const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
    grade = grades.includes(Number(g?.level)) ? Number(g!.level) : grades[0];
  }
  const f = filterOf(grade, q.unit, q.sel);
  const view = f.sel ? await selectionWords(repo, actor.schoolId, f.sel, await classTeacherIds(repo, actor.studentId)) : null;
  return { grades, grade, units: f.units, unit: f.unit, selections: f.selections.map((x) => ({ key: x.key, name: x.name, unit: x.unit, words: x.vocabulary.length })), view };
}

/** Teacher / admin: any grade, the teacher's own versions first. */
export async function teacherWords(repo: Repo, actor: Actor, q: { grade?: unknown; unit?: unknown; sel?: unknown } = {}): Promise<WordsPage & { ownTeacherId: string | null }> {
  const schoolId = staffSchool(actor);
  const grades = GRADES();
  const sel0 = findSelection(s(q.sel));
  const grade = sel0 ? sel0.grade : grades.includes(Number(q.grade)) ? Number(q.grade) : grades[0];
  const f = filterOf(grade, q.unit, q.sel);
  const tid = await teacherIdOf(repo, actor);
  const view = f.sel ? await selectionWords(repo, schoolId, f.sel, tid ? [tid] : [], tid) : null;
  return { grades, grade, units: f.units, unit: f.unit, selections: f.selections.map((x) => ({ key: x.key, name: x.name, unit: x.unit, words: x.vocabulary.length })), view, ownTeacherId: tid };
}

/** Coverage: the curriculum words explained (a file card or the school's approved card) of all of them. */
export async function wordsCoverage(repo: Repo, schoolId: string): Promise<{ explained: number; total: number; byGrade: { grade: number; explained: number; total: number }[] }> {
  const files = readWordFiles().cards;
  const approved = await safeIfBehind("learn.word-edits", () => repo.findMany("LearnEdit", { schoolId, kind: "WORD", status: "APPROVED" }, { select: ["ref"], take: 5000 }), [] as Row[]);
  const okKeys = new Set([...files.keys(), ...approved.map((r) => s(r.ref))]);
  const byGrade = new Map<number, { grade: number; explained: number; total: number }>();
  const vocabByGrade = new Map<number, Map<string, string[]>>();
  for (const g of GRADES()) vocabByGrade.set(g, await safeIfBehind("learn.vocab", () => schoolVocab(repo, schoolId, g), new Map<string, string[]>()));
  for (const sel of curriculumSelections()) {
    const names = new Set([...sel.vocabulary, ...(vocabByGrade.get(sel.grade)?.get(sel.key) ?? [])].map((w) => w.trim().toLowerCase()).filter(Boolean));
    for (const r of approved) if (s(r.ref).startsWith(`${sel.key}|`)) names.add(s(r.ref).split("|")[3]);
    const row = byGrade.get(sel.grade) ?? { grade: sel.grade, explained: 0, total: 0 };
    for (const w of names) { row.total++; if (okKeys.has(wordKey(sel.key, w))) row.explained++; }
    byGrade.set(sel.grade, row);
  }
  const list = [...byGrade.values()].sort((a, b) => a.grade - b.grade);
  return { explained: list.reduce((n, r) => n + r.explained, 0), total: list.reduce((n, r) => n + r.total, 0), byGrade: list };
}

// ------------------------------------------------------------------ "Practise these words" (5 questions)

export interface WordQuestion { word: string; stem: string; options: string[] }
/** Up to 5 questions from the explained words of the selection (never the answers). */
export function practiceQuestions(view: SelectionView): WordQuestion[] {
  return view.words.filter((w) => w.card).slice(0, PRACTICE_WORDS).map((w) => ({ word: w.word, stem: w.card!.check.stem, options: w.card!.check.options }));
}

/** Marks the selection's practice on the server; an assigned selection is Done once practised. */
export async function submitWordPractice(repo: Repo, actor: Actor, selKey: string, picks: { word: string; choice: number }[], now = new Date()): Promise<{ score: number; total: number; answers: { word: string; answer: number; correct: boolean }[] }> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Students only.");
  const sel = findSelection(selKey);
  if (!sel) throw new ValidationError("Unknown selection.");
  const view = await selectionWords(repo, actor.schoolId, sel, await classTeacherIds(repo, actor.studentId));
  const qs = practiceQuestions(view);
  if (!qs.length) throw new ValidationError("These words have no practice yet.");
  const answers = qs.map((q) => {
    const card = view.words.find((w) => w.word === q.word)!.card!;
    const p = (Array.isArray(picks) ? picks : []).find((x) => s(x?.word) === q.word);
    return { word: q.word, answer: card.check.answer, correct: Number(p?.choice) === card.check.answer };
  });
  const score = answers.filter((a) => a.correct).length;
  const sid = actor.studentId;
  const row = (await repo.findMany("LearnProgress", { studentId: sid, kind: "WORDS", ref: sel.key }, { select: ["id", "best", "attempts"], take: 1 }))[0];
  const data = { score, best: Math.max(score, Number(row?.best ?? 0)), attempts: Number(row?.attempts ?? 0) + 1, finishedAt: now, updatedAt: now };
  if (row) await repo.updateMany("LearnProgress", { id: row.id }, data);
  else await repo.create("LearnProgress", { schoolId: actor.schoolId, studentId: sid, kind: "WORDS", ref: sel.key, level: 0, openedAt: now, neededAgain: false, seconds: 0, ...data });
  await repo.updateMany("LearnAssignee", { studentId: sid, kind: "WORDS", ref: sel.key }, { status: "DONE", updatedAt: now });
  return { score, total: answers.length, answers };
}

// ------------------------------------------------------------------ ✨ AI draft (staff; only the word and the selection's topic are sent)

const SYSTEM = [
  "You write kid-friendly vocabulary cards for Grade 4-6 students in Saudi Arabia learning English (first language Arabic).",
  "Use the selection's topic to choose the right sense of the word. Original content only; accurate; appropriate for Saudi schools.",
  "pos: the part of speech. meaning: at most 14 simple words and it must not use the word itself.",
  "example: one original sentence that fits the topic and uses the word. arabic: a short accurate Arabic meaning.",
  "synonyms / antonyms: 0-3 real ones each. family: real related word forms.",
  "check: a question about the word with 4 different options and the index (0-3) of the correct one.",
  'Reply with JSON only: {"word":"…","pos":"…","meaning":"…","example":"…","arabic":"…","synonyms":[],"antonyms":[],"family":[],"check":{"stem":"…","options":["…","…","…","…"],"answer":0}}',
].join(" ");

/** A draft card from the AI for the teacher to check and save (nothing is saved here). */
export async function aiWordDraft(repo: Repo, actor: Actor, selKey: string, word: string, env: EnvLike): Promise<{ ok: true; card: WordCard } | { ok: false; error: string }> {
  const schoolId = staffSchool(actor);
  const sel = findSelection(selKey);
  if (!sel) throw new ValidationError("Unknown selection.");
  const w = s(word).trim().slice(0, 64);
  if (!w) throw new ValidationError("Unknown word.");
  const { wordProvider, aiRoom } = await import("../vocabulary/meaning");
  const settings = await aiSettings(repo, schoolId);
  const picked = wordProvider(env, settings, { env, timeoutMs: 15_000 });
  if (!picked.ok) return { ok: false, error: "The AI is not set up for this school." };
  const room = await aiRoom(repo, schoolId, settings);
  if (!room.ok) return { ok: false, error: room.reason ?? "The AI is busy. Try again in a minute." };
  const user = { task: "Write the vocabulary card", word: w, selection: sel.name, topic: s(sel.textIdea).slice(0, 600) };
  const r = await callJson(repo, { schoolId, tool: "WORD", picked, items: 1 }, SYSTEM, user, (data) => {
    const c = { ...(data as Record<string, unknown>), word: w } as unknown as WordCard;
    const p = checkWordCard(c, w);
    return p.length ? { ok: false, error: p.slice(0, 3).join("; ") } : { ok: true, value: c };
  }, 1);
  return r.ok ? { ok: true, card: r.value } : { ok: false, error: r.error || "The AI did not give a usable card. Write it yourself." };
}
