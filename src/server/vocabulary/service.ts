/**
 * 📒 Vocabulary learning: daily spaced word review, the word journal (my sentence / not an example), unit words a
 * student stars, the school's Arabic meaning + context sentence per word (with a paste-CSV import), and the
 * context clue coach (the clue types a student misses most, from the tagged question bank).
 */
import { feedVocabulary, safeFeed } from "../practice/skill-evidence";
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertClassRead, readableClasses } from "../teacher/coordinators";
import { CLUE_TYPES, type ClueType } from "../../questions/intelligence";
import { cleanWord, lookupWord, viewOf, type Fetcher, type Meaning } from "../student/words";
import { buildReviewItem, dueList, firstReview, isDue, nextWordReview, startOfDay, type PoolWord, type ReviewItem, type ReviewWord } from "./review";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : s(v)).toISOString() : null);
const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
function student(actor: Actor): string {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Students only.");
  return actor.studentId;
}
const tagsOf = (v: unknown): Record<string, unknown> => {
  let t = v; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
  return t && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : {};
};
/** Does the sentence use the word (or a form of it: brave → bravely, carry → carried)? */
export function usesWord(sentence: string, word: string): boolean {
  const stem = word.length > 4 ? word.slice(0, word.length - 2) : word.replace(/e$/, "");
  return new RegExp(`\\b${stem.replace(/[^a-z'-]/g, "")}`, "i").test(sentence);
}

// ------------------------------------------------------------------ adding words

/** Makes sure the school dictionary knows the word (looks it up once) and the word is in the student's notebook with a schedule. */
async function ensureNotebookWord(repo: Repo, actor: Actor, word: string, now: Date, fetcher?: Fetcher): Promise<Row> {
  const studentId = student(actor);
  if (!(await repo.findUnique("WordEntry", { schoolId: actor.schoolId, word }))) await lookupWord(repo, actor, word, now, fetcher);
  let sw = await repo.findUnique("StudentWord", { studentId, word });
  if (!sw) { await repo.create("StudentWord", { studentId, word, lookups: 0, firstAt: now, lastAt: now, quizRight: 0, quizWrong: 0, ...firstReview(now) }); sw = await repo.findUnique("StudentWord", { studentId, word }); }
  else if (!sw.nextReviewAt) { await repo.updateMany("StudentWord", { studentId, word }, firstReview(now)); sw = await repo.findUnique("StudentWord", { studentId, word }); }
  return sw!;
}

/** The unit vocabulary of the student's grade, by unit, with ⭐ for words already in the notebook. */
export async function unitWords(repo: Repo, actor: Actor): Promise<{ unit: string; words: { word: string; inNotebook: boolean }[] }[]> {
  const studentId = student(actor);
  const st = await repo.findUnique("Student", { id: studentId });
  const cur = st ? await repo.findMany("Curriculum", { gradeId: st.gradeId, deletedAt: null }, { select: ["id"] }) : [];
  const units = cur.length ? await repo.findMany("Unit", { curriculumId: { in: cur.map((c) => c.id) }, deletedAt: null }, { select: ["id", "number", "title"] }) : [];
  const lessons = units.length ? await repo.findMany("Lesson", { unitId: { in: units.map((u) => u.id) }, deletedAt: null }, { select: ["unitId", "metadata"] }) : [];
  const mine = new Set((await repo.findMany("StudentWord", { studentId }, { select: ["word"] })).map((w) => s(w.word)));
  const out: { unit: string; words: { word: string; inNotebook: boolean }[] }[] = [];
  for (const u of units.sort((a, b) => Number(a.number) - Number(b.number))) {
    const set = new Set<string>();
    for (const l of lessons.filter((x) => x.unitId === u.id)) for (const w of (tagsOf(l.metadata).vocabularyWords as string[] | undefined) ?? []) { const c = cleanWord(w); if (c) set.add(c); }
    if (set.size) out.push({ unit: `Unit ${Number(u.number)} · ${s(u.title)}`, words: [...set].sort().map((word) => ({ word, inNotebook: mine.has(word) })) });
  }
  return out;
}

/** ⭐ A student stars a unit vocabulary word of their grade: it joins the notebook and the review. */
export async function starWord(repo: Repo, actor: Actor, raw: string, now = new Date(), fetcher?: Fetcher): Promise<string> {
  student(actor);
  const word = cleanWord(raw);
  if (!word) throw new ValidationError("Choose one English word.");
  const all = new Set((await unitWords(repo, actor)).flatMap((u) => u.words.map((w) => w.word)));
  if (!all.has(word)) throw new ValidationError("That word is not on your unit word lists.");
  await ensureNotebookWord(repo, actor, word, now, fetcher);
  return word;
}

/** ✍️ Word journal: the student adds a word with their own sentence and a sentence that is NOT an example. */
export async function addJournalWord(repo: Repo, actor: Actor, input: { word: string; myExample: string; notExample?: string }, now = new Date(), fetcher?: Fetcher): Promise<string> {
  const studentId = student(actor);
  const word = cleanWord(input.word);
  if (!word) throw new ValidationError("Write one English word.");
  const mine = s(input.myExample).replace(/\s+/g, " ").trim();
  const not = s(input.notExample).replace(/\s+/g, " ").trim();
  if (mine.split(" ").length < 3) throw new ValidationError("Write a sentence of your own (3 words or more) that uses the word.");
  if (!usesWord(mine, word)) throw new ValidationError(`Your sentence must use the word “${word}”.`);
  if (mine.length > 300 || not.length > 300) throw new ValidationError("Keep each sentence under 300 letters.");
  if (not && not.toLowerCase() === mine.toLowerCase()) throw new ValidationError("The “not an example” sentence must be different.");
  await ensureNotebookWord(repo, actor, word, now, fetcher);
  await repo.updateMany("StudentWord", { studentId, word }, { myExample: mine, notExample: not || null, lastAt: now });
  return word;
}

// ------------------------------------------------------------------ daily review

async function pool(repo: Repo, schoolId: string): Promise<{ byWord: Map<string, Row>; pool: PoolWord[] }> {
  const rows = await repo.findMany("WordEntry", { schoolId }, { select: ["word", "meanings", "source", "isVocab", "contextSentence", "arabicGloss", "phonetic", "audioUrl"] });
  const byWord = new Map(rows.map((r) => [s(r.word), r]));
  const out: PoolWord[] = [];
  for (const r of rows) { const v = viewOf(r); const m = v.meanings[0]; if (m?.definition) out.push({ word: v.word, partOfSpeech: m.partOfSpeech || null, definition: m.definition, sentence: v.contextSentence ?? m.example ?? null }); }
  return { byWord, pool: out };
}

/** One notebook word → what the review needs (null when the word has no meaning yet). */
export function reviewWordOf(sw: Row, entry: Row | undefined): ReviewWord | null {
  if (!entry) return null;
  const v = viewOf(entry); const m: Meaning | undefined = v.meanings[0];
  if (!m?.definition) return null;
  const sentence = v.contextSentence ?? m.example ?? null;
  const schoolNon = m.nonExample ?? null;
  return {
    word: v.word, partOfSpeech: m.partOfSpeech || null, definition: m.definition, sentence,
    example: sw.myExample ? s(sw.myExample) : schoolNon ? sentence : null,
    nonExample: sw.notExample ? s(sw.notExample) : schoolNon,
    reviewStep: Number(sw.reviewStep ?? 0),
  };
}

export interface ReviewToday { items: ReviewItem[]; reviewedToday: number; dueTotal: number; nextDueAt: string | null; notebookSize: number }

/** 🔁 Today's review: up to 10 due words (fewer when some were already reviewed today), each as a quiz item. */
export async function reviewToday(repo: Repo, actor: Actor, now = new Date()): Promise<ReviewToday> {
  const studentId = student(actor);
  const mine = await repo.findMany("StudentWord", { studentId });
  const { byWord, pool: p } = await pool(repo, actor.schoolId!);
  const day = startOfDay(now);
  const reviewedToday = mine.filter((w) => w.lastQuizAt && new Date(iso(w.lastQuizAt)!).getTime() >= day.getTime()).length;
  const ready = mine.map((w) => ({ row: w, rw: reviewWordOf(w, byWord.get(s(w.word))), word: s(w.word), nextReviewAt: iso(w.nextReviewAt) })).filter((x) => x.rw);
  const dueAll = ready.filter((x) => isDue(x.nextReviewAt, now));
  const items: ReviewItem[] = [];
  for (const x of dueList(ready, reviewedToday, now)) { const it = buildReviewItem(x.rw!, p, `${studentId}:${x.word}:${day.toISOString().slice(0, 10)}`); if (it) items.push(it); }
  const later = ready.filter((x) => !isDue(x.nextReviewAt, now)).map((x) => x.nextReviewAt!).sort();
  return { items, reviewedToday, dueTotal: dueAll.length, nextDueAt: later[0] ?? null, notebookSize: mine.length };
}

export interface ReviewResult { word: string; chosen: string; correct: boolean; answer: string; nextReviewAt: string; reviewStep: number }

/** Checks today's review answers (word → chosen text); right → next step, wrong → back to step 1 (tomorrow). */
export async function submitWordReview(repo: Repo, actor: Actor, answers: Record<string, string>, now = new Date()): Promise<{ correct: number; total: number; results: ReviewResult[] }> {
  const studentId = student(actor);
  const today = await reviewToday(repo, actor, now);
  const results: ReviewResult[] = [];
  for (const it of today.items) {
    if (!(it.word in answers)) continue;
    const chosen = s(answers[it.word]);
    const correct = chosen.trim() === it.answer.trim();
    const sw = await repo.findUnique("StudentWord", { studentId, word: it.word });
    if (!sw) continue;
    const next = nextWordReview(Number(sw.reviewStep ?? 0), correct, now);
    await repo.updateMany("StudentWord", { studentId, word: it.word }, { ...(correct ? { quizRight: Number(sw.quizRight) + 1 } : { quizWrong: Number(sw.quizWrong) + 1 }), lastQuizAt: now, ...next });
    results.push({ word: it.word, chosen, correct, answer: it.answer, nextReviewAt: next.nextReviewAt.toISOString(), reviewStep: next.reviewStep });
  }
  // 🔗 word reviews feed the grade's Concept Vocabulary skill, when the curriculum has one (Update 39B)
  await safeFeed("vocabulary", () => feedVocabulary(repo, studentId, results.map((r) => ({ word: r.word, correct: r.correct })), now));
  return { correct: results.filter((r) => r.correct).length, total: results.length, results };
}

// ------------------------------------------------------------------ teacher: class word journals (read-only)

export interface JournalEntry { studentId: string; studentName: string; word: string; definition: string | null; myExample: string; notExample: string | null; at: string | null }

export async function journalClasses(repo: Repo, actor: Actor): Promise<{ id: string; name: string }[]> {
  if (!isStaff(actor)) throw new ForbiddenError();
  return (await readableClasses(repo, actor)).map((c) => ({ id: s(c.id), name: s(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The word journals of one class the teacher may read (students' own sentences). */
export async function classJournal(repo: Repo, actor: Actor, classId: string): Promise<JournalEntry[]> {
  if (!isStaff(actor)) throw new ForbiddenError();
  await assertClassRead(repo, actor, classId);
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  if (!ids.length) return [];
  const rows = (await repo.findMany("StudentWord", { studentId: { in: ids } })).filter((w) => w.myExample);
  if (!rows.length) return [];
  const studs = await repo.findMany("Student", { id: { in: [...new Set(rows.map((r) => s(r.studentId)))] } }, { select: ["id", "userId"] });
  const users = await repo.findMany("User", { id: { in: studs.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] });
  const name = (sid: string) => s(users.find((u) => u.id === studs.find((x) => x.id === sid)?.userId)?.displayName) || "Student";
  const entries = await repo.findMany("WordEntry", { schoolId: actor.schoolId, word: { in: [...new Set(rows.map((r) => s(r.word)))] } });
  return rows.map((r) => {
    const e = entries.find((x) => x.word === r.word);
    return { studentId: s(r.studentId), studentName: name(s(r.studentId)), word: s(r.word), definition: e ? viewOf(e).meanings[0]?.definition ?? null : null, myExample: s(r.myExample), notExample: r.notExample ? s(r.notExample) : null, at: iso(r.lastAt) };
  }).sort((a, b) => a.studentName.localeCompare(b.studentName) || a.word.localeCompare(b.word));
}

// ------------------------------------------------------------------ dictionary admin: Arabic meaning, context sentence, CSV

/** A teacher / admin sets the Arabic meaning and the context sentence of one word (this school only). */
export async function saveWordExtras(repo: Repo, actor: Actor, raw: string, input: { arabicGloss?: string; contextSentence?: string }, now = new Date()): Promise<void> {
  if (!isStaff(actor) || !actor.schoolId) throw new ForbiddenError("Teachers and admins edit the dictionary.");
  const word = cleanWord(raw);
  if (!word) throw new ValidationError("Write one English word.");
  const data = extras(word, input);
  const row = await repo.findUnique("WordEntry", { schoolId: actor.schoolId, word });
  if (row) await repo.updateMany("WordEntry", { id: row.id }, { ...data, updatedById: actor.userId, updatedAt: now });
  else await repo.create("WordEntry", { schoolId: actor.schoolId, word, phonetic: null, audioUrl: null, meanings: [], source: "NONE", isVocab: false, ...data, updatedById: actor.userId, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "word.extras", entityType: "WordEntry", entityId: word, after: { arabicGloss: data.arabicGloss, contextSentence: data.contextSentence?.slice(0, 120) ?? null }, at: now });
}

function extras(word: string, input: { arabicGloss?: string; contextSentence?: string }): { arabicGloss: string | null; contextSentence: string | null } {
  const gloss = s(input.arabicGloss).replace(/\s+/g, " ").trim();
  const ctx = s(input.contextSentence).replace(/\s+/g, " ").trim();
  if (gloss.length > 200) throw new ValidationError("Keep the Arabic meaning under 200 letters.");
  if (ctx.length > 300) throw new ValidationError("Keep the context sentence under 300 letters.");
  if (ctx && !usesWord(ctx, word)) throw new ValidationError(`The context sentence must use the word “${word}”.`);
  return { arabicGloss: gloss || null, contextSentence: ctx || null };
}

/** Minimal CSV: commas, "quoted, fields" and "" escapes; blank lines skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  const src = s(text).replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"' && src[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim())); row = []; }
    else f += c;
  }
  row.push(f); if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim()));
  return rows;
}

/**
 * Paste-CSV import: columns word, definition, contextSentence, arabicGloss (an optional 5th: partOfSpeech).
 * A header row is skipped. An empty cell keeps what the dictionary has. At most 500 rows.
 */
export async function importWordsCsv(repo: Repo, actor: Actor, text: string, now = new Date()): Promise<{ saved: number; errors: string[] }> {
  if (!isStaff(actor) || !actor.schoolId) throw new ForbiddenError("Teachers and admins edit the dictionary.");
  let rows = parseCsv(text);
  if (rows[0] && /^word$/i.test(rows[0][0] ?? "")) rows = rows.slice(1);
  if (!rows.length) throw new ValidationError("Paste at least one row: word, definition, contextSentence, arabicGloss.");
  if (rows.length > 500) throw new ValidationError("At most 500 rows at a time.");
  const errors: string[] = []; let saved = 0;
  for (const [i, r] of rows.entries()) {
    const [w, def = "", ctx = "", gloss = "", posIn = ""] = r;
    const word = cleanWord(w ?? "");
    if (!word) { errors.push(`Row ${i + 1}: “${w}” is not one English word.`); continue; }
    try {
      const row = await repo.findUnique("WordEntry", { schoolId: actor.schoolId, word });
      const old = row ? viewOf(row) : null;
      const ex = extras(word, { arabicGloss: gloss || old?.arabicGloss || "", contextSentence: ctx || old?.contextSentence || "" });
      const data: Row = { ...ex, updatedById: actor.userId, updatedAt: now };
      if (def.trim()) {
        if (def.trim().length < 3) throw new ValidationError("the definition is too short");
        const pos = posIn.trim().slice(0, 30) || old?.meanings[0]?.partOfSpeech || "word";
        const prev = old?.meanings.find((m) => m.partOfSpeech === pos);
        const mine: Meaning = { partOfSpeech: pos, definition: def.trim().slice(0, 400), example: prev?.example ?? null, synonyms: prev?.synonyms ?? [], antonyms: prev?.antonyms ?? [], ...(prev?.nonExample ? { nonExample: prev.nonExample } : {}) };
        data.meanings = [mine, ...(old?.meanings ?? []).filter((m) => m.partOfSpeech !== pos)].slice(0, 4);
        data.source = "SCHOOL";
      }
      if (row) await repo.updateMany("WordEntry", { id: row.id }, data);
      else await repo.create("WordEntry", { schoolId: actor.schoolId, word, phonetic: null, audioUrl: null, meanings: data.meanings ?? [], source: data.source ?? "NONE", isVocab: false, ...data });
      saved++;
    } catch (e) { if (e instanceof ValidationError) errors.push(`Row ${i + 1} (${word}): ${e.message}`); else throw e; }
  }
  await audit(repo, { actorId: actor.userId, action: "word.import", entityType: "WordEntry", entityId: "csv", after: { saved, errors: errors.length }, at: now });
  return { saved, errors };
}

// ------------------------------------------------------------------ context clue coach

export const CLUE_LABELS: Record<ClueType, { label: string; tip: string; example: string }> = {
  DEFINITION: { label: "Definition", tip: "The sentence tells you the meaning, often after “is”, “means” or “which is”.", example: "A burrow, which is a hole an animal digs to live in, kept the rabbits warm." },
  RESTATEMENT: { label: "Restatement", tip: "The writer says it again in easier words, after a comma, a dash or “or”.", example: "Omar was weary — very tired — after the long climb." },
  EXAMPLE: { label: "Examples", tip: "Look for “such as”, “like” or “for example”: the examples show what the word means.", example: "We packed provisions such as bread, dates and water for the trip." },
  SYNONYM: { label: "Synonym", tip: "A nearby word means almost the same thing.", example: "The path was narrow. It was so thin that we walked in a line." },
  ANTONYM: { label: "Antonym", tip: "Look for “but”, “however” or “unlike”: a nearby word means the opposite.", example: "Sara was timid at first, but by the end of the year she was bold." },
  CAUSE_EFFECT: { label: "Cause and effect", tip: "Look for “because”, “so” or “as a result”: what happened explains the word.", example: "The ground was parched, so the farmer's plants needed water every day." },
  COMPARISON: { label: "Comparison", tip: "Look for “like”, “as” or “similar to”: the word is compared to something you know.", example: "The baby's skin was as delicate as a flower petal." },
  PARAGRAPH: { label: "Clues in the paragraph", tip: "Read the sentences before and after: the clue may be in another sentence.", example: "The room was in chaos. Toys lay everywhere and books were on the floor. Nobody could find anything." },
  GRAMMAR_POS: { label: "Word part / part of speech", tip: "Ask what job the word does in the sentence (a thing? an action? a describing word?) and look at its parts.", example: "She spoke softly so the sleeping baby would not wake." },
  NONE: { label: "No clue", tip: "", example: "" },
};

export interface ClueStat { type: ClueType; label: string; right: number; total: number; accuracy: number | null; questions: number }
export interface ClueCoach { stats: ClueStat[]; focus: ClueStat | null; questionIds: string[]; practiceSkillId: string | null; practiceSkillName: string | null }

/** Weakest first: smoothed accuracy (right+1)/(total+2), then fewer answers, then the usual clue order. */
export function rankClueTypes(stats: ClueStat[]): ClueStat[] {
  const score = (x: ClueStat) => (x.right + 1) / (x.total + 2);
  return [...stats].sort((a, b) => score(a) - score(b) || a.total - b.total || CLUE_TYPES.indexOf(a.type) - CLUE_TYPES.indexOf(b.type));
}

/**
 * 🔎 Context clue coach: the published questions of the student's grade tagged with a clue type, the student's
 * accuracy per clue type, and the type to practise next (the one missed most). Up to 5 question ids of that type,
 * not yet answered first.
 */
export async function clueCoach(repo: Repo, actor: Actor): Promise<ClueCoach> {
  const studentId = student(actor);
  const st = await repo.findUnique("Student", { id: studentId });
  const cur = st ? await repo.findMany("Curriculum", { gradeId: st.gradeId, deletedAt: null }, { select: ["id"] }) : [];
  const skills = cur.length ? await repo.findMany("Skill", { curriculumId: { in: cur.map((c) => c.id) }, deletedAt: null }, { select: ["id", "code", "name"] }) : [];
  const qs = skills.length ? await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED" }, { select: ["id", "skillId", "tags"] }) : [];
  const tagged = qs.map((q) => ({ id: s(q.id), skillId: s(q.skillId), type: s(tagsOf(q.tags).clueType).toUpperCase() as ClueType })).filter((q) => (CLUE_TYPES as readonly string[]).includes(q.type) && q.type !== "NONE");
  const empty: ClueCoach = { stats: [], focus: null, questionIds: [], practiceSkillId: null, practiceSkillName: null };
  if (!tagged.length) return empty;
  const attempts = await repo.findMany("QuestionAttempt", { studentId, questionId: { in: tagged.map((q) => q.id) } }, { select: ["questionId", "isCorrect", "createdAt"] });
  const stats: ClueStat[] = [];
  for (const type of CLUE_TYPES) {
    const ids = new Set(tagged.filter((q) => q.type === type).map((q) => q.id));
    if (!ids.size) continue;
    const mine = attempts.filter((a) => ids.has(s(a.questionId)));
    const right = mine.filter((a) => Boolean(a.isCorrect)).length;
    stats.push({ type, label: CLUE_LABELS[type].label, right, total: mine.length, accuracy: mine.length ? Math.round((100 * right) / mine.length) : null, questions: ids.size });
  }
  const ranked = rankClueTypes(stats);
  const focus = ranked[0] ?? null;
  const last = new Map<string, number>();
  for (const a of attempts) last.set(s(a.questionId), Math.max(last.get(s(a.questionId)) ?? 0, new Date(iso(a.createdAt)!).getTime()));
  const pick = focus ? tagged.filter((q) => q.type === focus.type).sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) || a.id.localeCompare(b.id)).slice(0, 5) : [];
  // practise in the grade's context-clues skill when there is one, else the skill most of these questions belong to
  const cc = skills.find((k) => /\.context-clues$/.test(s(k.code)) && tagged.some((q) => q.skillId === k.id)) ?? skills.find((k) => /\.context-clues$/.test(s(k.code)));
  const counts = new Map<string, number>(); for (const q of pick) counts.set(q.skillId, (counts.get(q.skillId) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const skill = skills.find((k) => k.id === top) ?? cc ?? null;
  return { stats: ranked, focus, questionIds: pick.map((q) => q.id), practiceSkillId: skill ? s(skill.id) : null, practiceSkillName: skill ? s(skill.name) : null };
}
