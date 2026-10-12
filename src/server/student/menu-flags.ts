/**
 * Which conditional entries the student menu shows: RTI (only students in Tier 2 / 3) and NAFS (only when the
 * student has NAFS work — a NAFS plan's skills are NAFS assignments). Bounded: one tier row, the student's
 * assignment ids, one count.
 */
import { cache } from "react";
import type { Repo } from "../seeding/repo";
import { TtlCache } from "../lib/ttl-cache";
import { rtiStatus } from "./student-home";

export interface StudentMenuFlags { rti: boolean; nafs: boolean; /** the student's grade (the calm theme from Grade 7) */ grade?: number }

/** Read once per request (the home page and the menu both ask); the two counts in one round trip. */
export const hasNafsPlan = cache(async (repo: Repo, studentId: string): Promise<boolean> => {
  const mine = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"] });
  if (!mine.length) return false;
  const ids = mine.map((m) => m.assignmentId);
  const [track, program] = await Promise.all([
    repo.count("Assignment", { id: { in: ids }, track: "NAFS", deletedAt: null }),
    repo.count("Assignment", { id: { in: ids }, program: "NAFS", deletedAt: null }),
  ]);
  return track > 0 || program > 0;
});

export async function studentMenuFlags(repo: Repo, studentId: string): Promise<StudentMenuFlags> {
  const [rti, nafs, st] = await Promise.all([rtiStatus(repo, studentId), hasNafsPlan(repo, studentId), repo.findUnique("Student", { id: studentId })]);
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  return { rti: rti !== null, nafs, grade: g ? Number(g.level) : undefined };
}

/** The menu flags for the page frame, kept 15 s per student like the menu numbers (navCountsCached). */
const flagCache = new TtlCache<StudentMenuFlags>(15_000, 5000);
export function studentMenuFlagsCached(repo: Repo, studentId: string): Promise<StudentMenuFlags> {
  return flagCache.getOrLoad(studentId, () => studentMenuFlags(repo, studentId));
}
