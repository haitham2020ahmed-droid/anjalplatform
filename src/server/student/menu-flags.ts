/**
 * Which conditional entries the student menu shows: RTI (only students in Tier 2 / 3) and NAFS (only students in a
 * Grade 6 class: the NAFS icon). Bounded: one tier row, the student's classes, one count.
 */
import { cache } from "react";
import type { Repo } from "../seeding/repo";
import { TtlCache } from "../lib/ttl-cache";
import { rtiStatus } from "./student-home";
import { nafsReady } from "../nafs/ready";
import { cancelIndexForStudents, liveAssignmentWhere } from "./cancelled-work";

export interface StudentMenuFlags { rti: boolean; nafs: boolean; /** the student's grade (the calm theme from Grade 7) */ grade?: number }

/** Read once per request (the home page and the menu both ask); the two counts in one round trip. */
export const hasNafsPlan = cache(async (repo: Repo, studentId: string): Promise<boolean> => {
  const mine = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"] });
  if (!mine.length) return false;
  const ids = mine.map((m) => m.assignmentId);
  // r78: NAFS work cancelled on Assigned does not open the menu
  const [track, program, ix] = await Promise.all([
    repo.findMany("Assignment", liveAssignmentWhere({ id: { in: ids }, track: "NAFS" }), { select: ["id", "testId", "curriculumPlanId"], take: 50 }),
    repo.findMany("Assignment", liveAssignmentWhere({ id: { in: ids }, program: "NAFS" }), { select: ["id", "testId", "curriculumPlanId"], take: 50 }),
    cancelIndexForStudents(repo, [studentId]),
  ]);
  return [...track, ...program].some((a) => ix.live(a, studentId));
});

/**
 * 🇸🇦 The NAFS icon (the NAFS center for students: My practice · My tests · My results) is shown ONLY to students in a
 * Grade 6 class (NAFS is the Grade 6 national test). Two bounded reads.
 */
export const inGrade6Class = cache(async (repo: Repo, studentId: string): Promise<boolean> => {
  const classIds = (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })).map((m) => m.classId);
  if (!classIds.length) return false;
  const classes = await repo.findMany("Class", { id: { in: classIds }, deletedAt: null }, { select: ["gradeId"] });
  if (!classes.length) return false;
  return (await repo.count("Grade", { id: { in: [...new Set(classes.map((c) => c.gradeId))] }, level: 6 })) > 0;
});

export async function studentMenuFlags(repo: Repo, studentId: string): Promise<StudentMenuFlags> {
  // the NAFS icon also waits for the NAFS tables (an update whose `prisma db push` did not run: the icon just hides)
  const [rti, g6, st, ready] = await Promise.all([rtiStatus(repo, studentId), inGrade6Class(repo, studentId), repo.findUnique("Student", { id: studentId }), nafsReady(repo)]);
  const nafs = g6 && ready;
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  return { rti: rti !== null, nafs, grade: g ? Number(g.level) : undefined };
}

/** The menu flags for the page frame, kept 15 s per student like the menu numbers (navCountsCached). */
const flagCache = new TtlCache<StudentMenuFlags>(15_000, 5000);
export function studentMenuFlagsCached(repo: Repo, studentId: string): Promise<StudentMenuFlags> {
  return flagCache.getOrLoad(studentId, () => studentMenuFlags(repo, studentId));
}
