/**
 * NAFS plan suggestion (Plans page): from the class's latest NAFS practice test, each student gets the skills they
 * scored under 70% on; before any NAFS test has results, the general NAFS preparation plan (skills of the NAFS
 * areas) is suggested instead. Changes nothing; the teacher edits, previews and sends (send.ts, program NAFS).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { RETEACH_PCT, testResults } from "../tests/assessments";
import { proposePlan } from "./wizard";
import type { PlanSkill } from "./send";

export interface NafsSuggestion {
  /** RESULTS = from the latest NAFS test; AREAS = the general plan from the NAFS areas */
  source: "RESULTS" | "AREAS";
  testTitle: string | null;
  students: { id: string; name: string }[];
  skills: PlanSkill[];
  notes: string[];
}

export async function suggestNafsPlan(repo: Repo, actor: Actor, input: { classId: string; studentIds?: string[]; areas?: string[] | null; grade?: number | null }, now = new Date()): Promise<NafsSuggestion> {
  assertCan(actor, "assignments:create");
  // the general proposal also checks the class (own class only) and the students (in the class)
  const general = await proposePlan(repo, actor, { classId: input.classId, studentIds: input.studentIds, type: "NAFS", areas: input.areas, grade: input.grade });
  const recipients = new Set(general.students.map((s) => s.id));
  const test = (await repo.findMany("TeacherTest", { classId: input.classId, testType: "NAFS", deletedAt: null }, { select: ["id", "title", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 1 }))[0];
  if (test) {
    const r = await testResults(repo, actor, String(test.id), now);
    if (r.finished > 0) {
      const skills: PlanSkill[] = r.skills.map((k) => ({ id: k.skillId, name: k.name, grade: k.grade, reason: `NAFS: ${r.test.title}`, studentIds: k.below.map((b) => b.id).filter((id) => recipients.has(id)).sort() }))
        .filter((k) => k.studentIds.length > 0);
      return { source: "RESULTS", testTitle: r.test.title, students: general.students, skills, notes: skills.length ? [] : [`Every student scored ${RETEACH_PCT}% or more on ${r.test.title}.`] };
    }
  }
  return {
    source: "AREAS", testTitle: null, students: general.students, notes: general.notes,
    skills: general.skills.map((k) => ({ id: k.id, name: k.name, reason: k.reason, studentIds: k.studentIds, grade: k.grade, questions: k.questions })),
  };
}
