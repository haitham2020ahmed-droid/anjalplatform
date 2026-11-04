/**
 * Analytics reports.
 *  studentAnalytics  — every per-student metric in brief §11 (+ imported MAP results, kept separate).
 *  classComparison   — class vs grade vs school (aggregates only, suppressed below 5 students),
 *                      plus district/national ONLY from imported BenchmarkReference rows.
 *  standardsReport   — accuracy by CCSS standard for a class or the whole school.
 * All numbers are INTERNAL platform measures unless labelled as imported.
 *
 * Round 2 (owner, 1 Nov 2026 — "everything identical, linked to the same system"):
 *  - Questions / accuracy / minutes = practiceTotals (analytics/practice-totals.ts), the Practice and time numbers.
 *  - Growth = the change of the STARS in the period (skills/star-read.ts starChange / starPairs): ⭐ earned,
 *    🔄 needs review, skills up / down a star. The engine's score change is never shown as growth.
 */
import { keptWhileUnchanged } from "../cache/kept";
import { eachLimit } from "../db/parallel";
import { DOMAIN_LABEL } from "../assessment/diagnostic";
import { assertCan, canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { studentReadingRange } from "../../reading/prl";
import { mean, round1, streaks, summarize, type Summary } from "../../analytics/stats";
import { months, type Period } from "../../analytics/periods";
import { getStudentCurriculum } from "../queries/student-curriculum";
import type { Repo, Row } from "../seeding/repo";
import { assertClassAccess } from "../teacher/assignments";
import { NO_STAR_CHANGE, starBook, starChangeOf, starLearning, starMastered, starNeedsHelp, starNeedsReview, starPairs, type StarChange } from "../skills/star-read";
import type { StarStatus } from "../skills/status";
import { hiddenStarKeys, startedStars } from "../teacher/queries";
import { practiceTotals, practiceTotalsFor } from "./practice-totals";
import type { AnswerSource } from "./practice";

export const MIN_GROUP_FOR_COMPARISON = 5;
export const NO_NATIONAL = "National benchmark data not available.";
const num = (v: unknown) => Number(v ?? 0);
const ms = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).getTime();
/** Students per database read in the school-wide figures (Update 42A: bounded memory). */
const STUDENT_CHUNK = 25;
const CHUNK_PARALLEL = 3;
const inPeriod = (rows: Row[], p: Period, field = "createdAt") => rows.filter((r) => ms(r[field]) >= p.from.getTime() && ms(r[field]) <= p.to.getTime());
const pctOf = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);

/** ⭐ one skill KEY's star at the period start and now (the student's "growth by skill"). */
export interface StarSkillChange { key: string; name: string; then: StarStatus; now: StarStatus }

export interface StudentAnalytics {
  period: string;
  /** 📏 practiceTotals (the Practice and time numbers): answers of the star sources (skill practice, NAFS, ReadRise) */
  questions: number;
  /** right careful answers */
  correct: number;
  /** wrong careful answers (a literal instant misclick counts as neither — Nov 2026 redesign; a merely fast
   *  answer is careful and counts here like any other) */
  incorrect: number;
  /** right / careful answers (a literal instant misclick left out) */
  accuracyPct: number | null;
  /** at most 5 minutes per answer */
  minutes: number;
  /** minutes ÷ timed answers */
  avgSeconds: number | null;
  /** every source counted apart (tests, lessons, ReadMaster … included) */
  bySource: Record<AnswerSource, number>;
  sessions: number;
  longestSessionMinutes: number;
  /** ⭐ counted by skill KEY from the ONE star system (the Student Skills numbers): started (◐ ⭐ 🔄) · ⭐ mastered ·
   *  ◐ in progress (not needing support) · 🔄 needs review or ◐ needing support */
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
  curriculumProgressPct: number | null;
  recentActivity: string[];
  /** 📈 growth = the change of the stars in the period (starChange) */
  starChange: StarChange;
  /** each skill's star at the period start → now (⭐ earned first) */
  starSkills: StarSkillChange[];
  importedMap: { testDate: string; subject: string; goalArea: string | null; rit: number; percentile: number | null }[];
}

const STAR_ORDER = (p: { then: StarStatus; now: StarStatus }) => {
  const up = (p.now === "MASTERED" || p.now === "NEXT_LEVEL") && p.then !== "MASTERED" && p.then !== "NEXT_LEVEL";
  return up ? 0 : p.now === "NEEDS_REVIEW" && p.then !== "NEEDS_REVIEW" ? 1 : p.then !== p.now ? 2 : 3;
};

export async function studentAnalytics(repo: Repo, actor: Actor, studentId: string, period: Period): Promise<StudentAnalytics> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: String(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const schoolId = String(st.schoolId);
  const inRange = { gte: period.from, lte: period.to };
  // every read bounded by the period (the year's answers are never read whole); the totals are the Practice and time ones
  const [grade, attemptsIn, sessionsIn, recent, book, abilities, maps, cur, totals, pairsOf] = await Promise.all([
    repo.findUnique("Grade", { id: st.gradeId }).then((g) => g!),
    repo.findMany("QuestionAttempt", { studentId, createdAt: inRange }, { select: ["questionId", "createdAt", "isCorrect", "rapidGuess"] }),
    repo.findMany("PracticeSession", { studentId, startedAt: inRange }, { select: ["startedAt", "mode", "endedAt", "activeMs"] }),
    repo.findMany("QuestionAttempt", { studentId }, { select: ["createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 300 }),
    starBook(repo, [studentId], schoolId),
    repo.findMany("StudentAbility", { studentId }),
    repo.findMany("MapResult", { studentId }),
    getStudentCurriculum(repo, studentId),
    practiceTotalsFor(repo, studentId, period.from, period.to, { schoolId, days: true }),
    starPairs(repo, [studentId], period.from, period.to),
  ]);
  const attempts = inPeriod(attemptsIn, period).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const sessions = inPeriod(sessionsIn, period, "startedAt").filter((s) => s.mode === "ADAPTIVE_PRACTICE" && s.endedAt);
  const qIds = [...new Set(attempts.filter((a) => a.isCorrect && !a.rapidGuess).map((a) => String(a.questionId)))];
  const mapRows = maps.sort((a, b) => ms(b.testDate) - ms(a.testDate));
  const [questions, goalAreas] = await Promise.all([
    qIds.length ? repo.findMany("Question", { id: { in: qIds } }, { select: ["id", "difficultyLevel"] }) : Promise.resolve([] as Row[]),
    mapRows.some((m) => m.goalAreaId) ? repo.findMany("MapGoalArea", { id: { in: mapRows.map((m) => m.goalAreaId).filter(Boolean) } }) : Promise.resolve([] as Row[]),
  ]);
  const level = new Map(questions.map((q) => [String(q.id), num(q.difficultyLevel)]));
  // ⭐ the skills by KEY from the star system; the hidden “Unclassified (Curriculum Map)” skill is never counted (I-19)
  // “needing support” = 🔄 needs review, or ◐ with the needs-support flag (50 answers without mastery)
  const hidden = await hiddenStarKeys(repo, book);
  const practised = startedStars(book, studentId, hidden);
  const pairs = (pairsOf.get(studentId) ?? []).filter((p) => !hidden.has(p.key));
  const global = abilities.find((a) => a.scope === "GLOBAL");
  const reading = abilities.find((a) => a.scope === "DOMAIN:READING");
  const skillThetas = abilities.filter((a) => String(a.scope).startsWith("SKILL:")).map((a) => num(a.theta));
  const ability = global ? num(global.theta) : mean(skillThetas);
  const allUnitSkills = cur.units.reduce((t, u) => t + u.skills, 0);
  const seq = attempts.filter((a) => !a.rapidGuess).map((a) => Boolean(a.isCorrect));
  const timed = totals.questions - totals.untimed;
  return {
    period: period.label,
    questions: totals.questions,
    correct: totals.correct,
    incorrect: totals.careful - totals.correct,
    accuracyPct: totals.accuracy,
    minutes: totals.minutes,
    avgSeconds: timed > 0 && totals.minutes > 0 ? round1((totals.minutes * 60) / timed) : null,
    bySource: totals.bySource,
    sessions: sessions.length,
    longestSessionMinutes: Math.round(Math.max(0, ...sessions.map((s) => num(s.activeMs))) / 60_000),
    skillsAttempted: practised.length,
    skillsMastered: practised.filter(starMastered).length,
    skillsDeveloping: practised.filter((v) => starLearning(v) && !v.needsSupport).length,
    skillsNeedingIntervention: practised.filter(starNeedsHelp).length,
    ability: ability === null ? null : Math.round(ability * 100) / 100,
    readingRange: reading ? studentReadingRange(num(grade.level), num(reading.theta), num(reading.thetaSE)).label : null,
    streakCorrect: streaks(seq, true),
    streakIncorrect: streaks(seq, false),
    highestLevelCorrect: Math.max(0, ...attempts.filter((a) => a.isCorrect && !a.rapidGuess).map((a) => level.get(String(a.questionId)) ?? 0)),
    unitProgress: cur.units.map((u) => ({ unit: u.number, pct: u.progressPct })),
    curriculumProgressPct: allUnitSkills ? Math.round((100 * cur.units.reduce((t, u) => t + u.proficientOrBetter, 0)) / allUnitSkills) : null,
    recentActivity: [...new Set(recent.map((a) => new Date(ms(a.createdAt)).toISOString().slice(0, 10)))].slice(0, 5),
    starChange: starChangeOf(pairs),
    starSkills: pairs.map((p) => ({ key: p.key, name: book.nameOf(p.key), then: p.then, now: p.now }))
      .sort((a, b) => STAR_ORDER(a) - STAR_ORDER(b) || a.name.localeCompare(b.name)),
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
  /** ⭐ the average star score: each student's mean StarView.score over the skill keys they started, then averaged */
  avgMastery: number | null;
  /** 📏 practiceTotals: right / careful answers of the star sources (rapid guesses left out) */
  accuracyPct: number | null;
  /** 📏 practiceTotals: answers of the star sources */
  questions: number;
  /** 📈 ⭐ earned in the period (all students of the group) */
  starsGained: number | null;
  /** 📈 ⭐ earned per student with data (average) */
  avgStarsGained: number | null;
  /** 📈 % of the students with data whose stars went up (trend UP) / down (trend DOWN) */
  upPct: number | null;
  downPct: number | null;
  suppressed: boolean; // fewer than MIN_GROUP_FOR_COMPARISON students with data
}

/** ⭐ the star distribution: started student × skill-key pairs by star. */
export interface StarDistribution { mastered: number; inProgress: number; needsReview: number }

/** 📈 a group's star change in the period (the class "growth" panel). */
export interface GroupStarChange {
  students: number;
  /** students who started at least one star */
  withData: number;
  /** ⭐ earned in the period (total) and per student with data */
  gained: number;
  avgGained: number | null;
  /** 🔄 became needs review in the period (total) */
  toReview: number;
  /** students by trend (UP / SAME / DOWN), students with data only */
  up: number; same: number; down: number;
  upPct: number | null; downPct: number | null;
  /** ⭐ earned by month (masteredAt of the stars held now) */
  byMonth: { label: string; stars: number }[];
  /** skills with ⭐ earned in the period: how many students earned it (most first) */
  skills: { key: string; name: string; gained: number; students: number }[];
}

async function metricsFor(repo: Repo, label: string, ids: string[], period: Period, suppressSmall: boolean, schoolId: string): Promise<GroupMetrics & { change: GroupStarChange; masteries: number[]; stars: StarDistribution }> {
  let careful = 0, correct = 0, questions = 0;
  const masteryOf = new Map<string, number[]>();
  const stars: StarDistribution = { mastered: 0, inProgress: 0, needsReview: 0 };
  const change: GroupStarChange = { students: ids.length, withData: 0, gained: 0, avgGained: null, toReview: 0, up: 0, same: 0, down: 0, upPct: null, downPct: null, byMonth: months(period).map((m) => ({ label: m.label, stars: 0 })), skills: [] };
  const monthEnds = months(period).map((m) => m.end.getTime());
  const fromT = period.from.getTime(), toT = period.to.getTime();
  const perKey = new Map<string, { name: string; gained: number; students: number }>();
  // ⚡ a few chunks at a time (bounded: CHUNK_PARALLEL × STUDENT_CHUNK students in memory)
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += STUDENT_CHUNK) chunks.push(ids.slice(i, i + STUDENT_CHUNK));
  await eachLimit(chunks, async (part) => {
    const [book, totals, pairsOf] = await Promise.all([
      starBook(repo, part, schoolId),
      practiceTotals(repo, part, period.from, period.to, { schoolId, days: true }),
      starPairs(repo, part, period.from, period.to),
    ]);
    for (const tot of totals.values()) { careful += tot.careful; correct += tot.correct; questions += tot.questions; }
    const hidden = await hiddenStarKeys(repo, book);
    for (const id of part) {
      const started = startedStars(book, id, hidden);
      for (const v of started) {
        (masteryOf.get(id) ?? masteryOf.set(id, []).get(id)!).push(v.score);
        if (starMastered(v)) stars.mastered++; else if (starNeedsReview(v)) stars.needsReview++; else stars.inProgress++;
        if (starMastered(v) && v.masteredAt) {
          const at = ms(v.masteredAt);
          if (at >= fromT && at <= toT) { const i = monthEnds.findIndex((e) => at <= e); if (i >= 0) change.byMonth[i].stars++; }
        }
      }
      const pairs = (pairsOf.get(id) ?? []).filter((p) => !hidden.has(p.key));
      const sc = pairs.length ? starChangeOf(pairs) : NO_STAR_CHANGE;
      change.gained += sc.gained; change.toReview += sc.toReview;
      if (started.length || pairs.length) {
        change.withData++;
        if (sc.trend === "UP") change.up++; else if (sc.trend === "DOWN") change.down++; else change.same++;
      }
      for (const p of pairs) {
        const won = (p.now === "MASTERED" || p.now === "NEXT_LEVEL") && p.then !== "MASTERED" && p.then !== "NEXT_LEVEL";
        const k = perKey.get(p.key) ?? perKey.set(p.key, { name: book.nameOf(p.key), gained: 0, students: 0 }).get(p.key)!;
        k.students++; if (won) k.gained++;
      }
    }
  }, CHUNK_PARALLEL);
  const perStudent = ids.map((id) => mean(masteryOf.get(id) ?? [])).filter((x): x is number => x !== null);
  change.avgGained = change.withData ? round1(change.gained / change.withData) : null;
  change.upPct = pctOf(change.up, change.withData);
  change.downPct = pctOf(change.down, change.withData);
  change.skills = [...perKey].filter(([, k]) => k.gained > 0).map(([key, k]) => ({ key, ...k })).sort((a, b) => b.gained - a.gained || a.name.localeCompare(b.name));
  const suppressed = suppressSmall && perStudent.length < MIN_GROUP_FOR_COMPARISON;
  return {
    label, students: ids.length, studentsWithData: perStudent.length, suppressed,
    avgMastery: suppressed ? null : round1(mean(perStudent)),
    accuracyPct: suppressed ? null : pctOf(correct, careful),
    questions: suppressed ? 0 : questions,
    starsGained: suppressed ? null : change.gained,
    avgStarsGained: suppressed ? null : change.avgGained,
    upPct: suppressed ? null : change.upPct,
    downPct: suppressed ? null : change.downPct,
    change, masteries: perStudent.map((x) => Math.round(x)), stars,
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
  /** 📈 the class's star change in the period (replaces the old engine "class growth") */
  classStars: GroupStarChange;
  /** ⭐ the class's started student × skill pairs by star: "Mastered" (⭐), "In progress" (◐), "Needs review" (🔄) */
  distribution: { label: string; count: number }[];
  /** ⭐ the spread of the students' average star scores */
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
  // one group after the other (each already reads CHUNK_PARALLEL × 25 students at a time): 512 MB server
  const c = await metricsFor(repo, `Class ${String(klass.name)}`, classIds, period, false, String(klass.schoolId));
  // the grade and whole-school rows are reference figures: kept for 10 minutes (every class of the school shares them)
  // instead of reading the whole school's answers on every visit
  const span = `${period.from.toISOString().slice(0, 10)}|${period.to.toISOString().slice(0, 13)}`;
  const g = await keptWhileUnchanged(repo, `classcmp|grade|${String(klass.gradeId)}|${span}`, ["Student", "ClassMembership"], 10 * 60_000,
    () => metricsFor(repo, `Grade ${num(grade.level)} (school)`, gradeIds, period, true, String(klass.schoolId)));
  const s = await keptWhileUnchanged(repo, `classcmp|school|${String(klass.schoolId)}|${span}`, ["Student", "ClassMembership"], 10 * 60_000,
    () => metricsFor(repo, "Whole school", schoolIds, period, true, String(klass.schoolId)));
  const refs = await repo.findMany("BenchmarkReference", { gradeLevel: num(grade.level), metric: { in: ["AVG_MASTERY", "ACCURACY_PCT"] } });
  const external: ExternalBenchmark[] = (["DISTRICT", "NATIONAL"] as const).map((scope) => {
    const r = refs.find((x) => x.scope === scope);
    return r
      ? { scope, available: true, message: `${scope === "NATIONAL" ? "National" : "District"} reference (imported)`, value: num(r.value), metric: String(r.metric), source: String(r.source) }
      : { scope, available: false, message: scope === "NATIONAL" ? NO_NATIONAL : "District benchmark data not available." };
  });
  const strip = (m: typeof c): GroupMetrics => ({
    label: m.label, students: m.students, studentsWithData: m.studentsWithData, avgMastery: m.avgMastery, accuracyPct: m.accuracyPct, questions: m.questions,
    starsGained: m.starsGained, avgStarsGained: m.avgStarsGained, upPct: m.upPct, downPct: m.downPct, suppressed: m.suppressed,
  });
  return {
    period: period.label,
    rows: [strip(c), strip(g), strip(s)],
    external,
    classStars: c.change,
    distribution: [{ label: "Mastered", count: c.stars.mastered }, { label: "In progress", count: c.stars.inProgress }, { label: "Needs review", count: c.stars.needsReview }],
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
  // answers read a few students at a time and added up per standard (Update 42A: never the whole school's year at once)
  const stdOf = new Map<string, string | null>();
  const grouped = new Map<string, { attempts: number; correct: number; students: Set<string> }>();
  for (let i = 0; i < ids.length; i += STUDENT_CHUNK) {
    const attempts = inPeriod(await repo.findMany("QuestionAttempt", { studentId: { in: ids.slice(i, i + STUDENT_CHUNK) }, createdAt: { gte: period.from, lte: period.to } }, { select: ["studentId", "questionId", "isCorrect", "rapidGuess", "createdAt"] }), period).filter((a) => !a.rapidGuess);
    const newQ = [...new Set(attempts.map((a) => String(a.questionId)))].filter((q) => !stdOf.has(q));
    for (let k = 0; k < newQ.length; k += 1000) for (const q of await repo.findMany("Question", { id: { in: newQ.slice(k, k + 1000) } }, { select: ["id", "standardId"] })) stdOf.set(String(q.id), q.standardId ? String(q.standardId) : null);
    for (const a of attempts) {
      const sid = stdOf.get(String(a.questionId));
      if (!sid) continue;
      const g = grouped.get(sid) ?? grouped.set(sid, { attempts: 0, correct: 0, students: new Set() }).get(sid)!;
      g.attempts++; if (a.isCorrect) g.correct++; g.students.add(String(a.studentId));
    }
  }
  const [stds, all] = await Promise.all([
    grouped.size ? repo.findMany("Standard", { id: { in: [...grouped.keys()] } }) : Promise.resolve([] as Row[]),
    repo.findMany("Standard", { framework: "CCSS_ELA", gradeLevel: { in: gradeLevels } }, { select: ["id"] }),
  ]);
  const rows = [...grouped].filter(([, g]) => g.attempts >= 5).map(([sid, g]) => {
    const s = stds.find((x) => x.id === sid)!;
    return {
      code: String(s.code), short: String(s.code).replace("CCSS.ELA-LITERACY.", ""), description: String(s.description ?? ""),
      attempts: g.attempts, students: g.students.size,
      accuracyPct: Math.round((100 * g.correct) / g.attempts),
    };
  }).sort((a, b) => a.accuracyPct - b.accuracyPct || a.code.localeCompare(b.code));
  return { rows, notAssessed: all.filter((s) => !grouped.has(String(s.id))).length };
}

export { DOMAIN_LABEL };
