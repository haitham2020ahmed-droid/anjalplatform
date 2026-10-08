/**
 * 🕳 Question-bank gaps: per grade and MAP goal area, the published questions available (on the area's skills)
 * against the students whose weakest area it is (latest term). Shows where to write questions first.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { gradeAreaSkills } from "./recommend";

const s = (v: unknown) => String(v ?? "");
export interface GapRow { grade: number; area: string; subject: string; questions: number; skills: number; studentsWeakest: number; perStudent: number | null; status: "GAP" | "LOW" | "OK" }

export async function bankGaps(repo: Repo, actor: Actor): Promise<GapRow[]> {
  assertCan(actor, "questions:read");
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] })).map((g) => Number(g.level)).filter((g) => g > 0).sort();
  const areas = await repo.findMany("MapGoalArea", {}, { select: ["id", "name", "subject"] });
  const students = await repo.findMany("Student", { schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "gradeId"] });
  const gradeRows = await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] });
  const levelOf = new Map(gradeRows.map((g) => [s(g.id), Number(g.level)]));
  const goals = students.length ? (await repo.findMany("MapResult", { studentId: { in: students.map((x) => x.id) } })).filter((r) => r.goalName && r.goalAreaId) : [];
  // each student's weakest area per subject (latest term of that student)
  const weakest = new Map<string, number>(); // `${grade}|${areaId}` → students
  for (const st of students) {
    const mine = goals.filter((g) => g.studentId === st.id);
    if (!mine.length) continue;
    const latest = mine.reduce((x, g) => (s(g.termName) > x ? s(g.termName) : x), "");
    for (const subj of ["READING", "LANGUAGE_USAGE"]) {
      const ofSubj = mine.filter((g) => s(g.termName) === latest && areas.find((a) => a.id === g.goalAreaId)?.subject === subj);
      if (!ofSubj.length) continue;
      const w = ofSubj.reduce((x, g) => (Number(g.rit) < Number(x.rit) ? g : x));
      const key = `${levelOf.get(s(st.gradeId))}|${s(w.goalAreaId)}`;
      weakest.set(key, (weakest.get(key) ?? 0) + 1);
    }
  }
  const rows: GapRow[] = [];
  for (const g of grades) {
    const as = await gradeAreaSkills(repo, actor.schoolId!, g, true);
    for (const a of areas) {
      const sk = as.find((x) => x.areaId === s(a.id))?.skills ?? [];
      const questions = sk.length ? await repo.count("Question", { skillId: { in: sk.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }) : 0;
      const need = weakest.get(`${g}|${s(a.id)}`) ?? 0;
      const perStudent = need ? Math.round((questions / need) * 10) / 10 : null;
      rows.push({ grade: g, area: s(a.name), subject: s(a.subject) === "READING" ? "Reading" : "Language Usage", questions, skills: sk.length, studentsWeakest: need, perStudent, status: questions === 0 ? "GAP" : need && questions < need * 5 ? "LOW" : "OK" });
    }
  }
  return rows.sort((a, b) => a.grade - b.grade || ({ GAP: 0, LOW: 1, OK: 2 }[a.status] - { GAP: 0, LOW: 1, OK: 2 }[b.status]) || b.studentsWeakest - a.studentsWeakest);
}
