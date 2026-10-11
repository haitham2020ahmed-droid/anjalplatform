/**
 * 🤖 Automatic placement: Below / On / Above for every student of a class, from their own data, the most
 * direct and recent evidence first:
 *   1. their level in this category (CV / ACS / RTR), learned from their own adaptive work
 *   2. platform performance: accuracy of their last 30 days (at least 10 careful answers)
 *   3. the Placement test
 *   4. MAP: Lexile (Reading) against the grade's Lexile bands
 *   5. MAP: RIT percentile (Below < 41st · On 41st–60th · Above > 60th)
 *   6. no data → On Level (the teacher is told)
 * The teacher sees each suggestion with its reason and can move any student before saving or sending.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { classMembers, studentNames, type Level } from "../insights/student-data";
import { evidenceLevels, type Evidence } from "./evidence-level";

const s = (v: unknown) => String(v ?? "");
export type { Evidence } from "./evidence-level";
export { EVIDENCE_NAME } from "./evidence-level";

export interface Suggestion { studentId: string; name: string; current: Level | null; currentSource: string | null; suggested: Level; from: Evidence; reason: string }

/** The level each student of the class should have, from all their data (the teacher's own choice is left out: this is a suggestion). */
export async function suggestLevels(repo: Repo, actor: Actor, classId: string, opts: { category?: "CV" | "ACS" | "RTR" | null; subject?: "READING" | "LANGUAGE" } = {}): Promise<{ className: string; grade: number; rows: Suggestion[]; noData: number }> {
  assertCan(actor, "students:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const [names, ev] = await Promise.all([studentNames(repo, ids), evidenceLevels(repo, actor.schoolId, ids, grade, { ...opts, useTeacher: false })]);
  const rows: Suggestion[] = ids.map((id) => { const e = ev.get(id)!; return { studentId: id, name: names.get(id)?.name ?? "Student", current: e.current, currentSource: e.currentSource, suggested: e.level, from: e.from, reason: e.reason }; }).sort((a, b) => a.name.localeCompare(b.name));
  return { className: s(klass.name), grade, rows, noData: rows.filter((r) => r.from === "NO_DATA").length };
}
