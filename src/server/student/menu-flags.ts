/**
 * Which conditional entries the student menu shows: RTI (only students in Tier 2 / 3) and NAFS (only when the
 * student has NAFS work — a NAFS plan's skills are NAFS assignments). Bounded: one tier row, the student's
 * assignment ids, one count.
 */
import type { Repo } from "../seeding/repo";
import { rtiStatus } from "./student-home";

export interface StudentMenuFlags { rti: boolean; nafs: boolean }

export async function hasNafsPlan(repo: Repo, studentId: string): Promise<boolean> {
  const mine = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"] });
  if (!mine.length) return false;
  const ids = mine.map((m) => m.assignmentId);
  if ((await repo.count("Assignment", { id: { in: ids }, track: "NAFS", deletedAt: null })) > 0) return true;
  return (await repo.count("Assignment", { id: { in: ids }, program: "NAFS", deletedAt: null })) > 0;
}

export async function studentMenuFlags(repo: Repo, studentId: string): Promise<StudentMenuFlags> {
  const [rti, nafs] = await Promise.all([rtiStatus(repo, studentId), hasNafsPlan(repo, studentId)]);
  return { rti: rti !== null, nafs };
}
