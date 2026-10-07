/** Runs the level progression (leveled.ts) for an adaptive question set, from the database. */
import type { Repo, Row } from "../seeding/repo";
import { decideLevel, pickNext, type Decision, type Level } from "./leveled";
import { lexileBands, levelForLexile } from "./lexile";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
/** A question's level: its Curriculum Map level, else from its difficulty (1–3 Below, 4 On, 5–7 Above). */
const fromDifficulty = (d: number): Level => (d <= 3 ? "BELOW" : d >= 5 ? "ABOVE" : "ON");

export interface PoolItem { id: string; level: Level; lexile: number | null; difficulty: number }
export async function poolOf(repo: Repo, ids: string[]): Promise<PoolItem[]> {
  if (!ids.length) return [];
  const [qs, links] = await Promise.all([
    repo.findMany("Question", { id: { in: ids } }, { select: ["id", "lexile", "difficultyLevel"] }),
    repo.findMany("QuestionMapLink", { questionId: { in: ids } }),
  ]);
  const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "level"] }) : [];
  const levelOfQ = new Map(links.map((l) => [s(l.questionId), s(nodes.find((n) => n.id === l.nodeId)?.level) || null]));
  return qs.map((q) => ({ id: s(q.id), lexile: q.lexile === null || q.lexile === undefined ? null : Number(q.lexile), difficulty: Number(q.difficultyLevel ?? 4), level: (levelOfQ.get(s(q.id)) as Level | null) ?? fromDifficulty(Number(q.difficultyLevel ?? 4)) }));
}

/** The student's latest Lexile from MAP (or null). */
export async function studentLexile(repo: Repo, studentId: string): Promise<number | null> {
  const r = (await repo.findMany("MapResult", { studentId })).filter((x) => x.lexile !== null && x.lexile !== undefined).sort((a, b) => time(b.testDate) - time(a.testDate))[0];
  return r ? Number(r.lexile) : null;
}

/** Where a student starts: their Lexile (MAP) → level; else their saved level; else the default. */
export async function startLevel(repo: Repo, studentId: string, fallback: Level): Promise<{ level: Level; from: "LEXILE" | "LEVEL" | "DEFAULT" }> {
  const st = await repo.findUnique("Student", { id: studentId });
  const lex = await studentLexile(repo, studentId);
  if (st && lex !== null) {
    const g = st.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
    const lv = g ? levelForLexile((await lexileBands(repo, s(st.schoolId)))[Number(g.level)], lex) : null;
    if (lv) return { level: lv, from: "LEXILE" };
  }
  const saved = await repo.findUnique("StudentLevel", { studentId });
  return saved ? { level: s(saved.level) as Level, from: "LEVEL" } : { level: fallback, from: "DEFAULT" };
}

export interface AdaptiveState { nextId: string | null; total: number; done: boolean; decision: Decision; start: Level }

/** Next question of an adaptive set for this session (null = finished). */
export async function adaptiveNext(repo: Repo, set: Row, order: string[], sessionId: string, studentId: string): Promise<AdaptiveState> {
  const attempts = (await repo.findMany("QuestionAttempt", { sessionId }, { select: ["questionId", "isCorrect", "createdAt"] })).sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const pool = await poolOf(repo, order);
  const levelOf = new Map(pool.map((q) => [q.id, q.level]));
  // the start is fixed by the first question the student answered (later level changes never rewrite the path)
  const start = attempts.length && levelOf.has(s(attempts[0].questionId)) ? levelOf.get(s(attempts[0].questionId))! : (await startLevel(repo, studentId, String(set.type) === "PLACEMENT" ? "ON" : "BELOW")).level;
  const total = Math.min(Number(set.maxQuestions) || order.length, order.length);
  const decision = decideLevel(start, attempts.map((a) => ({ level: levelOf.get(s(a.questionId)) ?? "ON", correct: Boolean(a.isCorrect) })), total);
  if (decision.done) return { nextId: null, total, done: true, decision, start };
  const answered = new Set(attempts.map((a) => s(a.questionId)));
  const lex = await studentLexile(repo, studentId);
  let nextId = pickNext(pool, decision.level, answered, lex);
  // the level has no question left: the nearest level that still has one
  const near: Record<Level, Level[]> = { BELOW: ["ON", "ABOVE"], ON: ["BELOW", "ABOVE"], ABOVE: ["ON", "BELOW"] };
  for (const alt of near[decision.level]) { if (nextId) break; nextId = pickNext(pool, alt, answered, lex); }
  return { nextId, total, done: !nextId, decision: nextId ? decision : { ...decision, done: true, reason: "NO_QUESTIONS" }, start };
}
