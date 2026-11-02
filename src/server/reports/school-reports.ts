/**
 * 🗒️ School Reports: three per-student documents modeled on the school's own sample
 * reports (Personalized Plan, Diagnostic Analysis, Final Report). No new calculations:
 * every builder reuses the exact service a dashboard or another report already uses
 * (personalPlan, latestDiagnostic, studentAnalytics, studentDetail, studentGrowth,
 * bySourceReport), so a School Report always agrees with the screen it was built from.
 */
import type { Period, PeriodName } from "../../analytics/periods";
import { mapLimit } from "../db/parallel";
import { starBook, starMastered, type StarChange } from "../skills/star-read";
import { isHiddenSkill } from "../skills/master";
import { studentAnalytics } from "../analytics/reports";
import { latestDiagnosticState, type DiagnosticSummary } from "../assessment/diagnostic";
import { assertCan, canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { bandOf, personalPlan, type Band, type PersonalPlan } from "../map/personal-plan";
import { classProfile, studentAreaQuintiles, type AreaQuintileRow } from "../map/nwea-reports";
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
  /** NWEA's published national average RIT for this grade/season/subject — same number as the class's own, so the
   *  one-student "Instructional Areas" bar can be scaled against it too (see InstructionalAreas' fix comment). */
  nationalAverageRit: number | null;
  /** "Instructional Area Achievement Percentiles" for this one student: which NWEA national-percentile band
   *  (Low/LoAvg/Avg/HiAvg/High) each area's own descriptor falls in. Needs the comprehensive MAP data file; empty
   *  (never thrown) when only a basic RIT-only import exists, or the class profile can't be read. */
  areaPercentiles: AreaQuintileRow[];
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
  const profile = await classProfile(repo, actor, s(member.classId), subject).catch(() => null);
  // 🐛 fix (Nov 2026): goals/strengths used to come from `band` — every student of the same Below/On/Above band
  // averaged together — shown here as if they were this one student's own, conflicting with the correct
  // student-specific RIT in `areaBreakdown` right below under the identical area name. `p.studentGoals` is this
  // one student's own goal areas (see personal-plan.ts).
  const own = p.studentGoals[studentId];
  return {
    studentId, name: s(user?.displayName), studentNumber: s(st.studentNumber), className: p.className, grade, teacher: p.teacher, subject, term: p.term,
    band: band?.band ?? (row ? bandOf(row.percentile, null) : null), ritRange: band?.ritRange ?? null,
    rit: row?.rit ?? null, projection: row?.projection ?? null, percentile: row?.percentile ?? null,
    goals: own?.goals ?? [], strengths: own?.strengths ?? [], resources: band?.resources ?? [], monitoring: band?.monitoring ?? [],
    areaBreakdown: p.studentAreaBreakdown[studentId] ?? [],
    nationalAverageRit: p.nationalAverageRit,
    areaPercentiles: profile ? studentAreaQuintiles(profile, studentId) : [],
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
// The modern Diagnostic Test's tier is the Diagnostic report's own band (summarizeScore → bandFor(pct, level)):
// Above → Advanced, On → Proficient, Below → Approaching (40+) or Intensive — the same tier on every page.
const PRESCRIPTION: Record<string, string> = {
  READING: "Practise identifying main idea, theme, and text structure across literary and informational passages.",
  VOCABULARY: "Context-clue and morphology (root/prefix/suffix) practice; build an academic word wall.",
  GRAMMAR: "Targeted grammar drills on the weakest standard, with immediate corrective feedback.",
  LANGUAGE: "Punctuation and capitalization practice embedded in short daily writing.",
  WORD_STUDY: "Spelling-pattern and high-frequency-word review in short daily sets.",
  WRITING: "Guided writing with a graphic organizer; focus on organization and evidence.",
  // 🐛 r91 fix: the modern Diagnostic Test tags domains with its own strand codes (LIT/INFO/VOCAB/LANG/WRITE/FOUND),
  // not the legacy domain codes above — without these, every modern-test domain fell through to the generic default.
  LIT: "Practise identifying main idea, theme, and text structure in literary passages.",
  INFO: "Practise identifying main idea, text structure, and author's purpose in informational passages.",
  VOCAB: "Context-clue and morphology (root/prefix/suffix) practice; build an academic word wall.",
  LANG: "Punctuation and capitalization practice embedded in short daily writing.",
  WRITE: "Guided writing with a graphic organizer; focus on organization and evidence.",
  FOUND: "Review foundational decoding, phonics, and word-recognition skills in short daily sets.",
};

export interface DiagnosticAnalysis {
  studentId: string; name: string; studentNumber: string; grade: number; className: string | null;
  takenAt: string | null; questions: number; proficiency: string | null; tier: DiagnosticTier | null;
  domains: { domain: string; label: string; level: string; theta: number; percentLike: number; items: number; prescription: string }[];
  strengths: string[]; growthAreas: string[]; notMeasured: string[];
  recommendedSkills: { skillId: string; name: string }[]; supportSkills: { skillId: string; name: string }[];
  /** the modern test: scores 0–100 on the grade scale (no “%”) */
  adaptive: boolean;
  /** θ is shown only for the old placement check (the Diagnostic Test does not measure it per domain) */
  thetaMeasured: boolean;
  /** the result has no skill-level data to suggest skills from (the page says so in one line) */
  noSkillData: boolean;
  /** a newer result was not valid (too many fast answers) and is not used: its date — retake recommended */
  invalidNewer: string | null;
}

/** An approximate 0-100 display scale from theta (internal; never presented as official MAP/RIT or % correct). */
const percentLike = (theta: number): number => Math.round(100 / (1 + Math.exp(-1.3 * theta)));

/** The student's latest placement/diagnostic check, read in the sample reports' style: tier, domain breakdown, recommendations. */
export async function diagnosticAnalysisForStudent(repo: Repo, actor: Actor, studentId: string): Promise<DiagnosticAnalysis> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const [user, grade, member, state] = await Promise.all([
    repo.findUnique("User", { id: st.userId }),
    repo.findUnique("Grade", { id: st.gradeId }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }).then((m) => m[0]),
    latestDiagnosticState(repo, studentId),
  ]);
  const d = state.summary;
  const klass = member ? await repo.findUnique("Class", { id: s(member.classId) }) : null;
  // 🐛 r91 fix: the modern Diagnostic Test (d.source === "SCORE") has its own overall level (ABOVE/ON/BELOW) and
  // real per-domain percent — using the legacy proficiency-text lookup / theta-based percentLike() for it silently
  // dropped the Tier box and showed a flat 50% for every domain. Read the right fields for whichever placement this is.
  const tier = d ? (d.source === "SCORE" ? d.overallTier ?? null : TIER_OF[d.proficiency] ?? null) : null;
  const skills = d ? await diagnosticSkills(repo, studentId, s(st.schoolId), d) : { recommended: [], support: [], noData: false };
  return {
    studentId, name: s(user?.displayName), studentNumber: s(st.studentNumber), grade: num(grade?.level), className: klass ? s(klass.name) : null,
    takenAt: d?.takenAt ?? null, questions: d?.questions ?? 0, proficiency: d?.proficiency ?? null, tier,
    domains: (d?.domains ?? []).map((x) => ({
      domain: x.domain, label: x.label, level: x.level, theta: Math.round(x.theta * 100) / 100,
      percentLike: x.pct !== undefined ? x.pct : percentLike(x.theta), items: x.items,
      prescription: PRESCRIPTION[x.domain] ?? "Review the domain's recent answers with the student.",
    })),
    strengths: d?.strong ?? [], growthAreas: d?.growth ?? [], notMeasured: d?.notMeasured ?? [],
    recommendedSkills: skills.recommended, supportSkills: skills.support,
    adaptive: Boolean(d?.adaptive), thetaMeasured: Boolean(d) && d!.source !== "SCORE", noSkillData: skills.noData,
    invalidNewer: state.invalidNewer,
  };
}

/**
 * The skills to start with / to support after a Diagnostic: the old placement's saved skills, or (Diagnostic Test) the
 * grade's skills of the result's weakest standards (under 60 → start with; under 40 → support) — never a skill the
 * student has ⭐ on now (SkillStatus, by skill key) and never the hidden Curriculum Map holder skill.
 */
async function diagnosticSkills(repo: Repo, studentId: string, schoolId: string, d: DiagnosticSummary): Promise<{ recommended: { skillId: string; name: string }[]; support: { skillId: string; name: string }[]; noData: boolean }> {
  let rec: { skillId: string; name: string }[] = [], sup: { skillId: string; name: string }[] = [];
  if (d.source === "SCORE") {
    const weak = d.weakStandards ?? [];
    if (!weak.length) return { recommended: [], support: [], noData: false }; // no weak standard: nothing to start with
    if (!d.grade) return { recommended: [], support: [], noData: true };
    const { skillsForAnchors } = await import("../diagnostic/report");
    const found = await skillsForAnchors(repo, schoolId, d.grade, weak.map((x) => x.anchor));
    if (!found.length) return { recommended: [], support: [], noData: true };
    const low = new Set(weak.filter((x) => x.pct < 40).map((x) => x.anchor));
    sup = found.filter((k) => low.has(k.anchor));
    rec = found.filter((k) => !sup.some((x) => x.skillId === k.skillId));
  } else {
    rec = d.startWith; sup = d.support;
    const ids = [...new Set([...rec, ...sup].map((k) => k.skillId))];
    const hidden = new Set((ids.length ? await repo.findMany("Skill", { id: { in: ids } }, { select: ["id", "code"] }) : []).filter((k) => isHiddenSkill(k.code)).map((k) => s(k.id)));
    rec = rec.filter((k) => !hidden.has(k.skillId)); sup = sup.filter((k) => !hidden.has(k.skillId));
  }
  if (rec.length || sup.length) {
    const book = await starBook(repo, [studentId], schoolId);
    const open = (k: { skillId: string }) => !starMastered(book.of(studentId, k.skillId));
    rec = rec.filter(open); sup = sup.filter(open);
  }
  return { recommended: rec.slice(0, 3).map(({ skillId, name }) => ({ skillId, name })), support: sup.slice(0, 3).map(({ skillId, name }) => ({ skillId, name })), noData: false };
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
  tiers: { tier: DiagnosticTier; label: string; students: { studentId: string; name: string; proficiency: string | null; domains: Record<string, string>; domainScores: Record<string, number>; domainText: Record<string, string> }[] }[];
  /** owner's two reference reports (Grade 4 tracking sheet, Grade 11 assessment report) both flag who has not completed the check, with a required action — merged into this one report. */
  notTaken: { studentId: string; name: string; action: string }[];
}

/** A missing result's suggested next step: no placement data at all yet (never attempted) vs an old one gone stale. */
export const NOT_TAKEN_ACTION = "No placement/diagnostic result yet: assign the Diagnostic check, or confirm the student has completed enough practice for one to be calculated.";
export const INVALID_ACTION = "Not valid (too many fast answers) — retake recommended";

/**
 * The whole class's Diagnostic Analysis, grouped by tier (the school's own master-table format): every student
 * once, with their domain levels side by side, so a teacher can see the whole class' placement at a glance.
 */
export async function diagnosticAnalysisForClass(repo: Repo, actor: Actor, classId: string): Promise<DiagnosticClassReport> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: s(klass.gradeId) }))?.level ?? 0);
  const ids = await classStudentIds(repo, classId);
  const rows = await mapLimit(ids, (id) => diagnosticAnalysisForStudent(repo, actor, id), 4);
  const domains = [...new Set(rows.flatMap((r) => r.domains.map((x) => x.label)))];
  const TIERS: DiagnosticTier[] = ["ADVANCED", "PROFICIENT", "APPROACHING", "INTENSIVE"];
  const tiers = TIERS.map((tier) => ({
    tier, label: TIER_LABEL[tier],
    students: rows.filter((r) => r.tier === tier).map((r) => ({
      studentId: r.studentId, name: r.name, proficiency: r.proficiency,
      domains: Object.fromEntries(r.domains.map((x) => [x.label, x.level])),
      domainScores: Object.fromEntries(r.domains.map((x) => [x.label, x.percentLike])),
      // the cell as printed: the Diagnostic Test's level already carries its number ("Strength (78%)" / "(78)" adaptive)
      domainText: Object.fromEntries(r.domains.map((x) => [x.label, r.thetaMeasured ? `${x.level} (${x.percentLike})` : x.level])),
    })),
  }));
  return { classId, className: s(klass.name), grade, domains, tiers, notTaken: rows.filter((r) => r.tier === null).map((r) => ({ studentId: r.studentId, name: r.name, action: r.invalidNewer ? INVALID_ACTION : NOT_TAKEN_ACTION })) };
}

// -------------------------------------------------------------- 3. Final Report (per student)

/**
 * 🗒️ Final Report (owner, 1 Nov 2026: "everything identical, linked to the same system"):
 *   - Questions / Accuracy / Minutes = the Practice and time numbers (analytics/practice-totals.ts through
 *     studentAnalytics): skill practice + NAFS practice + ReadRise; rapid guesses out of accuracy; ≤ 5 min per answer.
 *     Tests, lessons and ReadMaster answers are shown apart (`otherAnswers`), never mixed in.
 *   - Skills mastered / developing / needs support = the SkillStatus stars, counted by skill key.
 *   - Growth = the change of the STARS in the period (star-read.ts starChange): ⭐ earned, 🔄 to review, up / down.
 *     The old engine-score "paired growth" and its red regression banner are gone.
 *   - Alerts: open ones only, never on a skill the student has ⭐ on (studentDetail), each with its next step.
 *   - MAP: one block per subject — every test's overall RIT (oldest → newest, with the change) and the latest test's
 *     goal areas.
 *   - The whole-class view builds the class's plans once and the students 3 at a time (512 MB server).
 */
export interface FinalReport {
  studentId: string; name: string; studentNumber: string; grade: number; className: string | null;
  period: { name: PeriodName; label: string; from: string; to: string };
  kpis: {
    questions: number; accuracyPct: number | null; minutes: number; skillsMastered: number; skillsDeveloping: number;
    skillsNeedingSupport: number; curriculumProgressPct: number | null; newStars: number; toReview: number;
  };
  /** answers NOT in the numbers above (they never build a star): tests & checks, lessons / ReadMaster / reviews */
  otherAnswers: { tests: number; other: number };
  starChange: StarChange;
  bySource: BySourceReport;
  map: FinalMapSubject[];
  diagnostic: DiagnosticAnalysis | null;
  plans: { subject: "READING" | "LANGUAGE"; band: Band | null; goals: string[]; strengths: string[]; areaPercentiles: AreaQuintileRow[] }[];
  /** a subject with no plan, and why (shown instead of silently leaving it out) */
  missingPlans: { subject: "READING" | "LANGUAGE"; reason: "NO_MAP" | "NO_CLASS" }[];
  /** rule = the alert's rule code (the page shows its next step in the reader's language) */
  alerts: { rule: string; message: string; nextAction: string }[];
}
export interface FinalMapSubject {
  subject: string;
  /** every test's overall result, oldest first */
  tests: { date: string; rit: number; percentile: number | null }[];
  /** latest overall RIT − first overall RIT (null with one test) */
  change: number | null;
  /** the latest test's goal areas */
  areas: { goal: string; rit: number; percentile: number | null }[];
}

/** Pure: the imported MAP rows grouped by subject (overall rows per test date; the latest test's goal areas). */
export function groupMap(rows: readonly { testDate: string; subject: string; goalArea: string | null; rit: number; percentile: number | null }[]): FinalMapSubject[] {
  const bySubject = new Map<string, typeof rows[number][]>();
  for (const r of rows) { const l = bySubject.get(r.subject) ?? []; l.push(r); bySubject.set(r.subject, l); }
  return [...bySubject].map(([subject, list]) => {
    const overall = new Map<string, { date: string; rit: number; percentile: number | null }>();
    for (const r of list) if (!r.goalArea) overall.set(r.testDate.slice(0, 10), { date: r.testDate.slice(0, 10), rit: r.rit, percentile: r.percentile });
    const tests = [...overall.values()].sort((a, b) => a.date.localeCompare(b.date));
    const latest = [...list].map((r) => r.testDate.slice(0, 10)).sort().pop() ?? "";
    const areas = list.filter((r) => r.goalArea && r.testDate.slice(0, 10) === latest).map((r) => ({ goal: r.goalArea as string, rit: r.rit, percentile: r.percentile }))
      .sort((a, b) => a.rit - b.rit || a.goal.localeCompare(b.goal));
    return { subject, tests, change: tests.length > 1 ? tests[tests.length - 1].rit - tests[0].rit : null, areas };
  }).sort((a, b) => a.subject.localeCompare(b.subject));
}

/** The class's two personalized plans and profiles, read once (the whole-class view shares them; the promise is kept
 *  at once, so students built at the same time wait for the same read). */
type PlanRead = { plan: PersonalPlan; profile: Awaited<ReturnType<typeof classProfile>> | null } | null;
interface PlanContext { classId: string; byClass: Map<string, Partial<Record<"READING" | "LANGUAGE", Promise<PlanRead>>>> }
function planOf(repo: Repo, actor: Actor, ctx: PlanContext, classId: string, subject: "READING" | "LANGUAGE"): Promise<PlanRead> {
  const m = ctx.byClass.get(classId) ?? {};
  ctx.byClass.set(classId, m);
  return (m[subject] ??= personalPlan(repo, actor, classId, subject)
    .then(async (plan) => ({ plan, profile: await classProfile(repo, actor, classId, subject).catch(() => null) }))
    .catch(() => null));
}

/** The most complete single-student document on the platform: aggregates what the by-source, diagnostic, personalized-plan and class/student screens already compute. */
export async function finalReportForStudent(repo: Repo, actor: Actor, studentId: string, period: Period, opts: { classId?: string; ctx?: PlanContext } = {}): Promise<FinalReport> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const [user, grade, members] = await Promise.all([
    repo.findUnique("User", { id: st.userId }),
    repo.findUnique("Grade", { id: st.gradeId }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
  ]);
  // the class of the report: the one it was opened from, else every class the student is in
  const classIds = members.map((m) => s(m.classId));
  const classId = opts.classId && classIds.includes(opts.classId) ? opts.classId : classIds[0] ?? "";
  const classes = classIds.length ? await repo.findMany("Class", { id: { in: classIds } }, { select: ["id", "name"] }) : [];
  const className = opts.classId && classIds.includes(opts.classId)
    ? s(classes.find((k) => s(k.id) === opts.classId)?.name) || null
    : classes.length ? classes.map((k) => s(k.name)).sort().join(" · ") : null;
  // one after another: each is a full report of its own (memory first)
  const a = await studentAnalytics(repo, actor, studentId, period);
  const d = await studentDetail(repo, actor, studentId);
  const src = await bySourceReport(repo, actor, studentId, period);
  const diag = await diagnosticAnalysisForStudent(repo, actor, studentId);
  const ctx: PlanContext = opts.ctx ?? { classId, byClass: new Map() };
  const plans: FinalReport["plans"] = [];
  const missingPlans: FinalReport["missingPlans"] = [];
  for (const subject of ["READING", "LANGUAGE"] as const) {
    if (!classId) { missingPlans.push({ subject, reason: "NO_CLASS" }); continue; }
    const pc = await planOf(repo, actor, ctx, classId, subject);
    const row = pc?.plan.bands.flatMap((b) => b.students.map((x) => ({ ...x, band: b.band }))).find((x) => x.studentId === studentId);
    if (!pc || !row) { missingPlans.push({ subject, reason: "NO_MAP" }); continue; }
    const band = pc.plan.bands.find((b) => b.band === row.band) ?? null;
    plans.push({
      subject, band: band?.band ?? bandOf(row.percentile, null),
      // the student's OWN goal areas (personal-plan studentGoals), never the band's average
      goals: (pc.plan.studentGoals[studentId]?.goals ?? []).map((g) => g.area), strengths: (pc.plan.studentGoals[studentId]?.strengths ?? []).map((g) => g.area),
      areaPercentiles: pc.profile ? studentAreaQuintiles(pc.profile, studentId) : [],
    });
  }
  return {
    studentId, name: s(user?.displayName), studentNumber: s(st.studentNumber), grade: num(grade?.level), className,
    period: { name: period.name, label: period.label, from: period.from.toISOString().slice(0, 10), to: period.to.toISOString().slice(0, 10) },
    kpis: {
      questions: a.questions, accuracyPct: a.accuracyPct, minutes: a.minutes, skillsMastered: a.skillsMastered, skillsDeveloping: a.skillsDeveloping,
      skillsNeedingSupport: a.skillsNeedingIntervention, curriculumProgressPct: a.curriculumProgressPct, newStars: a.starChange.gained, toReview: a.starChange.toReview,
    },
    otherAnswers: { tests: a.bySource.TESTS, other: a.bySource.OTHER },
    starChange: a.starChange,
    bySource: src, map: groupMap(a.importedMap),
    diagnostic: diag, plans, missingPlans,
    alerts: d.alerts.map((x) => ({ rule: x.rule, message: x.message, nextAction: x.nextAction })),
  };
}

/** Every student's Final Report of a class, one after another (print all / save as one PDF for the whole class). */
export async function finalReportsForClass(repo: Repo, actor: Actor, classId: string, period: Period): Promise<{ classId: string; className: string; grade: number; reports: FinalReport[] }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: s(klass.gradeId) }))?.level ?? 0);
  const ids = await classStudentIds(repo, classId);
  // the class's plans once; 3 students at a time (never the whole class at once on a 512 MB server)
  const ctx: PlanContext = { classId, byClass: new Map() };
  const reports = await mapLimit(ids, (id) => finalReportForStudent(repo, actor, id, period, { classId, ctx }), 3);
  return { classId, className: s(klass.name), grade, reports };
}
