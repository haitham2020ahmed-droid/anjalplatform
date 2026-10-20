/**
 * 📊 Week in Review (new) — three headline numbers in the style of an IXL "week in review" email, but built into
 * the app itself (no email): questions answered, minutes spent practising, and distinct skills practised.
 *
 * Window: a rolling 7 days (`now - 7d`), the SAME window as the adjacent "Work sent this week" tile on the teacher
 * home (src/server/teacher/needs-attention.ts's `teacherHomeSummary`) — not the Sunday-anchored school week used
 * elsewhere (src/server/student/weekly.ts) — so the two "this week" numbers on one page never disagree.
 *
 * Bounded and cheap on purpose (this is a glance card, not a report): "questions" and "skills" are one GROUP BY
 * each (countGroups), never a full row read of QuestionAttempt; "minutes" reads only the two numeric columns it
 * needs (activeMs, readSeconds), each capped per row the same way family-week.ts caps them, so one very long
 * session can't blow up the total.
 *
 * "Questions answered" is an effort count, like monthly-report.ts's `answers` field: every attempt counts, guessed
 * or not, because this card is meant to show how much the class worked, not how well — accuracy lives elsewhere.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { accessibleClasses } from "../teacher/assign";
import { countGroups } from "../db/group-count";

const s = (v: unknown) => String(v ?? "");
const SESSION_CAP_MS = 3 * 3_600_000;
const RUN_CAP_MS = 3600 * 1000;
/** r## memory hardening: `minutes` has no DB-side SUM available (only groupCount), so it reads raw rows — capped
 * here so a school-wide week (admin) can't pull an unbounded row set into memory on a 512 MB server. A school
 * past this many sessions/runs in one week undercounts minutes slightly rather than risk the server's memory. */
const ROW_CAP = 20_000;

export interface WeekInReview { questions: number; minutes: number; skills: number }

async function aggregate(repo: Repo, studentIds: string[], since: Date): Promise<WeekInReview> {
  if (!studentIds.length) return { questions: 0, minutes: 0, skills: 0 };
  const [bySkill, sessions, runs] = await Promise.all([
    countGroups(repo, "QuestionAttempt", "skillId", { studentId: { in: studentIds }, createdAt: { gte: since } }),
    repo.findMany("PracticeSession", { studentId: { in: studentIds }, startedAt: { gte: since } }, { select: ["activeMs"], take: ROW_CAP }),
    repo.findMany("RRRun", { studentId: { in: studentIds }, completedAt: { gte: since } }, { select: ["readSeconds"], take: ROW_CAP }),
  ]);
  const questions = [...bySkill.values()].reduce((t, n) => t + n, 0);
  const skills = [...bySkill.keys()].filter(Boolean).length;
  const minutes = Math.round((sessions.reduce((t, x) => t + Math.min(Number(x.activeMs ?? 0), SESSION_CAP_MS), 0) + runs.reduce((t, r) => t + Math.min(Number(r.readSeconds ?? 0) * 1000, RUN_CAP_MS), 0)) / 60_000);
  return { questions, minutes, skills };
}

/** The teacher's own classes (every class they can see), this rolling week. */
export async function teacherWeekInReview(repo: Repo, actor: Actor, now = new Date()): Promise<WeekInReview> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return { questions: 0, minutes: 0, skills: 0 };
  const classIds = classes.map((c) => s(c.id));
  const members = await repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["studentId"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  return aggregate(repo, ids, new Date(now.getTime() - 7 * 86_400_000));
}

/** The whole school, this rolling week (admin dashboard). */
export async function schoolWeekInReview(repo: Repo, actor: Actor, now = new Date()): Promise<WeekInReview> {
  const schoolId = actor.schoolId;
  if (!schoolId) return { questions: 0, minutes: 0, skills: 0 };
  const students = await repo.findMany("Student", { schoolId }, { select: ["id"] });
  const ids = students.map((x) => s(x.id));
  return aggregate(repo, ids, new Date(now.getTime() - 7 * 86_400_000));
}
