/**
 * 🗓️ This week, for a student, the family and the teacher: parts of the plans finished (weekly goal: 3 parts),
 * answers, correct answers, minutes and days active. The school week starts on Sunday.
 */
import type { Repo, Row } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
export const WEEKLY_PARTS_GOAL = 3;
export const REVIEW_AFTER_DAYS = 14;

/** Sunday 00:00 (UTC) of the week of `now`. */
export function weekStart(now: Date): Date {
  const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - x.getUTCDay());
  return x;
}

export interface WeekStats { since: string; partsGoal: number; partsDone: number; parts: string[]; answers: number; correct: number; minutes: number; days: number; reached: boolean }

/** No access check: callers check the student (the student, their parent or their teacher). */
export async function weekStats(repo: Repo, studentId: string, now = new Date()): Promise<WeekStats> {
  const since = weekStart(now);
  const [rows, attempts] = await Promise.all([
    repo.findMany("AssignmentStudent", { studentId, status: "COMPLETED" }, { select: ["assignmentId", "completedAt"] }),
    repo.findMany("QuestionAttempt", { studentId, createdAt: { gte: since } }, { select: ["isCorrect", "responseMs", "createdAt"] }),
  ]);
  const doneNow = rows.filter((r) => { const t = d(r.completedAt); return t && t >= since && t <= now; });
  // only the parts of plans count toward the weekly goal (one per place, whatever plan it is in)
  const aids = doneNow.map((r) => s(r.assignmentId));
  const parts: string[] = [];
  if (aids.length) {
    const as = await repo.findMany("Assignment", { id: { in: aids } }, { select: ["id", "title", "curriculumPlanId"] });
    const items = await planItemsFor(repo, aids);
    for (const a of as) if ((a.curriculumPlanId && s(a.curriculumPlanId) !== "WEEKLY_CHECK") || items.has(s(a.id))) parts.push(items.get(s(a.id)) ?? s(a.title));
  }
  const inWeek = attempts.filter((x) => { const t = d(x.createdAt); return t && t <= now; });
  const days = new Set(inWeek.map((x) => d(x.createdAt)!.toISOString().slice(0, 10))).size;
  const partsDone = [...new Set(parts)].length;
  // the school's weekly goal of parts (School Goals), else 3
  const st = await repo.findUnique("Student", { id: studentId });
  const goalRow = st ? (await repo.findMany("SchoolSetting", { schoolId: st.schoolId, key: "school.goals" }))[0] : null;
  const goalVal = (typeof goalRow?.value === "string" ? JSON.parse(s(goalRow.value)) : goalRow?.value) as { weeklyParts?: number } | undefined;
  const partsGoal = Number(goalVal?.weeklyParts) || WEEKLY_PARTS_GOAL;
  return {
    since: since.toISOString().slice(0, 10), partsGoal, partsDone, parts: [...new Set(parts)],
    answers: inWeek.length, correct: inWeek.filter((x) => x.isCorrect).length,
    minutes: Math.round(inWeek.reduce((t, x) => t + Math.min(Number(x.responseMs ?? 0), 180_000), 0) / 60_000), days, reached: partsDone >= partsGoal,
  };
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
