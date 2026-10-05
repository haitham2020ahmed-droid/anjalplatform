/**
 * Teacher dashboard read models. Every function checks access first:
 * a teacher sees only classes they teach (and students currently enrolled);
 * a school admin sees their school. Batched queries; no per-student loops over the DB.
 */
import { proficiencyLabel } from "../../adaptive/diagnostic";
import { DOMAIN_LABEL, latestDiagnostic, type DiagnosticSummary } from "../assessment/diagnostic";
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { BAND_LABEL } from "../queries/student-curriculum";
import type { Repo, Row } from "../seeding/repo";
import { assertClassAccess } from "./assignments";
import { NEXT_ACTION, type RuleCode } from "./interventions";
import type { MasteryBandName } from "../../types/domain";

const num = (v: unknown) => Number(v ?? 0);
const ms = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).getTime();

export type GroupName = "Intervention" | "Developing" | "On level" | "Advanced";

/** Automatic grouping: placement level when available, otherwise average mastery of practised skills. */
export function groupFor(globalTheta: number | null, avgMastery: number | null): GroupName | null {
  if (globalTheta !== null) {
    if (globalTheta < -1) return "Intervention";
    if (globalTheta < -0.35) return "Developing";
    if (globalTheta <= 0.75) return "On level";
    return "Advanced";
  }
  if (avgMastery === null) return null;
  if (avgMastery < 40) return "Intervention";
  if (avgMastery < 60) return "Developing";
  if (avgMastery < 85) return "On level";
  return "Advanced";
}

export interface StudentRow {
  studentId: string;
  name: string;
  group: GroupName | null;
  placement: string | null;
  avgMastery: number | null;
  skillsMastered: number;
  answered: number;
  accuracyPct: number | null;
  minutes: number;
  lastActive: string | null;
  openAlerts: number;
}

export interface ClassOverview {
  classId: string;
  className: string;
  grade: number;
  kpis: { students: number; activeStudents: number; questions: number; accuracyPct: number | null; avgMastery: number | null; minutes: number; skillsMastered: number; needSupport: number };
  groups: Record<GroupName, string[]>;
  students: StudentRow[];
  weakSkills: { skillId: string; name: string; avgMastery: number; students: number }[];
  strongSkills: { skillId: string; name: string; avgMastery: number; students: number }[];
  hardQuestions: { questionId: string; ref: string; stem: string; skill: string; attempts: number; accuracyPct: number }[];
  alerts: { id: string; studentId: string; message: string; rule: string; createdAt: string; nextAction: string }[];
}

async function classStudents(repo: Repo, classId: string) {
  const members = await repo.findMany("ClassMembership", { classId, leftAt: null });
  const students = members.length ? await repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((s) => s.userId) } }) : [];
  const name = new Map(users.map((u) => [String(u.id), String(u.displayName)]));
  return students.map((s) => ({ id: String(s.id), name: name.get(String(s.userId)) ?? "Student", row: s }));
}

export async function classOverview(repo: Repo, actor: Actor, classId: string, range: { from: Date; to: Date }): Promise<ClassOverview> {
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = (await repo.findUnique("Grade", { id: klass.gradeId }))!;
  const studs = await classStudents(repo, classId);
  const ids = studs.map((s) => s.id);
  const [mastery, attempts, globals, alerts] = await Promise.all([
    ids.length ? repo.findMany("StudentSkillMastery", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: range.from } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("StudentAbility", { studentId: { in: ids }, scope: "GLOBAL" }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("InterventionAlert", { studentId: { in: ids }, resolvedAt: null }) : Promise.resolve([] as Row[]),
  ]);
  const inRange = attempts.filter((a) => ms(a.createdAt) <= range.to.getTime());
  const skillIds = [...new Set(mastery.map((m) => String(m.skillId)))];
  const skills = new Map((skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }) : []).map((k) => [String(k.id), String(k.name)]));

  const students: StudentRow[] = studs.map((s) => {
    const m = mastery.filter((x) => x.studentId === s.id && num(x.attempts) > 0);
    const a = inRange.filter((x) => x.studentId === s.id);
    const g = globals.find((x) => x.studentId === s.id);
    const avg = m.length ? m.reduce((t, x) => t + num(x.score), 0) / m.length : null;
    const last = a.length ? Math.max(...a.map((x) => ms(x.createdAt))) : null;
    return {
      studentId: s.id, name: s.name,
      group: groupFor(g ? num(g.theta) : null, avg),
      placement: g ? proficiencyLabel(num(g.theta)) : null,
      avgMastery: avg === null ? null : Math.round(avg),
      skillsMastered: m.filter((x) => x.isMastered).length,
      answered: a.length,
      accuracyPct: a.length ? Math.round((100 * a.filter((x) => x.isCorrect).length) / a.length) : null,
      minutes: Math.round(a.reduce((t, x) => t + num(x.responseMs), 0) / 60_000),
      lastActive: last ? new Date(last).toISOString() : null,
      openAlerts: alerts.filter((x) => x.studentId === s.id).length,
    };
  }).sort((x, y) => x.name.localeCompare(y.name));

  const groups: Record<GroupName, string[]> = { Intervention: [], Developing: [], "On level": [], Advanced: [] };
  for (const s of students) if (s.group) groups[s.group].push(s.name);

  const bySkill = new Map<string, number[]>();
  for (const m of mastery.filter((x) => num(x.attempts) > 0)) (bySkill.get(String(m.skillId)) ?? bySkill.set(String(m.skillId), []).get(String(m.skillId))!).push(num(m.score));
  const skillAvg = [...bySkill].filter(([, v]) => v.length >= 3).map(([id, v]) => ({ skillId: id, name: skills.get(id) ?? "", avgMastery: Math.round(v.reduce((a, b) => a + b, 0) / v.length), students: v.length }));
  // weak = class average below 60, strong = 60 or above; the two lists never overlap
  const weakSkills = skillAvg.filter((x) => x.avgMastery < 60).sort((a, b) => a.avgMastery - b.avgMastery).slice(0, 5);
  const strongSkills = skillAvg.filter((x) => x.avgMastery >= 60).sort((a, b) => b.avgMastery - a.avgMastery).slice(0, 5);

  const byQ = new Map<string, Row[]>();
  for (const a of inRange) (byQ.get(String(a.questionId)) ?? byQ.set(String(a.questionId), []).get(String(a.questionId))!).push(a);
  const hardIds = [...byQ].filter(([, v]) => v.length >= 5).map(([id, v]) => ({ id, acc: v.filter((x) => x.isCorrect).length / v.length, n: v.length })).sort((a, b) => a.acc - b.acc).slice(0, 5);
  const qrows = hardIds.length ? await repo.findMany("Question", { id: { in: hardIds.map((h) => h.id) } }) : [];
  const qSkills = new Map((qrows.length ? await repo.findMany("Skill", { id: { in: qrows.map((q) => q.skillId) } }) : []).map((k) => [String(k.id), String(k.name)]));
  const hardQuestions = hardIds.map((h) => {
    const q = qrows.find((x) => x.id === h.id)!;
    return { questionId: h.id, ref: String(q.externalRef ?? q.id), stem: String(q.stem).slice(0, 140), skill: qSkills.get(String(q.skillId)) ?? "", attempts: h.n, accuracyPct: Math.round(h.acc * 100) };
  });

  const answered = inRange.length;
  const withM = students.filter((s) => s.avgMastery !== null);
  return {
    classId, className: String(klass.name), grade: num(grade.level),
    kpis: {
      students: students.length, activeStudents: students.filter((s) => s.answered > 0).length, questions: answered,
      accuracyPct: answered ? Math.round((100 * inRange.filter((a) => a.isCorrect).length) / answered) : null,
      avgMastery: withM.length ? Math.round(withM.reduce((t, s) => t + (s.avgMastery ?? 0), 0) / withM.length) : null,
      minutes: students.reduce((t, s) => t + s.minutes, 0),
      skillsMastered: students.reduce((t, s) => t + s.skillsMastered, 0),
      needSupport: students.filter((s) => s.group === "Intervention" || s.openAlerts > 0).length,
    },
    groups, students, weakSkills, strongSkills, hardQuestions,
    alerts: alerts.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).map((a) => ({
      id: String(a.id), studentId: String(a.studentId), message: String(a.message), rule: String(a.ruleCode),
      createdAt: new Date(ms(a.createdAt)).toISOString(), nextAction: NEXT_ACTION[a.ruleCode as RuleCode] ?? "",
    })),
  };
}

export interface MasteryGrid {
  skills: { skillId: string; name: string }[];
  rows: { studentId: string; name: string; cells: ({ score: number; band: MasteryBandName } | null)[] }[];
}

/** Students × skills heat map for one unit. */
export async function masteryGrid(repo: Repo, actor: Actor, classId: string, unitId: string): Promise<MasteryGrid> {
  const klass = await assertClassAccess(repo, actor, classId);
  const unit = await repo.findUnique("Unit", { id: unitId });
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
  if (!unit || unit.curriculumId !== cur.id) throw new ForbiddenError("That unit is not in this class's book.");
  const links = (await repo.findMany("UnitSkill", { unitId })).sort((a, b) => num(a.order) - num(b.order));
  const skillRows = await repo.findMany("Skill", { id: { in: links.map((l) => l.skillId) } });
  const skills = links.map((l) => ({ skillId: String(l.skillId), name: String(skillRows.find((k) => k.id === l.skillId)?.name ?? "") }));
  const studs = await classStudents(repo, classId);
  const mastery = studs.length && skills.length ? await repo.findMany("StudentSkillMastery", { studentId: { in: studs.map((s) => s.id) }, skillId: { in: skills.map((k) => k.skillId) } }) : [];
  return {
    skills,
    rows: studs.sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({
      studentId: s.id, name: s.name,
      cells: skills.map((k) => {
        const m = mastery.find((x) => x.studentId === s.id && x.skillId === k.skillId && num(x.attempts) > 0);
        return m ? { score: Math.round(num(m.score)), band: String(m.band) as MasteryBandName } : null;
      }),
    })),
  };
}

export interface StudentDetail {
  studentId: string;
  name: string;
  studentNumber: string;
  grade: number;
  className: string | null;
  placement: DiagnosticSummary | null;
  skills: { skillId: string; name: string; score: number; band: string; attempts: number; accuracyPct: number; lastPracticed: string | null }[];
  recent: { at: string; skill: string; ref: string; stem: string; correct: boolean; seconds: number; rapid: boolean; answer: string }[];
  decisions: { at: string; reasonCode: string; reason: string; fromTheta: number; toTheta: number; difficulty: number | null; correct: boolean | null; masteryBefore: number | null; masteryAfter: number | null }[];
  alerts: { id: string; message: string; rule: string; nextAction: string; evidence: unknown }[];
  domains: { label: string; level: string }[];
}

export async function studentDetail(repo: Repo, actor: Actor, studentId: string): Promise<StudentDetail> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: String(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const user = (await repo.findUnique("User", { id: st.userId }))!;
  const grade = (await repo.findUnique("Grade", { id: st.gradeId }))!;
  const member = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const klass = member ? await repo.findUnique("Class", { id: member.classId }) : null;
  const [mastery, attempts, logs, alerts, domains] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId }),
    repo.findMany("QuestionAttempt", { studentId }),
    repo.findMany("AdaptiveDecisionLog", { studentId }),
    repo.findMany("InterventionAlert", { studentId, resolvedAt: null }),
    repo.findMany("StudentAbility", { studentId }),
  ]);
  const skillIds = [...new Set([...mastery.map((m) => String(m.skillId)), ...attempts.map((a) => String(a.skillId))])];
  const skillName = new Map((skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }) : []).map((k) => [String(k.id), String(k.name)]));
  const recentA = attempts.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 20);
  const qs = recentA.length ? await repo.findMany("Question", { id: { in: recentA.map((a) => a.questionId) } }) : [];
  return {
    studentId, name: String(user.displayName), studentNumber: String(st.studentNumber), grade: num(grade.level), className: klass ? String(klass.name) : null,
    placement: await latestDiagnostic(repo, studentId),
    skills: mastery.filter((m) => num(m.attempts) > 0).sort((a, b) => num(a.score) - num(b.score)).map((m) => ({
      skillId: String(m.skillId), name: skillName.get(String(m.skillId)) ?? "", score: Math.round(num(m.score)), band: BAND_LABEL[String(m.band) as MasteryBandName] ?? String(m.band),
      attempts: num(m.attempts), accuracyPct: num(m.attempts) ? Math.round((100 * num(m.correct)) / num(m.attempts)) : 0,
      lastPracticed: m.lastPracticedAt ? new Date(ms(m.lastPracticedAt)).toISOString() : null,
    })),
    recent: recentA.map((a) => {
      const q = qs.find((x) => x.id === a.questionId);
      const v = (a.response as { value?: unknown } | null)?.value;
      return {
        at: new Date(ms(a.createdAt)).toISOString(), skill: skillName.get(String(a.skillId)) ?? "", ref: String(q?.externalRef ?? a.questionId), stem: String(q?.stem ?? "").slice(0, 120),
        correct: Boolean(a.isCorrect), seconds: Math.round(num(a.responseMs) / 1000), rapid: Boolean(a.rapidGuess), answer: typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v).slice(0, 60),
      };
    }),
    decisions: logs.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 30).map((l) => ({
      at: new Date(ms(l.createdAt)).toISOString(), reasonCode: String(l.reasonCode), reason: String(l.reason),
      fromTheta: Math.round(num(l.previousTheta) * 100) / 100, toTheta: Math.round(num(l.newTheta) * 100) / 100,
      difficulty: l.questionDifficulty === null || l.questionDifficulty === undefined ? null : num(l.questionDifficulty),
      correct: l.responseCorrect === null || l.responseCorrect === undefined ? null : Boolean(l.responseCorrect),
      masteryBefore: l.masteryBefore === null || l.masteryBefore === undefined ? null : Math.round(num(l.masteryBefore)),
      masteryAfter: l.masteryAfter === null || l.masteryAfter === undefined ? null : Math.round(num(l.masteryAfter)),
    })),
    alerts: alerts.map((a) => ({ id: String(a.id), message: String(a.message), rule: String(a.ruleCode), nextAction: NEXT_ACTION[a.ruleCode as RuleCode] ?? "", evidence: a.evidence })),
    domains: domains.filter((d) => String(d.scope).startsWith("DOMAIN:")).map((d) => ({ label: DOMAIN_LABEL[String(d.domain)] ?? String(d.domain), level: proficiencyLabel(num(d.theta)) })),
  };
}

/** Classes this actor teaches (teacher) or all classes of the school (admin). */
export async function teacherClasses(repo: Repo, actor: Actor): Promise<{ classId: string; name: string; grade: number; students: number; openAlerts: number }[]> {
  let classes: Row[] = [];
  if (actor.role === "TEACHER") {
    const t = await repo.findUnique("Teacher", { userId: actor.userId });
    const links = t ? await repo.findMany("ClassTeacher", { teacherId: t.id }) : [];
    classes = links.length ? await repo.findMany("Class", { id: { in: links.map((l) => l.classId) }, deletedAt: null }) : [];
  } else if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") {
    classes = await repo.findMany("Class", actor.role === "SUPER_ADMIN" ? { deletedAt: null } : { schoolId: actor.schoolId, deletedAt: null });
  } else throw new ForbiddenError("Teachers and admins only.");
  const grades = classes.length ? await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => c.gradeId))] } }) : [];
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }) : [];
  const alerts = members.length ? await repo.findMany("InterventionAlert", { studentId: { in: members.map((m) => m.studentId) }, resolvedAt: null }) : [];
  return classes.map((c) => {
    const sids = new Set(members.filter((m) => m.classId === c.id).map((m) => String(m.studentId)));
    return { classId: String(c.id), name: String(c.name), grade: num(grades.find((g) => g.id === c.gradeId)?.level), students: sids.size, openAlerts: alerts.filter((a) => sids.has(String(a.studentId))).length };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
