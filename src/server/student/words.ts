/**
 * 📖 Click-a-word dictionary and 📒 the word notebook.
 * The meaning comes from the free dictionary API (dictionaryapi.dev, no key) the first time a word is looked up,
 * then from the platform's own table (fast, works offline). Curriculum vocabulary words (the unit lists) are marked;
 * teachers and admins can write or correct any definition — the school's version is then always shown.
 * Every word a student looks up goes into their notebook; a short weekly quiz uses the notebook.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { seededShuffle } from "../practice/items";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;

export interface Meaning { partOfSpeech: string; definition: string; example: string | null; synonyms: string[]; antonyms: string[] }
export interface WordView { word: string; phonetic: string | null; audioUrl: string | null; meanings: Meaning[]; source: "API" | "SCHOOL" | "NONE"; isVocab: boolean }

/** “Running,” → “running”; refuses anything that is not one English word. */
export function cleanWord(raw: string): string | null {
  const w = s(raw).trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/[’]/g, "'");
  return /^[a-z][a-z'-]{0,40}$/.test(w) ? w : null;
}

/** The dictionary API answer → our meanings (at most 4, each with up to 5 synonyms / antonyms). */
export function parseDictionary(json: unknown): { phonetic: string | null; audioUrl: string | null; meanings: Meaning[] } {
  const list = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
  let phonetic: string | null = null, audioUrl: string | null = null;
  const meanings: Meaning[] = [];
  for (const e of list) {
    if (!phonetic && e.phonetic) phonetic = s(e.phonetic);
    for (const p of (Array.isArray(e.phonetics) ? e.phonetics : []) as Record<string, unknown>[]) {
      if (!phonetic && p.text) phonetic = s(p.text);
      if (!audioUrl && typeof p.audio === "string" && /^https:\/\//.test(p.audio)) audioUrl = p.audio;
    }
    for (const m of (Array.isArray(e.meanings) ? e.meanings : []) as Record<string, unknown>[]) {
      const defs = (Array.isArray(m.definitions) ? m.definitions : []) as Record<string, unknown>[];
      const d = defs[0];
      if (!d?.definition || meanings.length >= 4) continue;
      const syn = [...new Set([...((m.synonyms as string[]) ?? []), ...defs.flatMap((x) => (x.synonyms as string[]) ?? [])])].slice(0, 5);
      const ant = [...new Set([...((m.antonyms as string[]) ?? []), ...defs.flatMap((x) => (x.antonyms as string[]) ?? [])])].slice(0, 5);
      const example = s(defs.find((x) => x.example)?.example) || null;
      meanings.push({ partOfSpeech: s(m.partOfSpeech), definition: s(d.definition).slice(0, 400), example: example ? example.slice(0, 300) : null, synonyms: syn, antonyms: ant });
    }
  }
  return { phonetic, audioUrl, meanings };
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const defaultFetch: Fetcher = async (url) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try { return await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } }); } finally { clearTimeout(t); }
};

/** The school's curriculum vocabulary (lowercase). */
export async function vocabWords(repo: Repo, schoolId: string): Promise<Set<string>> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id"] });
  const cur = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id"] }) : [];
  const units = cur.length ? await repo.findMany("Unit", { curriculumId: { in: cur.map((c) => c.id) } }, { select: ["id"] }) : [];
  const lessons = units.length ? await repo.findMany("Lesson", { unitId: { in: units.map((u) => u.id) } }, { select: ["metadata"] }) : [];
  const out = new Set<string>();
  for (const l of lessons) { let m: unknown = l.metadata; if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = null; } } for (const w of ((m as { vocabularyWords?: string[] } | null)?.vocabularyWords ?? [])) { const c = cleanWord(w); if (c) out.add(c); } }
  return out;
}

const viewOf = (r: Row): WordView => {
  let m: unknown = r.meanings; if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = []; } }
  return { word: s(r.word), phonetic: r.phonetic ? s(r.phonetic) : null, audioUrl: r.audioUrl ? s(r.audioUrl) : null, meanings: (Array.isArray(m) ? m : []) as Meaning[], source: s(r.source) as WordView["source"], isVocab: Boolean(r.isVocab) };
};

/** Looks a word up (cache first, then the API) and, for a student, adds it to the notebook. */
export async function lookupWord(repo: Repo, actor: Actor, raw: string, now = new Date(), fetcher: Fetcher = defaultFetch): Promise<WordView> {
  if (!actor.schoolId) throw new ForbiddenError();
  const word = cleanWord(raw);
  if (!word) throw new ValidationError("Choose one English word.");
  let row = await repo.findUnique("WordEntry", { schoolId: actor.schoolId, word });
  const stale = row && s(row.source) === "NONE" && time(row.updatedAt) < now.getTime() - 7 * DAY;
  if (!row || stale) {
    let parsed = { phonetic: null as string | null, audioUrl: null as string | null, meanings: [] as Meaning[] };
    try {
      const r = await fetcher(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (r.ok) parsed = parseDictionary(await r.json());
    } catch { /* offline or slow: keep NONE, try again in a week */ }
    const isVocab = (await vocabWords(repo, actor.schoolId)).has(word);
    const data = { phonetic: parsed.phonetic, audioUrl: parsed.audioUrl, meanings: parsed.meanings, source: parsed.meanings.length ? "API" : "NONE", isVocab, updatedAt: now };
    if (row) await repo.updateMany("WordEntry", { id: row.id }, data); else await repo.create("WordEntry", { schoolId: actor.schoolId, word, ...data });
    row = await repo.findUnique("WordEntry", { schoolId: actor.schoolId, word });
  }
  if (actor.role === "STUDENT" && actor.studentId) {
    const have = await repo.findUnique("StudentWord", { studentId: actor.studentId, word });
    if (have) await repo.updateMany("StudentWord", { studentId: actor.studentId, word }, { lookups: Number(have.lookups) + 1, lastAt: now });
    else await repo.create("StudentWord", { studentId: actor.studentId, word, lookups: 1, firstAt: now, lastAt: now, quizRight: 0, quizWrong: 0 });
  }
  return viewOf(row!);
}

/** A teacher or admin writes / corrects the school's definition (shown before the API's). */
export async function saveDefinition(repo: Repo, actor: Actor, raw: string, input: { partOfSpeech: string; definition: string; example?: string; synonyms?: string; antonyms?: string; isVocab?: boolean }, now = new Date()): Promise<void> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Teachers and admins edit definitions.");
  const word = cleanWord(raw);
  if (!word) throw new ValidationError("Write one English word.");
  const def = s(input.definition).trim();
  if (def.length < 3) throw new ValidationError("Write the definition.");
  const list = (v?: string) => s(v).split(/[,;]/).map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const mine: Meaning = { partOfSpeech: s(input.partOfSpeech).trim().slice(0, 30) || "word", definition: def.slice(0, 400), example: s(input.example).trim().slice(0, 300) || null, synonyms: list(input.synonyms), antonyms: list(input.antonyms) };
  const row = await repo.findUnique("WordEntry", { schoolId: actor.schoolId, word });
  const old = row ? viewOf(row).meanings.filter((m) => m.partOfSpeech !== mine.partOfSpeech) : [];
  const data = { meanings: [mine, ...old].slice(0, 4), source: "SCHOOL", isVocab: input.isVocab ?? Boolean(row?.isVocab), updatedById: actor.userId, updatedAt: now };
  if (row) await repo.updateMany("WordEntry", { id: row.id }, data); else await repo.create("WordEntry", { schoolId: actor.schoolId!, word, phonetic: null, audioUrl: null, ...data });
  await audit(repo, { actorId: actor.userId, action: "word.define", entityType: "WordEntry", entityId: word, after: { definition: mine.definition.slice(0, 120) }, at: now });
}

export async function wordList(repo: Repo, actor: Actor, q = ""): Promise<{ vocab: string[]; entries: WordView[] }> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const rows = await repo.findMany("WordEntry", { schoolId: actor.schoolId });
  const term = cleanWord(q);
  const vocab = [...(await vocabWords(repo, actor.schoolId!))].sort();
  return { vocab: term ? vocab.filter((w) => w.startsWith(term)) : vocab, entries: rows.map(viewOf).filter((w) => !term || w.word.startsWith(term)).sort((a, b) => Number(b.source === "NONE") - Number(a.source === "NONE") || a.word.localeCompare(b.word)).slice(0, 300) };
}

// ------------------------------------------------------------------ notebook & weekly quiz

export interface NotebookWord { word: string; lookups: number; lastAt: string; definition: string | null; partOfSpeech: string | null; known: boolean }

export async function notebook(repo: Repo, actor: Actor): Promise<NotebookWord[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const mine = await repo.findMany("StudentWord", { studentId: actor.studentId });
  const entries = mine.length ? await repo.findMany("WordEntry", { schoolId: actor.schoolId, word: { in: mine.map((w) => s(w.word)) } }) : [];
  return mine.map((w) => { const e = entries.find((x) => x.word === w.word); const m = e ? viewOf(e).meanings[0] : undefined; return { word: s(w.word), lookups: Number(w.lookups), lastAt: new Date(time(w.lastAt)).toISOString(), definition: m?.definition ?? null, partOfSpeech: m?.partOfSpeech ?? null, known: Number(w.quizRight) >= 2 && Number(w.quizRight) > Number(w.quizWrong) }; }).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export interface WordQuizQ { word: string; definition: string; choices: string[] }

/** Up to 8 questions: “Which word means …?”, from the student's notebook words that have a meaning (4+ words). */
export async function wordQuiz(repo: Repo, actor: Actor, now = new Date()): Promise<WordQuizQ[]> {
  const words = (await notebook(repo, actor)).filter((w) => w.definition);
  if (words.length < 4) return [];
  const pick = seededShuffle(words, `${actor.studentId}:${Math.floor(now.getTime() / (7 * DAY))}`).sort((a, b) => Number(a.known) - Number(b.known)).slice(0, 8);
  return pick.map((w) => ({ word: w.word, definition: w.definition!, choices: seededShuffle([w.word, ...seededShuffle(words.filter((x) => x.word !== w.word), w.word).slice(0, 3).map((x) => x.word)], `${w.word}:c`) }));
}

export async function submitWordQuiz(repo: Repo, actor: Actor, answers: Record<string, string>, now = new Date()): Promise<{ correct: number; total: number; review: { word: string; chosen: string; correct: boolean }[] }> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const qs = await wordQuiz(repo, actor, now);
  const review = qs.map((q) => ({ word: q.word, chosen: s(answers[q.word]), correct: s(answers[q.word]) === q.word }));
  for (const r of review) {
    const w = await repo.findUnique("StudentWord", { studentId: actor.studentId, word: r.word });
    if (w) await repo.updateMany("StudentWord", { studentId: actor.studentId, word: r.word }, r.correct ? { quizRight: Number(w.quizRight) + 1, lastQuizAt: now } : { quizWrong: Number(w.quizWrong) + 1, lastQuizAt: now });
  }
  return { correct: review.filter((r) => r.correct).length, total: review.length, review };
}
