/**
 * 🧑‍🎓 ONE student profile page (UI reorg Phase 3 E): everything about a student on /teacher/students/[id].
 * This module adds what the old student page did not show — My Work progress, plans, tests & scores, MAP results,
 * mastered vs needed skills, correct / incorrect answers and time spent — reusing the student-side functions
 * (myWorkItems, myPlans, myTests: exactly what the student sees) and the class-dashboard helpers.
 *
 * Access is checked FIRST (canAccessStudent: the teacher's own classes; the admin: the school) — a typed URL for
 * another teacher's student is refused before anything is read.
 */
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";
import { myPlans, myWorkItems, type MyPlan, type MyWorkItem } from "../plans/wizard";
import { myTests, type MyTests } from "../tests/assessments";
import { mapSummaries, practiceStats, type MapSummary } from "../insights/student-data";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export interface ProfileExtras {
  work: { items: MyWorkItem[]; done: number; inProgress: number; notStarted: number };
  plans: MyPlan[];
  tests: MyTests;
  /** assignmentId → TeacherTest id (for the teacher's review link of a completed test) */
  testOf: Record<string, string>;
  answers: { total: number; correct: number; incorrect: number; accuracy: number | null };
  time: { totalMinutes: number; weekMinutes: number; monthMinutes: number; lastActive: string | null };
  map: { reading: MapSummary | null; language: MapSummary | null };
}

/** Mastered = band MASTERED / score ≥ 80; needed = practised and below 60. */
export const MASTERED_AT = 80;
export const NEEDS_BELOW = 60;

export async function studentProfileExtras(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<ProfileExtras> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Teachers only.");
  // the student's own lists, read as that student AFTER the staff access check above (nothing is written for them
  // except the usual status refresh the student page also does)
  const asStudent: Actor = { userId: s(st.userId), role: "STUDENT", schoolId: s(st.schoolId), studentId };
  const grade = Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0);
  const gradeOf = new Map([[studentId, grade]]);
  const [items, plans, tests, practice, reading, language] = await Promise.all([
    myWorkItems(repo, asStudent, now).catch(() => [] as MyWorkItem[]),
    myPlans(repo, asStudent).catch(() => [] as MyPlan[]),
    myTests(repo, asStudent, now).catch(() => ({ toDo: [], completed: [] }) as MyTests),
    practiceStats(repo, [studentId], now),
    mapSummaries(repo, [studentId], "READING", gradeOf),
    mapSummaries(repo, [studentId], "LANGUAGE", gradeOf),
  ]);
  const setIds = [...tests.toDo, ...tests.completed].map((x) => x.assignmentId);
  const testOf: Record<string, string> = {};
  if (setIds.length) for (const a of await repo.findMany("Assignment", { id: { in: setIds } }, { select: ["id", "testId"] })) if (a.testId) testOf[s(a.id)] = s(a.testId);
  const p = practice.get(studentId);
  const total = p?.answers ?? 0, correct = p?.correct ?? 0;
  return {
    work: { items, done: items.filter((i) => i.status === "Done").length, inProgress: items.filter((i) => i.status === "In progress").length, notStarted: items.filter((i) => i.status === "Not started").length },
    plans, tests, testOf,
    answers: { total, correct, incorrect: Math.max(0, total - correct), accuracy: total ? Math.round((100 * correct) / total) : null },
    time: { totalMinutes: p?.totalMinutes ?? 0, weekMinutes: p?.week.minutes ?? 0, monthMinutes: p?.month.minutes ?? 0, lastActive: p?.lastActive ?? null },
    map: { reading: reading.get(studentId) ?? null, language: language.get(studentId) ?? null },
  };
}
