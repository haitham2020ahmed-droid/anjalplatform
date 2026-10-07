/**
 * Analytics reports.
 *  studentAnalytics  — every per-student metric in brief §11 (+ imported MAP results, kept separate).
 *  classComparison   — class vs grade vs school (aggregates only, suppressed below 5 students),
 *                      plus district/national ONLY from imported BenchmarkReference rows.
 *  standardsReport   — accuracy by CCSS standard for a class or the whole school.
 * All numbers are INTERNAL platform measures unless labelled as imported.
 */
import { DOMAIN_LABEL } from "../assessment/diagnostic";
import { assertCan, canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { studentReadingRange } from "../../reading/prl";
import { bandDistribution, mean, round1, streaks, summarize, type Summary } from "../../analytics/stats";
import type { Period } from "../../analytics/periods";
import { getStudentCurriculum } from "../queries/student-curriculum";
import type { Repo, Row } from "../seeding/repo";
import { assertClassAccess } from "../teacher/assignments";
import { groupGrowth, studentGrowth, type GroupGrowth, type StudentGrowth } from "./growth";

export const MIN_GROUP_FOR_COMPARISON = 5;
export const NO_NATIONAL = "National benchmark data not available.";
const num = (v: unknown) => Number(v ?? 0);
const ms = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).getTime();
const inPeriod = (rows: Row[], p: Period, field = "createdAt") => rows.filter((r) => ms(r[field]) >= p.from.getTime() && ms(r[field]) <= p.to.getTime());

export interface StudentAnalytics {
  period: string;
  questions: number;
  correct: number;
  incorrect: number;
  accuracyPct: number | null;
  minutes: number;
  avgSeconds: number | null;
  sessions: number;
  longestSessionMinutes: number;
  skillsAttempted: number;
  skillsMastered: number;
  skillsDeveloping: number;
  skillsNeedingIntervention: number;
  ability: number | null;
  readingRange: string | null;
  streakCorrect: { longest: number; current: number };
  streakIncorrect: { longest: number; current: number };
  highestLevelCorrect: number;
  unitProgress: { unit: number; pct: number }[];
  curriculumProgressPct: number;
  recentActivity: string[];
  growth: StudentGrowth;
  importedMap: { testDate: string; subject: string; goalArea: string | null; rit: number; percentile: number | null }[];
}

export async function studentAnalytics(repo: Repo, actor: Actor, studentId: string, period: Period): Promise<StudentAnalytics> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: String(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const [grade, attemptsAll, sessionsAll, mastery, abilities, alerts, maps, cur, growth] = await Promise.all([
    repo.findUnique("Grade", { id: st.gradeId }).then((g) => g!),
    repo.findMany("QuestionAttempt", { studentId }, { select: ["questionId", "createdAt", "isCorrect", "responseMs", "rapidGuess"] }),
    repo.findMany("PracticeSession", { studentId }, { select: ["startedAt", "mode", "endedAt", "activeMs"] }),
    repo.findMany("StudentSkillMastery", { studentId }),
    repo.findMany("StudentAbility", { studentId }),
    repo.findMany("InterventionAlert", { studentId, resolvedAt: null }),
    repo.findMany("MapResult", { studentId }),
    getStudentCurriculum(repo, studentId),
    studentGrowth(repo, studentId, period),
  ]);
  const attempts = inPeriod(attemptsAll, period).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const sessions = inPeriod(sessionsAll, period, "startedAt").filter((s) => s.mode === "ADAPTIVE_PRACTICE" && s.endedAt);
  const qIds = [...new Set(attempts.map((a) => String(a.questionId)))];
  const mapRows = maps.sort((a, b) => ms(b.testDate) - ms(a.testDate));
  const [questions, goalAreas] = await Promise.all([
    qIds.length ? repo.findMany("Question", { id: { in: qIds } }, { select: ["id", "difficultyLevel"] }) : Promise.resolve([] as Row[]),
    mapRows.some((m) => m.goalAreaId) ? repo.findMany("MapGoalArea", { id: { in: mapRows.map((m) => m.goalAreaId).filter(Boolean) } }) : Promise.resolve([] as Row[]),
  ]);
  const level = new Map(questions.map((q) => [String(q.id), num(q.difficultyLevel)]));
  const practised = mastery.filter((m) => num(m.attempts) > 0);
  const global = abilities.find((a) => a.scope === "GLOBAL");
  const reading = abilities.find((a) => a.scope === "DOMAIN:READING");
  const skillThetas = abilities.filter((a) => String(a.scope).startsWith("SKILL:")).map((a) => num(a.theta));
  const ability = global ? num(global.theta) : mean(skillThetas);
  const allUnitSkills = cur.units.reduce((t, u) => t + u.skills, 0);
  const seq = attempts.filter((a) => !a.rapidGuess).map((a) => Boolean(a.isCorrect));
  return {
    period: period.label,
    questions: attempts.length,
    correct: attempts.filter((a) => a.isCorrect).length,
    incorrect: attempts.filter((a) => !a.isCorrect).length,
    accuracyPct: attempts.length ? Math.round((100 * attempts.filter((a) => a.isCorrect).length) / attempts.length) : null,
    minutes: Math.round(attempts.reduce((t, a) => t + num(a.responseMs), 0) / 60_000),
    avgSeconds: attempts.length ? round1(attempts.reduce((t, a) => t + num(a.responseMs), 0) / attempts.length / 1000) : null,
    sessions: sessions.length,
    longestSessionMinutes: Math.round(Math.max(0, ...sessions.map((s) => num(s.activeMs))) / 60_000),
    skillsAttempted: practised.length,
    skillsMastered: practised.filter((m) => m.isMastered).length,
    skillsDeveloping: practised.filter((m) => ["DEVELOPING", "APPROACHING"].includes(String(m.band))).length,
    skillsNeedingIntervention: new Set(alerts.map((a) => String(a.skillId))).size,
    ability: ability === null ? null : Math.round(ability * 100) / 100,
    readingRange: reading ? studentReadingRange(num(grade.level), num(reading.theta), num(reading.thetaSE)).label : null,
    streakCorrect: streaks(seq, true),
    streakIncorrect: streaks(seq, false),
    highestLevelCorrect: Math.max(0, ...attempts.filter((a) => a.isCorrect && !a.rapidGuess).map((a) => level.get(String(a.questionId)) ?? 0)),
    unitProgress: cur.units.map((u) => ({ unit: u.number, pct: u.progressPct })),
    curriculumProgressPct: allUnitSkills ? Math.round((100 * cur.units.reduce((t, u) => t + u.proficientOrBetter, 0)) / allUnitSkills) : 0,
    recentActivity: [...new Set(attemptsAll.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).map((a) => new Date(ms(a.createdAt)).toISOString().slice(0, 10)))].slice(0, 5),
    growth,
    importedMap: mapRows.map((m) => ({
      testDate: new Date(ms(m.testDate)).toISOString().slice(0, 10), subject: String(m.subject),
      goalArea: m.goalAreaId ? String(goalAreas.find((g) => g.id === m.goalAreaId)?.name ?? "") : null,
      rit: num(m.rit), percentile: m.achievementPercentile === null || m.achievementPercentile === undefined ? null : num(m.achievementPercentile),
    })),
  };
}

// ------------------------------------------------------------------ comparisons

interface GroupMetrics {
  label: string;
  students: number;
  studentsWithData: number;
  avgMastery: number | null;
  accuracyPct: number | null;
  meanGrowth: number | null;
  suppressed: boolean; // fewer than MIN_GROUP_FOR_COMPARISON students with data
}

async function metricsFor(repo: Repo, label: string, ids: string[], period: Period, suppressSmall: boolean): Promise<GroupMetrics & { growth: GroupGrowth; masteries: number[] }> {
  const [mastery, attempts] = await Promise.all([
    ids.length ? repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "attempts", "score"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: period.from, lte: period.to } }, { select: ["createdAt", "isCorrect"] }) : Promise.resolve([] as Row[]),
  ]);
  const perStudent = ids.map((id) => mean(mastery.filter((m) => m.studentId === id && num(m.attempts) > 0).map((m) => num(m.score)))).filter((x): x is number => x !== null);
  const a = attempts.filter((x) => ms(x.createdAt) <= period.to.getTime());
  const growth = await groupGrowth(repo, ids, period);
  const suppressed = suppressSmall && perStudent.length < MIN_GROUP_FOR_COMPARISON;
  return {
    label, students: ids.length, studentsWithData: perStudent.length, suppressed,
    avgMastery: suppressed ? null : round1(mean(perStudent)),
    accuracyPct: suppressed || !a.length ? null : Math.round((100 * a.filter((x) => x.isCorrect).length) / a.length),
    meanGrowth: suppressed ? null : growth.meanGrowth,
    growth, masteries: perStudent.map((x) => Math.round(x)),
  };
}

export interface ExternalBenchmark {
  scope: "DISTRICT" | "NATIONAL";
  available: boolean;
  message: string;
  value?: number;
  metric?: string;
  source?: string;
}

export interface ClassComparison {
  period: string;
  rows: GroupMetrics[];
  external: ExternalBenchmark[];
  classGrowth: GroupGrowth;
  distribution: { label: string; count: number }[];
  masterySummary: Summary;
}

export async function classComparison(repo: Repo, actor: Actor, classId: string, period: Period): Promise<ClassComparison> {
  const klass = await assertClassAccess(repo, actor, classId);
  const [grade, classRows, gradeRows, schoolRows] = await Promise.all([
    repo.findUnique("Grade", { id: klass.gradeId }).then((g) => g!),
    repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] }),
    repo.findMany("Student", { gradeId: klass.gradeId, deletedAt: null }, { select: ["id"] }),
    repo.findMany("Student", { schoolId: klass.schoolId, deletedAt: null }, { select: ["id"] }),
  ]);
  const classIds = classRows.map((m) => String(m.studentId));
  const gradeIds = gradeRows.map((s) => String(s.id));
  const schoolIds = schoolRows.map((s) => String(s.id));
  const [c, g, s, refs] = await Promise.all([
    metricsFor(repo, `Class ${String(klass.name)}`, classIds, period, false),
    metricsFor(repo, `Grade ${num(grade.level)} (school)`, gradeIds, period, true),
    metricsFor(repo, "Whole school", schoolIds, period, true),
    repo.findMany("BenchmarkReference", { gradeLevel: num(grade.level), metric: { in: ["AVG_MASTERY", "ACCURACY_PCT"] } }),
  ]);
  const external: ExternalBenchmark[] = (["DISTRICT", "NATIONAL"] as const).map((scope) => {
    const r = refs.find((x) => x.scope === scope);
    return r
      ? { scope, available: true, message: `${scope === "NATIONAL" ? "National" : "District"} reference (imported)`, value: num(r.value), metric: String(r.metric), source: String(r.source) }
      : { scope, available: false, message: scope === "NATIONAL" ? NO_NATIONAL : "District benchmark data not available." };
  });
  const strip = (m: typeof c): GroupMetrics => ({ label: m.label, students: m.students, studentsWithData: m.studentsWithData, avgMastery: m.avgMastery, accuracyPct: m.accuracyPct, meanGrowth: m.meanGrowth, suppressed: m.suppressed });
  return {
    period: period.label,
    rows: [strip(c), strip(g), strip(s)],
    external,
    classGrowth: c.growth,
    distribution: bandDistribution(c.masteries),
    masterySummary: summarize(c.masteries),
  };
}

// ------------------------------------------------------------------ standards

export interface StandardRow {
  code: string;
  short: string;
  description: string;
  attempts: number;
  students: number;
  accuracyPct: number;
}

export async function standardsReport(repo: Repo, actor: Actor, scope: { classId: string } | { school: true }, period: Period): Promise<{ rows: StandardRow[]; notAssessed: number }> {
  let ids: string[];
  let gradeLevels: number[];
  if ("classId" in scope) {
    const klass = await assertClassAccess(repo, actor, scope.classId);
    ids = (await repo.findMany("ClassMembership", { classId: scope.classId, leftAt: null })).map((m) => String(m.studentId));
    gradeLevels = [num((await repo.findUnique("Grade", { id: klass.gradeId }))!.level)];
  } else {
    assertCan(actor, "analytics:school");
    if (!actor.schoolId) throw new ForbiddenError("No school selected.");
    ids = (await repo.findMany("Student", { schoolId: actor.schoolId, deletedAt: null })).map((s) => String(s.id));
    gradeLevels = (await repo.findMany("Grade", { schoolId: actor.schoolId })).map((g) => num(g.level));
  }
  const attempts = ids.length ? inPeriod(await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: period.from, lte: period.to } }, { select: ["studentId", "questionId", "isCorrect", "rapidGuess", "createdAt"] }), period).filter((a) => !a.rapidGuess) : [];
  const qIds = [...new Set(attempts.map((a) => String(a.questionId)))];
  const questions = qIds.length ? await repo.findMany("Question", { id: { in: qIds } }, { select: ["id", "standardId"] }) : [];
  const stdOf = new Map(questions.map((q) => [String(q.id), q.standardId ? String(q.standardId) : null]));
  const grouped = new Map<string, Row[]>();
  for (const a of attempts) {
    const sid = stdOf.get(String(a.questionId));
    if (sid) (grouped.get(sid) ?? grouped.set(sid, []).get(sid)!).push(a);
  }
  const [stds, all] = await Promise.all([
    grouped.size ? repo.findMany("Standard", { id: { in: [...grouped.keys()] } }) : Promise.resolve([] as Row[]),
    repo.findMany("Standard", { framework: "CCSS_ELA", gradeLevel: { in: gradeLevels } }, { select: ["id"] }),
  ]);
  const rows = [...grouped].filter(([, as]) => as.length >= 5).map(([sid, as]) => {
    const s = stds.find((x) => x.id === sid)!;
    return {
      code: String(s.code), short: String(s.code).replace("CCSS.ELA-LITERACY.", ""), description: String(s.description ?? ""),
      attempts: as.length, students: new Set(as.map((a) => String(a.studentId))).size,
      accuracyPct: Math.round((100 * as.filter((a) => a.isCorrect).length) / as.length),
    };
  }).sort((a, b) => a.accuracyPct - b.accuracyPct);
  return { rows, notAssessed: all.filter((s) => !grouped.has(String(s.id))).length };
}

export { DOMAIN_LABEL };
