/**
 * 🇸🇦 Nightly (daily.ts): a NAFS practice reminder for a Grade 6 student who is below NAFS readiness
 * (readiness.ts — the SAME 70%-of-last-3-runs rule the student's own page shows as a badge) AND has gone quiet
 * (NAFS_REMINDER_IDLE_DAYS+ days since their last NAFS practice activity). Never for a student doing fine, never
 * for one still too new to judge (fewer than 3 finished runs), never for one still practising this week.
 * Delivered through the platform's existing Notification mechanism — the same one other student reminders use
 * (e.g. the weekly "📅 Practice reminder" in src/server/student/assigned.ts) — never a new channel. Deduped so a
 * student gets at most one fresh reminder per idle stretch, not one every night the job runs.
 */
import type { Repo } from "../seeding/repo";
import { nafsReady } from "./ready";
import { needsNafsReminder, nafsLastActivityAt, studentNafsReadiness } from "./readiness";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown): number => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const TITLE = "🇸🇦 NAFS practice reminder";

/** The school's Grade 6 students (NAFS is Grade 6 only) who belong to a live class. */
async function grade6Students(repo: Repo, schoolId: string): Promise<{ id: string; userId: string }[]> {
  const grades = await repo.findMany("Grade", { schoolId, level: 6 }, { select: ["id"] });
  if (!grades.length) return [];
  const classes = await repo.findMany("Class", { gradeId: { in: grades.map((g) => g.id) }, deletedAt: null }, { select: ["id"] });
  if (!classes.length) return [];
  const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  if (!ids.length) return [];
  return (await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] })).map((x) => ({ id: s(x.id), userId: s(x.userId) }));
}

/** One school's nightly pass. Returns how many fresh reminders it sent. A missing NAFS schema sends none. */
export async function nafsPracticeReminders(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  if (!(await nafsReady(repo))) return 0;
  const students = await grade6Students(repo, schoolId);
  if (!students.length) return 0;
  let sent = 0;
  for (const st of students) {
    const [readiness, lastActivityAt] = await Promise.all([studentNafsReadiness(repo, st.id), nafsLastActivityAt(repo, st.id)]);
    if (!needsNafsReminder(readiness, lastActivityAt, now)) continue;
    // at most one fresh reminder per idle stretch: skip when one already went out since this student last practised
    const have = await repo.findMany("Notification", { userId: st.userId, title: TITLE }, { select: ["createdAt"] });
    if (have.some((n) => lastActivityAt && time(n.createdAt) >= time(lastActivityAt))) continue;
    await repo.create("Notification", {
      userId: st.userId, type: "ASSIGNMENT_DUE", title: TITLE,
      body: "You haven't practised NAFS reading in a few days. A short practice now keeps you ready for the real test.",
      link: "/student/nafs?part=practice", readAt: null, createdAt: now,
    });
    sent++;
  }
  return sent;
}
