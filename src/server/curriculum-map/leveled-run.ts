/** Runs the level progression (leveled.ts) for an adaptive question set, from the database. */
import { categoryOfQuestions } from "./student-level";
import type { Repo, Row } from "../seeding/repo";
import { decideLevel, LADDER, pickNext, type Decision, type Level, type Rung } from "./leveled";
import { lexileBands, levelForLexile } from "./lexile";
import { evidenceLevels } from "./evidence-level";
import { ladderRulesForStudent } from "./ladder-settings";
import { cachedContentKeys, cachedSeenIndex, freshFilter, Sitting } from "../questions/fresh";
import { ASSIGNMENT_MAX_QUESTIONS, ASSIGNMENT_MIN_QUESTIONS } from "../practice/completion";
import { questionsOfSkill } from "../questions/skill-questions";
import { isHiddenSkill } from "../skills/master";

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

/**
 * 🩹 (Oct 2026, "عايز نستفيد من البنك لو المنهج خلص والعكس"): when a set's own questions (`order`) are genuinely
 * exhausted at every level, borrow more of the SAME skill(s) — every question, Curriculum Map or Question Bank,
 * carries the same `skillId` either way (`questionsOfSkill(..., { includeMapLinked: true })` is the platform's one
 * existing "questions of a skill" reader, already used to bridge Bank ↔ MAP elsewhere — see skill-questions.ts). Not
 * a new matching rule: the exact taxonomy both pools already share. Only ever called once the set's own pool has
 * nothing left (poolOf/tryLevels of `order` failed) — never changes which question comes next while the set still
 * has one of its own, and never repeats a question already in `order`, already answered in THIS session/sitting
 * (`avoid`), or ever answered by this student in ANY earlier session (checked straight off QuestionAttempt — the
 * same table every other "already answered" check in this file reads, no schema change).
 *
 * 🎯 scoped to every "real, lesson-attached" skill role — Grammar/Writing (GRAMMAR, SPELLING, WRITING) AND
 * Comprehension (COMPREHENSION_SKILL, STRATEGY_AND_FEATURE, AUTHORS_CRAFT, VOCABULARY_STRATEGY) — any skillId with
 * a LessonSkill row of one of these roles, same exact mechanism either family: the skillId IS the specific topic
 * (e.g. "Main Idea", "Compare and Contrast"), never the shared bucket below. Left out even so: a grade's hidden
 * "Unclassified (Curriculum Map)" skill (`isHiddenSkill`) — one bucket for every Concept-Vocabulary/Comprehension
 * question of a grade that has NOT been classified onto a real, specific skill yet ("not used for assignments or
 * adaptive practice" per questions.ts). Classifying those onto a real skill is the platform's existing "Fix stuck
 * questions" admin tool (src/server/admin/stuck-questions.ts, phase "classify") — once a question/lesson is
 * classified there, it already has exactly the LessonSkill row this function reads, no change needed here. Concept
 * Vocabulary words themselves still have no per-word platform skill (only a shared grade bucket) and are NOT
 * covered by this function — see the parent report for why that needs its own, separate design.
 */
async function crossSkillPool(repo: Repo, schoolId: string, studentId: string, order: string[], avoid: ReadonlySet<string>): Promise<PoolItem[]> {
  if (!order.length || !schoolId) return [];
  const own = await repo.findMany("Question", { id: { in: order } }, { select: ["id", "skillId"] });
  const candidateSkillIds = [...new Set(own.map((q) => s(q.skillId)).filter(Boolean))];
  if (!candidateSkillIds.length) return [];
  const skillRows = await repo.findMany("Skill", { id: { in: candidateSkillIds } }, { select: ["id", "code"] });
  const realSkillIds = skillRows.filter((k) => !isHiddenSkill(k.code)).map((k) => s(k.id));
  if (!realSkillIds.length) return [];
  const LESSON_ATTACHED_ROLES = new Set(["GRAMMAR", "SPELLING", "WRITING", "COMPREHENSION_SKILL", "STRATEGY_AND_FEATURE", "AUTHORS_CRAFT", "VOCABULARY_STRATEGY"]);
  const languageLinked = new Set((await repo.findMany("LessonSkill", { skillId: { in: realSkillIds } }, { select: ["skillId", "role"] })).filter((l) => LESSON_ATTACHED_ROLES.has(s(l.role))).map((l) => s(l.skillId)));
  const skillIds = realSkillIds.filter((id) => languageLinked.has(id));
  if (!skillIds.length) return [];
  const seen = new Set([...order, ...avoid]);
  const extra: string[] = [];
  for (const skillId of skillIds) {
    const qs = await questionsOfSkill(repo, schoolId, skillId, { status: "PUBLISHED", includeMapLinked: true, take: 200 });
    for (const q of qs) if (!seen.has(q.id)) { extra.push(q.id); seen.add(q.id); }
  }
  if (!extra.length) return [];
  const everAnswered = new Set((await repo.findMany("QuestionAttempt", { studentId, questionId: { in: extra } }, { select: ["questionId"] })).map((a) => s(a.questionId)));
  const fresh = extra.filter((id) => !everAnswered.has(id));
  if (!fresh.length) return [];
  return poolOf(repo, fresh);
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
/** Answers without reaching the goal: the teacher is told the student is stuck (r67: the 50-answer end of a set). */
export const STUCK_AFTER = ASSIGNMENT_MAX_QUESTIONS;

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
  // as on MAP itself. r67: they no longer count toward the set's length either (the guessing pause stops a guessing
  // student instead); a Placement test (a test) keeps counting every answer
  const careful = attempts.filter((a) => !a.rapidGuess);
  const placement = String(set.type) === "PLACEMENT";
  const counted = placement ? attempts.length : careful.length;
  // r67, the owner's rule for Curriculum Map practice: at least 30 counted answers before the goal can make it Done
  // (all of the set when it has fewer), at most 50; no "level confirmed" early stop before the teacher's count
  const minimum = placement ? 0 : Math.min(ASSIGNMENT_MIN_QUESTIONS, order.length);
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
    goal = { target, correct, reached: (correct >= target || early) && counted >= minimum, early: early && counted >= minimum, streak, struggling: wrongRun >= STRUGGLE_RUN, stuck: counted >= STUCK_AFTER && correct < target };
  }
  const cap = Number(set.maxQuestions) || order.length;
  const decision = target
    ? (counted >= (placement ? Math.max(cap, target) : Math.min(Math.max(cap, target), ASSIGNMENT_MAX_QUESTIONS)) ? { ...moved, done: true, reason: "LIMIT" as const } : { ...moved, done: false, reason: null })
    : moved.reason === "MASTERED_ABOVE" && placement ? moved
    : counted >= total ? { ...moved, done: true, reason: "LIMIT" as const } : { ...moved, done: false, reason: null };
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
    // r67: practice never ends while the set still has a new question — any level, nearest first (a Placement test
    // keeps its own nearby levels)
    const levels = placement ? [decision.level, ...near[decision.level]] : [...new Set([decision.level, ...near[decision.level], ...LADDER])];
    for (const lv of levels) { const id = pickNext(pool, lv, avoid, lex); if (id) return id; }
    return null;
  };
  // a missed question never comes back in the set: it waits in Second Chance (the set ends when nothing new is left)
  let nextId = tryLevels(notFresh) ?? tryLevels(answered);
  // 🩹 the set's own pool is genuinely exhausted at every level (native + Second Chance retries) — before giving up,
  // borrow more of the same skill(s) from the OTHER pool (Bank ↔ Curriculum Map). Skipped for a Placement test: its
  // item set is deliberately fixed for the ability estimate, never widened mid-test.
  if (!nextId && !placement) {
    const st = await repo.findUnique("Student", { id: studentId });
    const schoolId = st?.schoolId ? s(st.schoolId) : "";
    const avoidIds = new Set([...answered, ...attempts.map((a) => s(a.questionId))]);
    const borrowed = schoolId ? await crossSkillPool(repo, schoolId, studentId, order, avoidIds) : [];
    for (const q of borrowed) if (!pool.some((p) => p.id === q.id)) pool.push(q);
    if (borrowed.length) nextId = tryLevels(notFresh) ?? tryLevels(answered);
  }
  return { nextId, total, done: !nextId, decision: nextId ? decision : { ...decision, done: true, reason: "NO_QUESTIONS" }, start, goal, attempts: attempts.length };
}
