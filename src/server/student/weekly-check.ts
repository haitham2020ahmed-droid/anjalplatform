/**
 * 🗓️ The Weekly Check: 5 questions a week, chosen around the student's current RIT (one per MAP goal area of
 * Reading, then Language), never seen before. It keeps the RIT estimate (“now” on My MAP) and the teacher's picture
 * current between MAP tests. It lives outside My Work (a hidden set) and shows on the student's home page.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { estimateRit, groupPools, GROUPS, type PoolQ } from "../map/map-plan";
import { weekStart } from "./weekly";

const s = (v: unknown) => String(v ?? "");
export const WEEKLY_CHECK_SIZE = 5;
/** the hidden marker of the check's assignment (kept out of My Work and the plans) */
export const WEEKLY_CHECK_MARK = "WEEKLY_CHECK";
const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export interface WeeklyCheckView { week: string; status: "TODO" | "STARTED" | "DONE"; href: string; correct: number; total: number; ritBefore: number | null; ritAfter: number | null }

async function context(repo: Repo, actor: Actor): Promise<{ studentId: string; klass: Row; grade: number } | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const m = (await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const g = klass ? await repo.findUnique("Grade", { id: klass.gradeId }) : null;
  return klass && g ? { studentId: actor.studentId, klass, grade: Number(g.level) } : null;
}

/** This week's check (without making it). */
export async function weeklyCheck(repo: Repo, actor: Actor, now = new Date()): Promise<WeeklyCheckView | null> {
  const c = await context(repo, actor);
  if (!c) return null;
  const week = weekStart(now).toISOString().slice(0, 10);
  const row = (await repo.findMany("WeeklyCheck", { studentId: c.studentId, week }))[0];
  if (!row) {
    const pk = await groupPools(repo, s(actor.schoolId), c.grade);
    const n = GROUPS.filter((g) => g.subject === "READING").reduce((t, g) => t + (pk.pools.get(g.key)?.length ?? 0), 0);
    return n >= WEEKLY_CHECK_SIZE ? { week, status: "TODO", href: "/student/weekly-check", correct: 0, total: WEEKLY_CHECK_SIZE, ritBefore: null, ritAfter: null } : null;
  }
  const ses = (await repo.findMany("PracticeSession", { studentId: c.studentId, assignmentId: row.assignmentId, mode: "TEACHER_QUIZ" }))[0];
  const answered = ses ? await repo.count("QuestionAttempt", { sessionId: ses.id }) : 0;
  return { week, status: row.completedAt ? "DONE" : answered ? "STARTED" : "TODO", href: `/quiz/${s(row.assignmentId)}`, correct: Number(row.correct), total: Number(row.total), ritBefore: row.ritBefore === null ? null : Number(row.ritBefore), ritAfter: row.ritAfter === null ? null : Number(row.ritAfter) };
}

/** Opens this week's check (made the first time): returns the quiz link. */
export async function openWeeklyCheck(repo: Repo, actor: Actor, now = new Date()): Promise<string | null> {
  const c = await context(repo, actor);
  if (!c) return null;
  const week = weekStart(now).toISOString().slice(0, 10);
  const existing = (await repo.findMany("WeeklyCheck", { studentId: c.studentId, week }))[0];
  if (existing) return `/quiz/${s(existing.assignmentId)}`;
  const schoolId = s(actor.schoolId);
  const pk = await groupPools(repo, schoolId, c.grade);
  // around the current RIT: the platform's estimate, else the latest MAP Reading RIT, else the middle of the pool
  const est = await estimateRit(repo, schoolId, c.studentId, "READING", now);
  const maps = (await repo.findMany("MapResult", { studentId: c.studentId }, { select: ["subject", "goalName", "rit", "testDate"] })).filter((m) => !m.goalName && /read/i.test(s(m.subject))).sort((a, b) => new Date(s(b.testDate instanceof Date ? b.testDate.toISOString() : b.testDate)).getTime() - new Date(s(a.testDate instanceof Date ? a.testDate.toISOString() : a.testDate)).getTime());
  const all = GROUPS.filter((g) => g.subject === "READING").flatMap((g) => pk.pools.get(g.key) ?? []);
  if (all.length < WEEKLY_CHECK_SIZE) return null;
  const sorted = [...all].sort((a, b) => a.rit - b.rit);
  const target = est?.rit ?? (maps[0] ? Number(maps[0].rit) : sorted[Math.floor(sorted.length / 2)].rit);
  const seen = new Set((await repo.findMany("QuestionAttempt", { studentId: c.studentId }, { select: ["questionId"] })).map((a) => s(a.questionId)));
  const pick: PoolQ[] = [];
  const order = [...GROUPS.filter((g) => g.subject === "READING"), ...GROUPS.filter((g) => g.subject === "LANGUAGE" && g.key !== "WRITING")];
  for (let round = 0; pick.length < WEEKLY_CHECK_SIZE && round < 5; round++) {
    for (const g of order) {
      if (pick.length >= WEEKLY_CHECK_SIZE) break;
      const pool = (pk.pools.get(g.key) ?? []).filter((q) => !pick.some((p) => p.id === q.id));
      const fresh = pool.filter((q) => !seen.has(q.id));
      const from = fresh.length ? fresh : pool;
      if (!from.length) continue;
      // a little above and below the target in turn, so the check measures both ways
      const aim = target + [0, 4, -4, 7, -7][(pick.length + round) % 5];
      const best = [...from].sort((a, b) => Math.abs(a.rit - aim) - Math.abs(b.rit - aim) || hash(c.studentId + week + a.id) - hash(c.studentId + week + b.id))[0];
      pick.push(best);
    }
  }
  const lead = (await repo.findMany("ClassTeacher", { classId: c.klass.id }, { select: ["teacherId", "isLead"] })).sort((a, b) => Number(Boolean(b.isLead)) - Number(Boolean(a.isLead)))[0];
  if (!lead) return null;
  const set = await repo.create("Assessment", { title: `Weekly Check · ${week}`, type: "BENCHMARK", isAdaptive: false, maxQuestions: pick.length, status: "PUBLISHED", createdById: actor.userId, createdAt: now });
  await repo.createMany("AssessmentQuestion", pick.map((q, order) => ({ assessmentId: set.id, questionId: q.id, order, points: 1 })));
  const a = await repo.create("Assignment", { classId: c.klass.id, createdById: lead.teacherId, title: `Weekly Check · ${week}`, target: "ASSESSMENT", track: "MAP", assessmentId: set.id, curriculumPlanId: WEEKLY_CHECK_MARK, note: "Weekly Check", createdAt: now });
  await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: c.studentId, status: "NOT_STARTED", progress: 0 });
  await repo.create("WeeklyCheck", { studentId: c.studentId, week, assignmentId: a.id, correct: 0, total: pick.length, ritBefore: est?.rit ?? (maps[0] ? Number(maps[0].rit) : null), ritAfter: null, completedAt: null, createdAt: now });
  return `/quiz/${s(a.id)}`;
}

/** Called after each answer of a Weekly Check: when every question is answered, the result and the new estimate are kept. */
export async function finishWeeklyCheck(repo: Repo, assignmentId: string, studentId: string, sessionId: string, schoolId: string, now = new Date()): Promise<void> {
  const row = (await repo.findMany("WeeklyCheck", { assignmentId, studentId }))[0];
  if (!row || row.completedAt) return;
  const attempts = await repo.findMany("QuestionAttempt", { sessionId }, { select: ["questionId", "isCorrect"] });
  const answered = new Set(attempts.map((a) => s(a.questionId)));
  if (answered.size < Number(row.total)) return;
  const est = await estimateRit(repo, schoolId, studentId, "READING", now);
  await repo.updateMany("WeeklyCheck", { id: row.id }, { correct: attempts.filter((a) => a.isCorrect).length, ritAfter: est?.rit ?? row.ritBefore ?? null, completedAt: now });
}
