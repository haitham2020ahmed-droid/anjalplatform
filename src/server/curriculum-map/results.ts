/** Class results on the Curriculum Map: answers and % correct per place (unit → text set → category → level). */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { attachmentNodes } from "./questions";
import { studentNames } from "../insights/student-data";

const s = (v: unknown) => String(v ?? "");
export interface PlaceResult { code: string; label: string; answered: number; correct: number; pct: number | null; students: number }
export interface CurriculumResults {
  className: string; grade: number; answered: number; pct: number | null;
  units: { title: string; sets: { heading: string; places: PlaceResult[] }[] }[];
  weakest: PlaceResult[];
}

export async function curriculumResults(repo: Repo, actor: Actor, classId: string): Promise<CurriculumResults> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const nodes = (await attachmentNodes(repo, actor.schoolId!)).filter((n) => n.grade === grade);
  const students = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const links = nodes.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }) : [];
  const nodeOfQuestion = new Map(links.map((l) => [s(l.questionId), s(l.nodeId)]));
  const attempts = links.length && students.length
    ? await repo.findMany("QuestionAttempt", { questionId: { in: [...nodeOfQuestion.keys()] }, studentId: { in: students } }, { select: ["questionId", "studentId", "isCorrect"] })
    : [];
  const agg = new Map<string, { n: number; ok: number; who: Set<string> }>();
  for (const a of attempts) {
    const node = nodeOfQuestion.get(s(a.questionId))!;
    const g = agg.get(node) ?? { n: 0, ok: 0, who: new Set<string>() };
    g.n++; if (a.isCorrect) g.ok++; g.who.add(s(a.studentId)); agg.set(node, g);
  }
  const LV = { ABOVE: "Exceeding", ON: "Meeting", BELOW: "Approaching" } as const;
  const resultOf = (n: (typeof nodes)[number]): PlaceResult => {
    const g = agg.get(n.id);
    return { code: n.code, label: `${n.categoryLabel.replace(/^\d+-\s*/, "")}${n.level ? ` · ${LV[n.level]}` : ""}`, answered: g?.n ?? 0, correct: g?.ok ?? 0, pct: g ? Math.round((100 * g.ok) / g.n) : null, students: g?.who.size ?? 0 };
  };
  const units: CurriculumResults["units"] = [];
  for (const n of nodes) {
    let u = units.find((x) => x.title === n.unitTitle); if (!u) { u = { title: n.unitTitle, sets: [] }; units.push(u); }
    let st = u.sets.find((x) => x.heading === n.heading); if (!st) { st = { heading: n.heading, places: [] }; u.sets.push(st); }
    st.places.push(resultOf(n));
  }
  const all = nodes.map(resultOf);
  const answered = all.reduce((t, r) => t + r.answered, 0), correct = all.reduce((t, r) => t + r.correct, 0);
  return {
    className: s(klass.name), grade, answered, pct: answered ? Math.round((100 * correct) / answered) : null, units,
    weakest: all.filter((r) => r.answered >= 3).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 8),
  };
}

/**
 * 🧩 "By skill" tab (Oct 2026, curriculum-results-tab request): for every assignment sent from the Curriculum Map
 * to this class, which skill(s) its question pool covers and — per student who received it — whether that skill
 * is already mastered (StudentSkillMastery.isMastered) or not yet. The class-aggregate view above answers "how is
 * the class doing on this category"; this answers the teacher's follow-up "which of MY students, on THIS exact
 * assignment, still needs which skill" — the detail the aggregate view can't show.
 *
 * Scope: every Assignment of this class with track === "CURRICULUM" (every assign path on the Curriculum Map sets
 * this, regardless of the "source" the teacher picked that day) — single-skill assigns (skillId/skillIds) and the
 * adaptive/by-level/placement/review sets the map builds as a question set (assessmentId → AssessmentQuestion →
 * Question.skillId). Deleted assignments and ones with no resolvable skill are left out.
 */
export interface SkillCell { skillId: string; skillName: string; isMastered: boolean }
export interface CurriculumMasteryRow { studentId: string; studentName: string; assignmentId: string; assignmentTitle: string; skills: SkillCell[] }
export interface CurriculumMasteryReport { rows: CurriculumMasteryRow[] }

export async function curriculumMasteryByAssignment(repo: Repo, actor: Actor, classId: string): Promise<CurriculumMasteryReport> {
  assertCan(actor, "reports:read");
  await assertClassAccess(repo, actor, classId);
  const assignments = (await repo.findMany("Assignment", { classId, track: "CURRICULUM" }, { select: ["id", "title", "target", "skillId", "skillIds", "assessmentId", "deletedAt"] })).filter((a) => !a.deletedAt);
  if (!assignments.length) return { rows: [] };

  const assessmentIds = [...new Set(assignments.filter((a) => a.assessmentId).map((a) => s(a.assessmentId)))];
  const aqs = assessmentIds.length ? await repo.findMany("AssessmentQuestion", { assessmentId: { in: assessmentIds } }, { select: ["assessmentId", "questionId"] }) : [];
  const qIds = [...new Set(aqs.map((q) => s(q.questionId)))];
  const questions = qIds.length ? await repo.findMany("Question", { id: { in: qIds } }, { select: ["id", "skillId"] }) : [];
  const skillOfQuestion = new Map(questions.map((q) => [s(q.id), s(q.skillId)]));
  const skillsByAssessment = new Map<string, Set<string>>();
  for (const aq of aqs) {
    const skillId = skillOfQuestion.get(s(aq.questionId));
    if (!skillId) continue;
    const set = skillsByAssessment.get(s(aq.assessmentId)) ?? new Set<string>();
    set.add(skillId);
    skillsByAssessment.set(s(aq.assessmentId), set);
  }
  const skillPoolOf = (a: Row): string[] => {
    if (a.target === "SKILL") return [...new Set([s(a.skillId), ...(((a.skillIds as string[] | null) ?? []).map(String))].filter(Boolean))];
    if (a.assessmentId) return [...(skillsByAssessment.get(s(a.assessmentId)) ?? [])];
    return a.skillId ? [s(a.skillId)] : [];
  };
  const poolByAssignment = new Map(assignments.map((a) => [s(a.id), skillPoolOf(a)]));
  const withPool = assignments.filter((a) => poolByAssignment.get(s(a.id))!.length > 0);
  if (!withPool.length) return { rows: [] };

  const allSkillIds = [...new Set(withPool.flatMap((a) => poolByAssignment.get(s(a.id))!))];
  const skills = allSkillIds.length ? await repo.findMany("Skill", { id: { in: allSkillIds } }, { select: ["id", "name"] }) : [];
  const skillNameOf = new Map(skills.map((k) => [s(k.id), s(k.name)]));

  const assignStudents = await repo.findMany("AssignmentStudent", { assignmentId: { in: withPool.map((a) => s(a.id)) } }, { select: ["assignmentId", "studentId"] });
  const studentIds = [...new Set(assignStudents.map((x) => s(x.studentId)))];
  const names = await studentNames(repo, studentIds);

  const masteries = studentIds.length && allSkillIds.length
    ? await repo.findMany("StudentSkillMastery", { studentId: { in: studentIds }, skillId: { in: allSkillIds } }, { select: ["studentId", "skillId", "isMastered"] })
    : [];
  const masteryOf = new Map(masteries.map((m) => [`${s(m.studentId)}:${s(m.skillId)}`, Boolean(m.isMastered)]));

  const studentsOf = new Map<string, string[]>();
  for (const x of assignStudents) {
    const arr = studentsOf.get(s(x.assignmentId)) ?? [];
    arr.push(s(x.studentId));
    studentsOf.set(s(x.assignmentId), arr);
  }

  const rows: CurriculumMasteryRow[] = [];
  for (const a of withPool) {
    const pool = poolByAssignment.get(s(a.id))!;
    for (const studentId of studentsOf.get(s(a.id)) ?? []) {
      rows.push({
        studentId, studentName: names.get(studentId)?.name ?? "Student",
        assignmentId: s(a.id), assignmentTitle: s(a.title),
        skills: pool.map((skillId) => ({ skillId, skillName: skillNameOf.get(skillId) ?? "", isMastered: masteryOf.get(`${studentId}:${skillId}`) ?? false })),
      });
    }
  }
  rows.sort((x, y) => x.studentName.localeCompare(y.studentName) || x.assignmentTitle.localeCompare(y.assignmentTitle));
  return { rows };
}
