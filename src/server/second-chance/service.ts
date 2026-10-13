/**
 * ⭐ Second Chance: every question a student answered WRONG and has not answered correctly since.
 *
 * Sources (all read with bounded, column-limited queries) — EVERY path that serves a bank question feeds it:
 *   QuestionAttempt   practice / My Work, assigned sets, tests, the Diagnostic, placement, ReadMaster, lessons
 *   QotdAnswer        Question of the Day (bank questions)
 *   ExitTicketAnswer  exit tickets
 *   MapSimAnswer      MAP practice tests (finished ones)
 *   SecondChanceAnswer source GAME: questions missed in games (solo rounds, live games; games write no attempts)
 *   RRRun.answers     ReadRise quizzes (RRQuestion, kept as "rr:<id>")
 * One entry per question: copies of one question (same fingerprint, or same stem + correct answer, stored under
 * other skills, grades or map places) are ONE entry, and answering any copy correctly fixes it. Second Chance is the
 * only place a missed question is shown again (practice, sets and tests never bring it back).
 * A question is FIXED when, after its last wrong answer, there is a correct normal answer or a correct
 * SecondChanceAnswer. Second Chance answers are practice only: they are stored in SecondChanceAnswer and never in
 * the attempt tables, so levels, mastery, tiers, reports and norms never see them.
 * Questions of a test the student has not finished yet are left out until the test is over.
 */
import type { Repo, Row } from "../seeding/repo";
import { safeIfBehind } from "../db/schema-errors";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { loadQuestionItems, toClientQuestion, type ClientQuestion } from "../practice/items";
import { gradeItems } from "../teacher/worksheet";
import { contentKeysForIds } from "../questions/fresh";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;

/** how far back mistakes are looked for, and the most rows read per source (bounded queries) */
export const LOOKBACK_DAYS = 365;
export const MAX_ROWS = 4000;
export const MAX_RR_RUNS = 80;
export const PAGE_SIZE = 20;
export const RR_PREFIX = "rr:";
const LETTERS = ["A", "B", "C", "D"];

export type ChanceSource = "PRACTICE" | "TEST" | "READMASTER" | "READRISE" | "QOTD" | "EXIT" | "GAME";

/** Marks a SecondChanceAnswer row that is a missed GAME question (not an answer given in Second Chance). */
export const GAME_MISS = "GAME";

/** Questions missed in a game: they wait in Second Chance (no attempt, level or mastery change). */
export async function recordGameMisses(repo: Repo, studentId: string, questionIds: string[], now = new Date()): Promise<number> {
  const ids = [...new Set(questionIds.map(s).filter(Boolean))].slice(0, 200);
  if (!ids.length || !studentId) return 0;
  return repo.createMany("SecondChanceAnswer", ids.map((questionId) => ({ studentId, questionId, correct: false, source: GAME_MISS, createdAt: now })));
}

/** one answer from any source, reduced to what Second Chance needs */
export interface AnswerEvent { studentId: string; key: string; skillKey: string; correct: boolean; at: number; source: ChanceSource }

/** ReadRise skill codes → a readable name (central-idea → Central idea) */
export const rrSkillName = (code: string) => `ReadRise · ${(code.charAt(0).toUpperCase() + code.slice(1)).replace(/-/g, " ")}`;

const asJson = (v: unknown): unknown => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } };

async function inChunks<T>(ids: string[], size: number, fn: (c: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

/**
 * Every answer of these students from every source (newest first, at most MAX_ROWS per source).
 * `wrongOnly` reads only the wrong answers (the teacher's repeated-mistakes view). `everySource` adds the exit tickets,
 * games and MAP practice tests (Second Chance itself; the teacher's view keeps its sources).
 */
export async function answerEvents(repo: Repo, studentIds: string[], opts: { now?: Date; wrongOnly?: boolean; everySource?: boolean } = {}): Promise<AnswerEvent[]> {
  if (!studentIds.length) return [];
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY);
  const who = studentIds.length === 1 ? studentIds[0] : { in: studentIds };
  const [attempts, qotd, runs, open, exits, games, sims] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: who, createdAt: { gte: since }, ...(opts.wrongOnly ? { isCorrect: false } : {}) },
      { select: ["studentId", "questionId", "skillId", "isCorrect", "createdAt", "sessionId", "source"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_ROWS }),
    repo.findMany("QotdAnswer", { studentId: who, createdAt: { gte: since }, ...(opts.wrongOnly ? { correct: false } : {}) },
      { select: ["studentId", "questionId", "skillId", "correct", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_ROWS }),
    repo.findMany("RRRun", { studentId: who, startedAt: { gte: since } },
      { select: ["studentId", "articleId", "band", "answers", "score", "startedAt"], orderBy: [{ field: "startedAt", dir: "desc" }], take: MAX_RR_RUNS * studentIds.length }),
    // tests still being taken: their questions wait until the test is over
    repo.findMany("PracticeSession", { studentId: who, endedAt: null }, { select: ["id", "assessmentId"], take: 200 }),
    !opts.everySource ? Promise.resolve([] as Row[]) : repo.findMany("ExitTicketAnswer", { studentId: who, createdAt: { gte: since }, ...(opts.wrongOnly ? { isCorrect: false } : {}) },
      { select: ["studentId", "questionId", "isCorrect", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_ROWS }),
    !opts.everySource ? Promise.resolve([] as Row[]) : safeIfBehind("second-chance.games", repo.findMany("SecondChanceAnswer", { studentId: who, source: GAME_MISS, createdAt: { gte: since } },
      { select: ["studentId", "questionId", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_ROWS }), [] as Row[]),
    // MAP practice tests: only finished ones (like other tests)
    !opts.everySource ? Promise.resolve([] as Row[]) : repo.findMany("MapSimSession", { studentId: who, status: "DONE", startedAt: { gte: since } }, { select: ["id", "studentId"], take: 50 * studentIds.length }),
  ]);
  const openTests = new Set(open.filter((x) => x.assessmentId).map((x) => s(x.id)));
  // which sessions are tests (for the source label): only the sessions of the rows read
  const sesIds = [...new Set(attempts.map((a) => s(a.sessionId)))];
  const tests = new Set((await inChunks(sesIds, 500, (c) => repo.findMany("PracticeSession", { id: { in: c } }, { select: ["id", "assessmentId"] }))).filter((x) => x.assessmentId).map((x) => s(x.id)));

  const out: AnswerEvent[] = [];
  for (const a of attempts) {
    if (openTests.has(s(a.sessionId))) continue;
    const src: ChanceSource = tests.has(s(a.sessionId)) ? "TEST" : s(a.source) === "READMASTER" ? "READMASTER" : "PRACTICE";
    out.push({ studentId: s(a.studentId), key: s(a.questionId), skillKey: s(a.skillId), correct: Boolean(a.isCorrect), at: time(a.createdAt), source: src });
  }
  for (const q of qotd) out.push({ studentId: s(q.studentId), key: s(q.questionId), skillKey: s(q.skillId), correct: Boolean(q.correct), at: time(q.createdAt), source: "QOTD" });
  for (const x of exits) out.push({ studentId: s(x.studentId), key: s(x.questionId), skillKey: "", correct: Boolean(x.isCorrect), at: time(x.createdAt), source: "EXIT" });
  for (const g of games) out.push({ studentId: s(g.studentId), key: s(g.questionId), skillKey: "", correct: false, at: time(g.createdAt), source: "GAME" });
  if (sims.length) {
    const who2 = new Map(sims.map((x) => [s(x.id), s(x.studentId)]));
    const rows = await inChunks(sims.map((x) => s(x.id)), 500, (c) => repo.findMany("MapSimAnswer", { sessionId: { in: c }, ...(opts.wrongOnly ? { isCorrect: false } : {}) }, { select: ["sessionId", "questionId", "isCorrect", "createdAt"], take: MAX_ROWS }));
    for (const a of rows) out.push({ studentId: who2.get(s(a.sessionId)) ?? "", key: s(a.questionId), skillKey: "", correct: Boolean(a.isCorrect), at: time(a.createdAt), source: "TEST" });
  }

  const scored = runs.filter((r) => r.score !== null && r.score !== undefined && asJson(r.answers));
  if (scored.length) {
    const articleIds = [...new Set(scored.map((r) => s(r.articleId)))];
    const rq = await inChunks(articleIds, 200, (c) => repo.findMany("RRQuestion", { articleId: { in: c } }, { select: ["id", "articleId", "band", "number", "answer", "skill"] }));
    for (const r of scored) {
      const answers = (asJson(r.answers) ?? {}) as Record<string, unknown>;
      for (const q of rq) {
        if (q.articleId !== r.articleId || q.band !== r.band) continue;
        const chosen = s(answers[s(q.number)]).toUpperCase();
        if (!chosen) continue;
        const ok = chosen === s(q.answer);
        if (opts.wrongOnly && ok) continue;
        out.push({ studentId: s(r.studentId), key: RR_PREFIX + s(q.id), skillKey: RR_PREFIX + s(q.skill), correct: ok, at: time(r.startedAt), source: "READRISE" });
      }
    }
  }
  return out;
}

export interface PendingQuestion { key: string; skillKey: string; source: ChanceSource; lastWrongAt: number; wrongCount: number }

/** The student's questions still waiting (newest mistake first), checked against the bank (published questions only). */
export async function pendingMistakes(repo: Repo, studentId: string, now = new Date()): Promise<PendingQuestion[]> {
  const [events, sc] = await Promise.all([
    answerEvents(repo, [studentId], { now, everySource: true }),
    repo.findMany("SecondChanceAnswer", { studentId, correct: true }, { select: ["questionId", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_ROWS }),
  ]);
  const fixedAt = new Map<string, number>();
  for (const x of sc) fixedAt.set(s(x.questionId), Math.max(fixedAt.get(s(x.questionId)) ?? 0, time(x.createdAt)));
  const by = new Map<string, { wrong: AnswerEvent | null; wrongCount: number; lastRight: number }>();
  for (const e of events) {
    const v = by.get(e.key) ?? { wrong: null, wrongCount: 0, lastRight: 0 };
    if (e.correct) v.lastRight = Math.max(v.lastRight, e.at);
    else { v.wrongCount++; if (!v.wrong || e.at > v.wrong.at) v.wrong = e; }
    by.set(e.key, v);
  }
  // 👯 one entry per CONTENT: copies of one question (same fingerprint, or same stem + correct answer) form one group;
  // the group is fixed when any of its copies was answered correctly (or fixed here) after the group's last mistake
  const wrongIds = [...by].filter(([k, v]) => v.wrong && !k.startsWith(RR_PREFIX)).map(([k]) => k);
  const keysOf = await contentKeysForIds(repo, wrongIds);
  const rootOf = new Map<string, string>(), rootByKey = new Map<string, string>();
  for (const id of wrongIds) {
    const root = (keysOf.get(id) ?? []).map((k) => rootByKey.get(k)).find(Boolean) ?? id;
    rootOf.set(id, root);
    for (const k of keysOf.get(id) ?? []) if (!rootByKey.has(k)) rootByKey.set(k, root);
  }
  const groups = new Map<string, string[]>();
  for (const [key, v] of by) if (v.wrong) { const r = rootOf.get(key) ?? key; const l = groups.get(r); if (l) l.push(key); else groups.set(r, [key]); }
  // only questions that can still be shown: published bank questions (their skill from the bank)
  const bankIds = [...groups.values()].flat().filter((k) => !k.startsWith(RR_PREFIX));
  const live = new Map((await inChunks(bankIds, 500, (c) => repo.findMany("Question", { id: { in: c }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId"] }))).map((q) => [s(q.id), s(q.skillId)]));
  const pending: PendingQuestion[] = [];
  for (const members of groups.values()) {
    const vs = members.map((k) => ({ k, v: by.get(k)! }));
    const lastWrong = Math.max(...vs.map((x) => x.v.wrong!.at));
    const fixed = Math.max(...vs.map((x) => Math.max(x.v.lastRight, fixedAt.get(x.k) ?? 0)));
    if (fixed > lastWrong) continue;
    // the copy shown: one that can still be shown, the latest mistake first
    const shown = vs.filter((x) => x.k.startsWith(RR_PREFIX) || live.has(x.k)).sort((a, b) => b.v.wrong!.at - a.v.wrong!.at)[0];
    if (!shown) continue;
    const w = shown.v.wrong!;
    pending.push({ key: shown.k, skillKey: shown.k.startsWith(RR_PREFIX) ? w.skillKey : live.get(shown.k) || w.skillKey, source: w.source, lastWrongAt: lastWrong, wrongCount: vs.reduce((t, x) => t + x.v.wrongCount, 0) });
  }
  return pending.sort((a, b) => b.lastWrongAt - a.lastWrongAt);
}

/** The number of questions waiting (for a menu badge). */
export async function secondChanceCount(repo: Repo, studentId: string, now = new Date()): Promise<number> {
  return (await pendingMistakes(repo, studentId, now)).length;
}

/** skill keys → names (bank skills and ReadRise skill codes) */
export async function skillNames(repo: Repo, keys: string[]): Promise<Map<string, string>> {
  const bank = [...new Set(keys.filter((k) => k && !k.startsWith(RR_PREFIX)))];
  const rows = await inChunks(bank, 500, (c) => repo.findMany("Skill", { id: { in: c } }, { select: ["id", "name"] }));
  const m = new Map(rows.map((r) => [s(r.id), s(r.name)]));
  for (const k of keys) if (k.startsWith(RR_PREFIX)) m.set(k, rrSkillName(k.slice(RR_PREFIX.length)));
  return m;
}

// ------------------------------------------------------------------ the student's page

export interface ChanceQuestion { key: string; skill: string; source: ChanceSource; q: ClientQuestion }
export interface ChanceGroup { key: string; name: string; count: number }
export interface SecondChanceView { total: number; groups: ChanceGroup[]; skill: string; questions: ChanceQuestion[]; page: number; pages: number; fixed: number }

function student(actor: Actor): string {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  return actor.studentId;
}

/** A ReadRise question as a multiple-choice question (with the text the student read). */
async function rrQuestions(repo: Repo, studentId: string, keys: string[]): Promise<Map<string, ClientQuestion>> {
  const out = new Map<string, ClientQuestion>();
  const ids = keys.map((k) => k.slice(RR_PREFIX.length));
  if (!ids.length) return out;
  const qs = await repo.findMany("RRQuestion", { id: { in: ids } }, { select: ["id", "articleId", "band", "stem", "options"] });
  const articleIds = [...new Set(qs.map((q) => s(q.articleId)))];
  const [runs, articles] = await Promise.all([
    articleIds.length ? repo.findMany("RRRun", { studentId, articleId: { in: articleIds } }, { select: ["articleId", "band", "versionLevel", "startedAt"], orderBy: [{ field: "startedAt", dir: "desc" }], take: 200 }) : Promise.resolve([] as Row[]),
    articleIds.length ? repo.findMany("RRArticle", { id: { in: articleIds } }, { select: ["id", "title"] }) : Promise.resolve([] as Row[]),
  ]);
  const versions = articleIds.length ? await repo.findMany("RRVersion", { articleId: { in: articleIds } }, { select: ["articleId", "level", "title", "body"] }) : [];
  for (const q of qs) {
    const run = runs.find((r) => r.articleId === q.articleId && r.band === q.band);
    const v = versions.find((x) => x.articleId === q.articleId && Number(x.level) === Number(run?.versionLevel));
    const opts = (asJson(q.options) ?? []) as unknown[];
    out.set(RR_PREFIX + s(q.id), {
      questionId: RR_PREFIX + s(q.id), type: "MULTIPLE_CHOICE", stem: s(q.stem), level: 0, image: null, hasHint: false,
      passage: v ? { title: s(v.title) || s(articles.find((a) => a.id === q.articleId)?.title), text: s(v.body) } : null,
      options: (Array.isArray(opts) ? opts : []).slice(0, 4).map((t, i) => ({ label: LETTERS[i], text: s(t) })),
    } as ClientQuestion);
  }
  return out;
}

/** The page: the groups by skill, and one page (20) of questions (of one skill, or all). */
export async function secondChanceView(repo: Repo, actor: Actor, input: { skill?: string; page?: number } = {}, now = new Date()): Promise<SecondChanceView> {
  const sid = student(actor);
  const pending = await pendingMistakes(repo, sid, now);
  const names = await skillNames(repo, pending.map((p) => p.skillKey));
  const counts = new Map<string, number>();
  for (const p of pending) counts.set(p.skillKey, (counts.get(p.skillKey) ?? 0) + 1);
  const groups = [...counts].map(([key, count]) => ({ key, name: names.get(key) || "Other questions", count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const skill = groups.some((g) => g.key === input.skill) ? s(input.skill) : "";
  // grouped by skill (largest group first), newest mistake first inside a skill
  const order = new Map(groups.map((g, i) => [g.key, i]));
  const list = pending.filter((p) => !skill || p.skillKey === skill).sort((a, b) => (order.get(a.skillKey) ?? 0) - (order.get(b.skillKey) ?? 0) || b.lastWrongAt - a.lastWrongAt);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(input.page) || 1)));
  const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const bank = await loadQuestionItems(repo, slice.filter((p) => !p.key.startsWith(RR_PREFIX)).map((p) => p.key));
  const rr = await rrQuestions(repo, sid, slice.filter((p) => p.key.startsWith(RR_PREFIX)).map((p) => p.key));
  const questions: ChanceQuestion[] = [];
  for (const p of slice) {
    const item = bank.find((i) => i.questionId === p.key);
    const q = item ? toClientQuestion(item, `chance:${sid}:${p.key}`) : rr.get(p.key);
    if (q) questions.push({ key: p.key, skill: names.get(p.skillKey) || "Other questions", source: p.source, q });
  }
  const fixed = await repo.count("SecondChanceAnswer", { studentId: sid, correct: true });
  return { total: pending.length, groups, skill, questions, page, pages, fixed };
}

export interface ChanceResult { correct: boolean; correctAnswer: string; why: string; remaining: number }

/**
 * Grades one Second Chance answer and stores it in SecondChanceAnswer (practice only: no attempt row, no ability,
 * mastery, level or tier change). Only a question that is waiting for this student can be answered.
 */
export async function answerSecondChance(repo: Repo, actor: Actor, key: string, response: unknown, now = new Date()): Promise<ChanceResult> {
  const sid = student(actor);
  const pending = await pendingMistakes(repo, sid, now);
  if (!pending.some((p) => p.key === key)) throw new ValidationError("This question is not waiting for a second chance.");
  let correct = false, correctAnswer = "", why = "";
  if (key.startsWith(RR_PREFIX)) {
    const q = await repo.findUnique("RRQuestion", { id: key.slice(RR_PREFIX.length) });
    if (!q) throw new ValidationError("Question not found.");
    const opts = (asJson(q.options) ?? []) as unknown[];
    const ans = s(q.answer).toUpperCase();
    correct = s(response).trim().toUpperCase() === ans;
    correctAnswer = `${ans}. ${s(Array.isArray(opts) ? opts[LETTERS.indexOf(ans)] : "")}`;
    const r = (asJson(q.rationale) ?? {}) as Record<string, unknown>;
    why = s(r && typeof r === "object" ? r[ans] ?? r.why ?? "" : "");
  } else {
    const items = await loadQuestionItems(repo, [key]);
    if (!items.length) throw new ValidationError("Question not found.");
    const g = gradeItems(items, { [key]: response })[0];
    correct = g.correct; correctAnswer = g.correctAnswer; why = g.why;
  }
  await repo.create("SecondChanceAnswer", { studentId: sid, questionId: key, correct, createdAt: now });
  return { correct, correctAnswer, why, remaining: pending.length - (correct ? 1 : 0) };
}
