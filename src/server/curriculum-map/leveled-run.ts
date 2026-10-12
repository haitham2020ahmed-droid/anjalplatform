/** Runs the level progression (leveled.ts) for an adaptive question set, from the database. */
import { categoryOfQuestions } from "./student-level";
import type { Repo, Row } from "../seeding/repo";
import { decideLevel, LADDER, pickNext, type Decision, type Level, type Rung } from "./leveled";
import { lexileBands, levelForLexile } from "./lexile";
import { evidenceLevels } from "./evidence-level";
import { ladderRulesForStudent } from "./ladder-settings";
import { cachedContentKeys, cachedSeenIndex, freshFilter, Sitting } from "../questions/fresh";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
/** A question's level: its Curriculum Map level, else from its difficulty (1–3 Below, 4 On, 5–7 Above). */
export const fromDifficulty = (d: number): Level => (d <= 3 ? "BELOW" : d >= 5 ? "ABOVE" : "ON");

export interface PoolItem { id: string; level: Rung; lexile: number | null; difficulty: number }
/**
 * Each question's rung. Questions of the class's own grade keep their level; a 🌉 bridge question from the
 * grade above is CHALLENGE, from the grade below SUPPORT. The set's grade = the grade most of its places have.
 */
export async function poolOf(repo: Repo, ids: string[]): Promise<PoolItem[]> {
  if (!ids.length) return [];
  const [qs, links] = await Promise.all([
    repo.findMany("Question", { id: { in: ids } }, { select: ["id", "lexile", "difficultyLevel"] }),
    repo.findMany("QuestionMapLink", { questionId: { in: ids } }),
  ]);
  const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "level", "gradeId"] }) : [];
  const grades = nodes.length ? await repo.findMany("Grade", { id: { in: [...new Set(nodes.map((n) => s(n.gradeId)))] } }, { select: ["id", "level"] }) : [];
  const gradeOfNode = new Map(nodes.map((n) => [s(n.id), Number(grades.find((g) => g.id === n.gradeId)?.level ?? 0)]));
  const nodeOfQ = new Map(links.map((l) => [s(l.questionId), s(l.nodeId)]));
  const counts = new Map<number, number>();
  for (const q of qs) { const g = gradeOfNode.get(nodeOfQ.get(s(q.id)) ?? ""); if (g) counts.set(g, (counts.get(g) ?? 0) + 1); }
  const base = [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0;
  return qs.map((q) => {
    const node = nodes.find((n) => n.id === nodeOfQ.get(s(q.id)));
    const g = node ? gradeOfNode.get(s(node.id)) ?? 0 : 0;
    const level: Rung = node && base && g > base ? "CHALLENGE" : node && base && g < base ? "SUPPORT" : (s(node?.level) as Level) || fromDifficulty(Number(q.difficultyLevel ?? 4));
    return { id: s(q.id), lexile: q.lexile === null || q.lexile === undefined ? null : Number(q.lexile), difficulty: Number(q.difficultyLevel ?? 4), level };
  });
}

/** The student's latest Lexile from MAP (or null). */
export async function studentLexile(repo: Repo, studentId: string): Promise<number | null> {
  const r = (await repo.findMany("MapResult", { studentId })).filter((x) => x.lexile !== null && x.lexile !== undefined).sort((a, b) => time(b.testDate) - time(a.testDate))[0];
  return r ? Number(r.lexile) : null;
}

/**
 * Where a student starts an adaptive set: from ALL their data (see evidence-level.ts — the teacher's recent choice,
 * their work in this section, their platform results, the Diagnostic, MAP Lexile and RIT), else the fallback.
 */
export async function startLevel(repo: Repo, studentId: string, fallback: Level, category: string | null = null, now = new Date()): Promise<{ level: Level; from: "TEACHER" | "CATEGORY" | "LEVEL" | "LEXILE" | "DEFAULT" }> {
  const st = await repo.findUnique("Student", { id: studentId });
  const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  const cat = category === "CV" || category === "ACS" || category === "RTR" ? category : null;
  const e = (await evidenceLevels(repo, st ? s(st.schoolId) : null, [studentId], grade, { category: cat }, now)).get(studentId);
  if (!e || e.from === "NO_DATA") return { level: fallback, from: "DEFAULT" };
  const from = e.from === "TEACHER" ? "TEACHER" : e.from === "CATEGORY" ? "CATEGORY" : e.from === "LEXILE" ? "LEXILE" : "LEVEL";
  return { level: e.level as Level, from };
}

export interface GoalState { target: number; correct: number; reached: boolean; early: boolean; streak: number; struggling: boolean; stuck: boolean }
export interface AdaptiveState { nextId: string | null; total: number; done: boolean; decision: Decision; start: Rung; goal: GoalState | null; attempts: number }

/** In a row at the end: careful correct answers at On level or higher (a strong student finishes early). */
const STRONG_STREAK = 10;
/** Careful wrong answers in a row: the student gets help (the questions they missed wait in Second Chance). */
const STRUGGLE_RUN = 5;
/** Answers without reaching the goal: the teacher is told the student is stuck. */
export const STUCK_AFTER = 60;

/** Next question of an adaptive set for this session (null = finished). */
export async function adaptiveNext(repo: Repo, set: Row, order: string[], sessionId: string, studentId: string): Promise<AdaptiveState> {
  const attempts = (await repo.findMany("QuestionAttempt", { sessionId }, { select: ["questionId", "isCorrect", "rapidGuess", "createdAt"] })).sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const pool = await poolOf(repo, order);
  const levelOf = new Map(pool.map((q) => [q.id, q.level]));
  // the start is fixed by the first question the student answered (later level changes never rewrite the path)
  const start: Rung = attempts.length && levelOf.has(s(attempts[0].questionId)) ? levelOf.get(s(attempts[0].questionId))! : (await startLevel(repo, studentId, "ON", String(set.type) === "PLACEMENT" ? null : await categoryOfQuestions(repo, order))).level;
  const target = Number(set.targetCorrect) > 0 ? Number(set.targetCorrect) : null;
  const total = target ? target : Math.min(Number(set.maxQuestions) || order.length, order.length);
  const rungs = LADDER.filter((r) => pool.some((q) => q.level === r) || r === "BELOW" || r === "ON" || r === "ABOVE");
  // ⚡ answers given too fast to have read the question (rapid guesses) never move the level, up or down —
  // as on MAP itself; they still count toward the set's length, so a guessing student does not go on forever
  const careful = attempts.filter((a) => !a.rapidGuess);
  const moved = decideLevel(start, careful.map((a) => ({ level: levelOf.get(s(a.questionId)) ?? "ON", correct: Boolean(a.isCorrect) })), Number.MAX_SAFE_INTEGER, rungs, await ladderRulesForStudent(repo, studentId));
  // 🎯 a goal of correct answers (Curriculum Map places, plans): the goal, not the number of questions, ends the set
  let goal: GoalState | null = null;
  if (target) {
    const correct = careful.filter((a) => a.isCorrect).length;
    let streak = 0;
    for (let i = careful.length - 1; i >= 0 && careful[i].isCorrect && ["ON", "ABOVE", "CHALLENGE"].includes(levelOf.get(s(careful[i].questionId)) ?? "ON"); i--) streak++;
    let wrongRun = 0;
    for (let i = careful.length - 1; i >= 0 && !careful[i].isCorrect; i--) wrongRun++;
    const early = correct < target && (streak >= STRONG_STREAK || moved.reason === "MASTERED_ABOVE");
    goal = { target, correct, reached: correct >= target || early, early, streak, struggling: wrongRun >= STRUGGLE_RUN, stuck: attempts.length >= STUCK_AFTER && correct < target };
  }
  const cap = Number(set.maxQuestions) || order.length;
  const decision = target
    ? (attempts.length >= Math.max(cap, target) ? { ...moved, done: true, reason: "LIMIT" as const } : { ...moved, done: false, reason: null })
    : moved.reason === "MASTERED_ABOVE" ? moved
    : attempts.length >= total ? { ...moved, done: true, reason: "LIMIT" as const } : { ...moved, done: false, reason: null };
  if (decision.done) return { nextId: null, total, done: true, decision, start, goal, attempts: attempts.length };
  // 🛡️ never twice in one sitting: the questions answered in this session and their copies (same content)
  const keysOf = await cachedContentKeys(repo, `pool:${s(set.id)}:${order.length}`, order);
  const sitting = new Sitting();
  for (const a of attempts) sitting.add(s(a.questionId), keysOf.get(s(a.questionId)) ?? []);
  const answered = new Set(pool.filter((q) => sitting.has(q.id, keysOf.get(q.id) ?? [])).map((q) => q.id));
  // 🆕 across sittings: questions this student never attempted first; seen ones only once every question of the set
  // was seen (then the ones seen longest ago) — the level logic below is unchanged, it only chooses among these
  const seen = await cachedSeenIndex(repo, `set:${sessionId}:${order.length}`, studentId, pool.map((q) => ({ id: q.id, keys: keysOf.get(q.id) ?? [] })), { exceptSessions: [sessionId] });
  const open = pool.filter((q) => !answered.has(q.id));
  const fresh = new Set(freshFilter(open, (q) => seen.lastSeen(q.id, keysOf.get(q.id) ?? [])).map((q) => q.id));
  const notFresh = new Set([...answered, ...open.filter((q) => !fresh.has(q.id)).map((q) => q.id)]);
  const lex = await studentLexile(repo, studentId);
  // the level first; the level has no question left: the nearest level that still has one
  const near: Record<Rung, Rung[]> = { SUPPORT: ["BELOW", "ON"], BELOW: ["ON", "SUPPORT", "ABOVE"], ON: ["BELOW", "ABOVE"], ABOVE: ["ON", "CHALLENGE", "BELOW"], CHALLENGE: ["ABOVE", "ON"] };
  const tryLevels = (avoid: Set<string>): string | null => {
    for (const lv of [decision.level, ...near[decision.level]]) { const id = pickNext(pool, lv, avoid, lex); if (id) return id; }
    return null;
  };
  // a missed question never comes back in the set: it waits in Second Chance (the set ends when nothing new is left)
  const nextId = tryLevels(notFresh) ?? tryLevels(answered);
  return { nextId, total, done: !nextId, decision: nextId ? decision : { ...decision, done: true, reason: "NO_QUESTIONS" }, start, goal, attempts: attempts.length };
}
