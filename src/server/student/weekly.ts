/**
 * 🗓️ This week, for a student, the family and the teacher: parts of the plans finished (weekly goal: 3 parts),
 * answers, correct answers, minutes and days active. The school week starts on Sunday.
 */
import type { Repo, Row } from "../seeding/repo";
import { cancelIndexForStudents } from "./cancelled-work";
import { practiceTotals, practiceTotalsFor, type PracticeTotals } from "../analytics/practice-totals";
import { riyadhDay } from "../analytics/practice";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
export const WEEKLY_PARTS_GOAL = 3;
export const REVIEW_AFTER_DAYS = 14;
const RIYADH = 3 * 3_600_000;

/** Sunday 00:00 Riyadh time (UTC+3) of the week of `now` — same convention as readrise/engine.ts's `weekStart`.
 * r85 audit: this used to compute the Sunday boundary from raw UTC date components with no Riyadh offset, so
 * for roughly 21:00–23:59 UTC every day (00:00–02:59 Riyadh) "this week" could be off by a whole week around the
 * Sunday boundary — pulling in a stale extra week, or dropping the just-started week, from the family weekly
 * report and "this week" stats. */
export function weekStart(now: Date): Date {
  const local = new Date(now.getTime() + RIYADH);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnight - local.getUTCDay() * 86_400_000 - RIYADH);
}

export interface WeekStats { since: string; partsGoal: number; partsDone: number; parts: string[]; answers: number; correct: number; minutes: number; days: number; reached: boolean }

/** No access check: callers check the student (the student, their parent or their teacher). */
export async function weekStats(repo: Repo, studentId: string, now = new Date()): Promise<WeekStats> {
  const since = weekStart(now);
  const st = await repo.findUnique("Student", { id: studentId });
  const schoolId = st ? s(st.schoolId) : null;
  // 📏 round 4: answers / correct / minutes = THE one definition (practice-totals.ts) for the Riyadh week from Sunday
  const [rows, tot] = await Promise.all([
    repo.findMany("AssignmentStudent", { studentId, status: "COMPLETED" }, { select: ["assignmentId", "completedAt"] }),
    practiceTotalsFor(repo, studentId, since, now, { schoolId }),
  ]);
  const doneNow = rows.filter((r) => { const t = d(r.completedAt); return t && t >= since && t <= now; });
  // only the parts of plans count toward the weekly goal (one per place, whatever plan it is in)
  const aids = doneNow.map((r) => s(r.assignmentId));
  const parts: string[] = [];
  if (aids.length) {
    // r78: a part cancelled on Assigned is not one of the week's parts
    const [as, ix] = await Promise.all([repo.findMany("Assignment", { id: { in: aids }, deletedAt: null }, { select: ["id", "title", "curriculumPlanId", "testId"] }), cancelIndexForStudents(repo, [studentId])]);
    const items = await planItemsFor(repo, aids);
    for (const a of as) if (ix.live(a, studentId) && (a.curriculumPlanId && s(a.curriculumPlanId) !== "WEEKLY_CHECK") || items.has(s(a.id))) parts.push(items.get(s(a.id)) ?? s(a.title));
  }
  // days active = Riyadh days of the week with practice (round 4: Riyadh days, not UTC days)
  const days = tot.activeDays;
  const partsDone = [...new Set(parts)].length;
  // the school's weekly goal of parts (School Goals), else 3
  const goalRow = st ? (await repo.findMany("SchoolSetting", { schoolId: st.schoolId, key: "school.goals" }))[0] : null;
  const goalVal = (typeof goalRow?.value === "string" ? JSON.parse(s(goalRow.value)) : goalRow?.value) as { weeklyParts?: number } | undefined;
  const partsGoal = Number(goalVal?.weeklyParts) || WEEKLY_PARTS_GOAL;
  return {
    // the Riyadh date of the week's Sunday (since = Sat 21:00 UTC, so a UTC slice showed Saturday)
    since: riyadhDay(since), partsGoal, partsDone, parts: [...new Set(parts)],
    // correct = right careful answers (a rapid guess counts for nothing); minutes = ≤ 5 min per answer
    answers: tot.questions, correct: tot.correct, minutes: tot.minutes, days, reached: partsDone >= partsGoal,
  };
}

/**
 * Days active: the Riyadh days in [from, to] on which each student practised (the star sources of practice-totals.ts —
 * the same answers as the Questions number), counted in the SAME single read as the totals (PracticeTotals.activeDays).
 */
export async function activeDaysFor(repo: Repo, studentIds: readonly string[], from: Date, to: Date, schoolId: string | null = null): Promise<Map<string, number>> {
  const out = new Map<string, number>(studentIds.map((id) => [id, 0]));
  if (!studentIds.length) return out;
  for (const [id, tot] of await practiceTotals(repo, studentIds, from, to, { schoolId })) out.set(id, tot.activeDays);
  return out;
}
/** One student's days active (from totals already read, else one read). */
export async function activeDays(repo: Repo, studentId: string, from: Date, to: Date, total: PracticeTotals | null = null, schoolId: string | null = null): Promise<number> {
  if (total) return total.activeDays;
  return (await activeDaysFor(repo, [studentId], from, to, schoolId)).get(studentId) ?? 0;
}

/** assignmentId → the plan part's name (“Unit 1 · Text Set 1 · Theme” → “Theme (Unit 1)”). */
async function planItemsFor(repo: Repo, aids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want = new Set(aids);
  const as = await repo.findMany("Assignment", { id: { in: aids } }, { select: ["classId"] });
  const classIds = [...new Set(as.map((a) => s(a.classId)))];
  const plans = classIds.length ? await repo.findMany("SkillPlan", { classId: { in: classIds } }, { select: ["id"] }) : [];
  const items: Row[] = plans.length ? await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => p.id) } }, { select: ["label", "assignmentIds"] }) : [];
  for (const it of items) {
    const v = typeof it.assignmentIds === "string" ? (() => { try { return JSON.parse(s(it.assignmentIds)); } catch { return []; } })() : it.assignmentIds;
    const [unit = "", , ...rest] = s(it.label).split(" · ");
    for (const id of Array.isArray(v) ? v.map(String) : []) if (want.has(id)) out.set(id, `${rest.join(" · ") || s(it.label)} (${unit.replace(/^(Unit \d+).*/, "$1")})`);
  }
  return out;
}

/** 🔁 Spaced review: a part finished 2+ weeks ago, not practised since (the oldest first). */
export async function reviewDue(repo: Repo, studentId: string, now = new Date()): Promise<{ assignmentId: string; name: string; days: number } | null> {
  const cutoff = new Date(now.getTime() - REVIEW_AFTER_DAYS * 86_400_000);
  const rows = (await repo.findMany("AssignmentStudent", { studentId, status: "COMPLETED" }, { select: ["assignmentId", "completedAt"] }))
    .filter((r) => { const t = d(r.completedAt); return t && t <= cutoff; });
  if (!rows.length) return null;
  const sessions = await repo.findMany("PracticeSession", { studentId, assignmentId: { in: rows.map((r) => s(r.assignmentId)) }, mode: "TEACHER_QUIZ" }, { select: ["id", "assignmentId"] });
  const names = await planItemsFor(repo, rows.map((r) => s(r.assignmentId)));
  const candidates = rows.filter((r) => names.has(s(r.assignmentId))).sort((a, b) => d(a.completedAt)!.getTime() - d(b.completedAt)!.getTime());
  for (const r of candidates) {
    const ses = sessions.find((x) => s(x.assignmentId) === s(r.assignmentId));
    const last = ses ? (await repo.findMany("QuestionAttempt", { sessionId: ses.id }, { select: ["createdAt"] })).reduce((m, x) => Math.max(m, d(x.createdAt)!.getTime()), 0) : 0;
    if (last && last > cutoff.getTime()) continue;
    return { assignmentId: s(r.assignmentId), name: names.get(s(r.assignmentId))!, days: Math.floor((now.getTime() - d(r.completedAt)!.getTime()) / 86_400_000) };
  }
  return null;
}
