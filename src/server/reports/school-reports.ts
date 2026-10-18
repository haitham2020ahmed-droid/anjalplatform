/**
 * 🗒️ School Reports: three per-student documents modeled on the school's own sample
 * reports (Personalized Plan, Diagnostic Analysis, Final Report). No new calculations:
 * every builder reuses the exact service a dashboard or another report already uses
 * (personalPlan, latestDiagnostic, studentAnalytics, studentDetail, studentGrowth,
 * bySourceReport), so a School Report always agrees with the screen it was built from.
 */
import type { Period } from "../../analytics/periods";
import { pairedGrowth, studentGrowth } from "../analytics/growth";
import { studentAnalytics } from "../analytics/reports";
import { latestDiagnostic } from "../assessment/diagnostic";
import { assertCan, canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { bandOf, personalPlan, type Band, type PersonalPlan } from "../map/personal-plan";
import { bySourceReport, type BySourceReport } from "../skills/skills-by-source";
import { accessibleClasses } from "../teacher/assign";
import { assertClassAccess } from "../teacher/assignments";
import { studentDetail } from "../teacher/queries";
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);

// ----------------------------------------------------------------- roster (student picker)

export interface RosterClass { classId: string; className: string; grade: number; students: { studentId: string; name: string }[] }

/** Classes and students this actor (teacher of their own classes, or school admin school-wide) can build a report for. */
export async function schoolReportsRoster(repo: Repo, actor: Actor): Promise<RosterClass[]> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return [];
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => c.gradeId))] } }, { select: ["id", "level"] });
  const level = new Map(grades.map((g) => [s(g.id), num(g.level)]));
  const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] });
  const students = members.length ? await repo.findMany("Student", { id: { in: [...new Set(members.map((m) => m.studentId))] } }, { select: ["id", "userId"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(students.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName ?? "Student")]));
  return classes
    .map((c) => ({
      classId: s(c.id), className: s(c.name), grade: level.get(s(c.gradeId)) ?? 0,
      students: members.filter((m) => s(m.classId) === s(c.id)).map((m) => ({ studentId: s(m.studentId), name: nameOf.get(s(m.studentId)) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className));
}

// -------------------------------------------------------- 1. Personalized Plan (per student)

export interface StudentPersonalizedPlan {
  studentId: string; name: string; studentNumber: string; className: string; grade: number; teacher: string;
  subject: "READING" | "LANGUAGE"; term: string | null;
  band: Band | null; ritRange: string | null; rit: number | null; projection: number | null; percentile: number | null;
  goals: PersonalPlan["bands"][number]["goals"]; strengths: PersonalPlan["bands"][number]["strengths"];
  resources: string[]; monitoring: string[];
  /** Every instructional area's own RIT for this one student (not just their 3 weakest goals), weakest first. */
  areaBreakdown: PersonalPlan["areaBreakdown"];
}

/** The class's Personalized Plan, scoped to one student: their own RIT/percentile, and their band's goals/strengths/resources. */
export async function personalizedPlanForStudent(repo: Repo, actor: Actor, studentId: string, subject: "READING" | "LANGUAGE" = "READING"): Promise<StudentPersonalizedPlan> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const user = await repo.findUnique("User", { id: st.userId });
  const member = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  if (!member) throw new ForbiddenError("This student is not enrolled in a class.");
  const grade = Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0);
  const p = await personalPlan(repo, actor, s(member.classId), subject);
  const row = p.bands.flatMap((b) => b.students.map((x) => ({ ...x, band: b.band }))).find((x) => x.studentId === studentId);
  const band = row ? p.bands.find((b) => b.band === row.band) ?? null : null;
  return {
    studentId, name: s(user?.displayName), studentNumber: s(st.studentNumber), className: p.className, grade, teacher: p.teacher, subject, term: p.term,
    band: band?.band ?? (row ? bandOf(row.percentile, null) : null), ritRange: band?.ritRange ?? null,
    rit: row?.rit ?? null, projection: row?.projection ?? null, percentile: row?.percentile ?? null,
    goals: band?.goals ?? [], strengths: band?.strengths ?? [], resources: band?.resources ?? [], monitoring: band?.monitoring ?? [],
    areaBreakdown: p.studentAreaBreakdown[studentId] ?? [],
  };
}

// -------------------------------------------------------- 2. Diagnostic Analysis (per student)

export type DiagnosticTier = "ADVANCED" | "PROFICIENT" | "APPROACHING" | "INTENSIVE";
export const TIER_LABEL: Record<DiagnosticTier, string> = {
  ADVANCED: "Tier 1 · Advanced (above grade level)",
  PROFICIENT: "Tier 2 · Proficient (at grade level)",
  APPROACHING: "Tier 3 · Approaching (approaching grade level)",
  INTENSIVE: "Tier 4 · Intensive support (below grade level)",
};
export const TIER_STRATEGY: Record<DiagnosticTier, string> = {
  ADVANCED: "Extension texts, independent projects, and peer leadership in group work.",
  PROFICIENT: "Short focused practice on the lowest-scoring domain(s) below, to move it to mastery.",
  APPROACHING: "Guided practice with scaffolded graphic organizers and explicit instruction in the weakest domains.",
  INTENSIVE: "Small-group intervention on foundational skills; see the Intervention board for this student's open alerts and next actions.",
};
const TIER_OF: Record<string, DiagnosticTier> = {
  "Above grade level": "ADVANCED", "At grade level": "PROFICIENT", "Approaching grade level": "APPROACHING", "Below grade level": "INTENSIVE",
};
const PRESCRIPTION: Record<string, string> = {
  READING: "Practise identifying main idea, theme, and text structure across literary and informational passages.",
  VOCABULARY: "Context-clue and morphology (root/prefix/suffix) practice; build an academic word wall.",
  GRAMMAR: "Targeted grammar drills on the weakest standard, with immediate corrective feedback.",
  LANGUAGE: "Punctuation and capitalization practice embedded in short daily writing.",
  WORD_STUDY: "Spelling-pattern and high-frequency-word review in short daily sets.",
  WRITING: "Guided writing with a graphic organizer; focus on organization and evidence.",
};

export interface DiagnosticAnalysis {
  studentId: string; name: string; studentNumber: string; grade: number; className: string | null;
  takenAt: string | null; questions: number; proficiency: string | null; tier: DiagnosticTier | null;
  domains: { domain: string; label: string; level: string; theta: number; percentLike: number; items: number; prescription: string }[];
  strengths: string[]; growthAreas: string[]; notMeasured: string[];
  recommendedSkills: { skillId: string; name: string }[]; supportSkills: { skillId: string; name: string }[];
}

/** An approximate 0-100 display scale from theta (internal; never presented as official MAP/RIT or % correct). */
const percentLike = (theta: number): number => Math.round(100 / (1 + Math.exp(-1.3 * theta)));

/** The student's latest placement/diagnostic check, read in the sample reports' style: tier, domain breakdown, recommendations. */
export async function diagnosticAnalysisForStudent(repo: Repo, actor: Actor, studentId: string): Promise<DiagnosticAnalysis> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const [user, grade, member, d] = await Promise.all([
    repo.findUnique("User", { id: st.userId }),
    repo.findUnique("Grade", { id: st.gradeId }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }).then((m) => m[0]),
    latestDiagnostic(repo, studentId),
  ]);
  const klass = member ? await repo.findUnique("Class", { id: s(member.classId) }) : null;
  return {
    studentId, name: s(user?.displayName), studentNumber: s(st.studentNumber), grade: num(grade?.level), className: klass ? s(klass.name) : null,
    takenAt: d?.takenAt ?? null, questions: d?.questions ?? 0, proficiency: d?.proficiency ?? null, tier: d ? TIER_OF[d.proficiency] ?? null : null,
    domains: (d?.domains ?? []).map((x) => ({
      domain: x.domain, label: x.label, level: x.level, theta: Math.round(x.theta * 100) / 100, percentLike: percentLike(x.theta), items: x.items,
      prescription: PRESCRIPTION[x.domain] ?? "Review the domain's recent answers with the student.",
    })),
    strengths: d?.strong ?? [], growthAreas: d?.growth ?? [], notMeasured: d?.notMeasured ?? [],
    recommendedSkills: d?.startWith ?? [], supportSkills: d?.support ?? [],
  };
}

/** Every active student of a class, in name order (shared by the two whole-class reports below). */
async function classStudentIds(repo: Repo, classId: string): Promise<string[]> {
  const members = await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] });
  if (!members.length) return [];
  const students = await repo.findMany("Student", { id: { in: members.map((m) => s(m.studentId)) } }, { select: ["id", "userId"] });
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(students.map((x) => [s(x.id), s(users.find((u) => s(u.id) === s(x.userId))?.displayName ?? "Student")]));
  return members.map((m) => s(m.studentId)).sort((a, b) => (nameOf.get(a) ?? "").localeCompare(nameOf.get(b) ?? ""));
}

export interface DiagnosticClassReport {
  classId: string; className: string; grade: number;
  /** every domain label seen in the class, in the order each first appeared (for the master table's columns) */
  domains: string[];
  tiers: { tier: DiagnosticTier; label: string; students: { studentId: string; name: string; proficiency: string | null; domains: Record<string, string>; domainScores: Record<string, number> }[] }[];
  /** owner's two reference reports (Grade 4 tracking sheet, Grade 11 assessment report) both flag who has not completed the check, with a required action — merged into this one report. */
  notTaken: { studentId: string; name: string; action: string }[];
}

/** A missing result's suggested next step: no placement data at all yet (never attempted) vs an old one gone stale. */
const NOT_TAKEN_ACTION = "No placement/diagnostic result yet: assign the Diagnostic check, or confirm the student has completed enough practice for one to be calculated.";

/**
 * The whole class's Diagnostic Analysis, grouped by tier (the school's own master-table format): every student
 * once, with their domain levels side by side, so a teacher can see the whole class' placement at a glance.
 */
export async function diagnosticAnalysisForClass(repo: Repo, actor: Actor, classId: string): Promise<DiagnosticClassReport> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: s(klass.gradeId) }))?.level ?? 0);
  const ids = await classStudentIds(repo, classId);
  const rows = await Promise.all(ids.map((id) => diagnosticAnalysisForStudent(repo, actor, id)));
  const domains = [...new Set(rows.flatMap((r) => r.domains.map((x) => x.label)))];
  const TIERS: DiagnosticTier[] = ["ADVANCED", "PROFICIENT", "APPROACHING", "INTENSIVE"];
  const tiers = TIERS.map((tier) => ({
    tier, label: TIER_LABEL[tier],
    students: rows.filter((r) => r.tier === tier).map((r) => ({
      studentId: r.studentId, name: r.name, proficiency: r.proficiency,
      domains: Object.fromEntries(r.domains.map((x) => [x.label, x.level])),
      domainScores: Object.fromEntries(r.domains.map((x) => [x.label, x.percentLike])),
    })),
  }));
  return { classId, className: s(klass.name), grade, domains, tiers, notTaken: rows.filter((r) => r.tier === null).map((r) => ({ studentId: r.studentId, name: r.name, action: NOT_TAKEN_ACTION })) };
}

// -------------------------------------------------------------- 3. Final Report (per student)

export interface FinalReport {
  studentId: string; name: string; studentNumber: string; grade: number; className: string | null;
  kpis: {
    questions: number; accuracyPct: number | null; minutes: number; skillsMastered: number; skillsDeveloping: number;
    skillsNeedingSupport: number; curriculumProgressPct: number; pairedGrowth: number | null;
  };
  bySource: BySourceReport;
  domains: { label: string; level: string }[];
  map: { date: string; subject: string; goal: string | null; rit: number; percentile: number | null }[];
  diagnostic: DiagnosticAnalysis | null;
  plans: { subject: "READING" | "LANGUAGE"; band: Band | null; goals: string[]; strengths: string[] }[];
  alerts: { message: string; nextAction: string }[];
  /** more skills declining than improving over the period (a regression / stability signal). */
  regressionSignal: boolean;
}

/** The most complete single-student document on the platform: aggregates what the by-source, diagnostic, personalized-plan and class/student screens already compute. */
export async function finalReportForStudent(repo: Repo, actor: Actor, studentId: string, period: Period): Promise<FinalReport> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const [user, grade, member, a, d, src, diag, growth] = await Promise.all([
    repo.findUnique("User", { id: st.userId }),
    repo.findUnique("Grade", { id: st.gradeId }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }).then((m) => m[0]),
    studentAnalytics(repo, actor, studentId, period),
    studentDetail(repo, actor, studentId),
    bySourceReport(repo, actor, studentId, period),
    diagnosticAnalysisForStudent(repo, actor, studentId),
    studentGrowth(repo, studentId, period),
  ]);
  const klass = member ? await repo.findUnique("Class", { id: s(member.classId) }) : null;
  const plans: FinalReport["plans"] = [];
  for (const subject of ["READING", "LANGUAGE"] as const) {
    try {
      const pp = await personalizedPlanForStudent(repo, actor, studentId, subject);
      plans.push({ subject, band: pp.band, goals: pp.goals.map((g) => g.area), strengths: pp.strengths.map((g) => g.area) });
    } catch {
      // not enrolled in a class, or no MAP data for this subject yet: this subject's plan is skipped
    }
  }
  const declining = growth.skills.filter((x) => x.growth < 0).length;
  const improving = growth.skills.filter((x) => x.growth > 0).length;
  return {
    studentId, name: s(user?.displayName), studentNumber: s(st.studentNumber), grade: num(grade?.level), className: klass ? s(klass.name) : null,
    kpis: {
      questions: a.questions, accuracyPct: a.accuracyPct, minutes: a.minutes, skillsMastered: a.skillsMastered, skillsDeveloping: a.skillsDeveloping,
      skillsNeedingSupport: a.skillsNeedingIntervention, curriculumProgressPct: a.curriculumProgressPct, pairedGrowth: pairedGrowth(growth),
    },
    bySource: src, domains: d.domains, map: a.importedMap.map((m) => ({ date: m.testDate, subject: m.subject, goal: m.goalArea, rit: m.rit, percentile: m.percentile })),
    diagnostic: diag, plans, alerts: d.alerts.map((x) => ({ message: x.message, nextAction: x.nextAction })),
    regressionSignal: growth.skills.length > 0 && declining > improving,
  };
}

/** Every student's Final Report of a class, one after another (print all / save as one PDF for the whole class). */
export async function finalReportsForClass(repo: Repo, actor: Actor, classId: string, period: Period): Promise<{ classId: string; className: string; grade: number; reports: FinalReport[] }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: s(klass.gradeId) }))?.level ?? 0);
  const ids = await classStudentIds(repo, classId);
  const reports = await Promise.all(ids.map((id) => finalReportForStudent(repo, actor, id, period)));
  return { classId, className: s(klass.name), grade, reports };
}
