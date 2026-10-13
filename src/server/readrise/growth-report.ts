/**
 * 🚀 ReadRise growth reports — the evidence that a student's growth is REAL, per student and per class.
 *
 *   studentGrowthReport  (teacher/admin) level history from placement through every change with its reason, the
 *                        first-try score trend, words read, articles per week, accuracy by question skill, growth
 *                        confidence ("Level confirmed by 6 readings"), stretch success, the grade's expected range,
 *                        the projected end-of-year level with its range, and recent readings with their FIT (the
 *                        text's measured level vs the student's level: exact / stretch / easy)
 *   myGrowthStory        (the student) the same evidence told in encouraging words — no grade range, no Below/On/Above
 *   classGrowth          (teacher/admin) distribution, growth this term, students not reading for 2 weeks, skill
 *                        weaknesses across the class with suggested articles, and each student's evidence
 *
 * Queries are bounded: one student's rows, or the class's students batched with `in` (only the needed columns).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";
import { fitOf, measuredLevel, type Fit } from "./level";
import { ENGINE, RETAKE_REASON, countsForLevel, goalStats, s, toDate, yearEndFor, type LevelPoint } from "./engine";
import { GOAL_SCORE, INACTIVE_DAYS, gradeBand, histogram, levelAt as levelAtTime, median, type ClassReport } from "./dashboards";
import {
  confidenceText, gradePosition, growthConfidence, keyOf, perWeek, projectionRange, scoreTrend, skillBreakdown, skillCell, storyLines, stretchSuccess, strongerSkills,
  type AnswerKey, type GrowthConfidence, type LevelChangeEvent, type ProjectionRange, type SkillCell, type StoryLine,
} from "./growth";
import { visibleArticles } from "./student";
import { questionKeys } from "./question-key";

const DAY = 86_400_000;
const time = (v: unknown) => (v === null || v === undefined ? 0 : toDate(v).getTime());
const iso = (t: number) => new Date(t).toISOString();
const isFirst = (r: Row) => r.firstTry === true || r.firstTry === 1;
const isStretch = (r: Row) => r.stretch === true || r.stretch === 1;
const scored = (r: Row) => !!r.completedAt && r.score !== null && r.score !== undefined;
const RUN_COLS = ["id", "studentId", "articleId", "band", "versionLevel", "answers", "score", "firstTry", "stretch", "levelBefore", "startedAt", "completedAt"];

/** Start of the current term (else the school year, else 120 days ago). */
export async function termStartOf(repo: Repo, schoolId: string, now: Date): Promise<Date> {
  const year = (await repo.findMany("AcademicYear", { schoolId, isCurrent: true }, { select: ["id", "startDate"], take: 1 }))[0];
  if (year) {
    const terms = await repo.findMany("Term", { academicYearId: year.id }, { select: ["startDate", "endDate"], take: 12 });
    const cur = terms.find((t) => time(t.startDate) <= now.getTime() && time(t.endDate) >= now.getTime());
    if (cur) return new Date(time(cur.startDate));
    if (time(year.startDate) <= now.getTime()) return new Date(time(year.startDate));
  }
  return new Date(now.getTime() - 120 * DAY);
}

async function answerKey(repo: Repo, articleIds: string[]): Promise<AnswerKey> {
  const out: AnswerKey = new Map();
  for (const [id, qs] of await questionKeys(repo, articleIds)) for (const q of qs) out.set(keyOf(id, q.band, q.number), { answer: q.answer, skill: q.skill });
  return out;
}

const changeEvents = (rows: Row[]): LevelChangeEvent[] => rows
  .filter((c) => !s(c.reason).startsWith(RETAKE_REASON))
  .map((c) => ({ at: time(c.createdAt), from: Number(c.fromLevel), to: Number(c.toLevel), reason: s(c.reason) }))
  .sort((a, b) => a.at - b.at);

export type HistoryKind = "START" | "PLACEMENT" | "UP" | "DOWN" | "TEACHER" | "OTHER";
export interface HistoryEvent { at: string; level: number; from: number | null; kind: HistoryKind; reason: string }

const kindOf = (reason: string): HistoryKind =>
  reason.startsWith("Up ") ? "UP" : reason.startsWith("Down ") ? "DOWN" : reason.startsWith("Teacher") ? "TEACHER" : reason.startsWith("Placement") ? "PLACEMENT" : "OTHER";
const START_REASON: Record<string, string> = { PLACEMENT: "Placement test", MAP: "Started from the latest MAP Lexile", DEFAULT: "Started at the grade's default level", TEACHER: "Set by a teacher" };

/** Placement (or the first start) → every later change, each with its reason. */
export function levelJourney(rr: { startLevel: number; placedAt: number; source: string }, changes: LevelChangeEvent[]): { events: HistoryEvent[]; points: LevelPoint[] } {
  const atStart = changes.filter((c) => c.at <= rr.placedAt).pop();
  const startKind: HistoryKind = rr.source === "PLACEMENT" ? "PLACEMENT" : rr.source === "TEACHER" ? "TEACHER" : "START";
  const events: HistoryEvent[] = [{ at: iso(rr.placedAt), level: rr.startLevel, from: null, kind: startKind, reason: atStart && kindOf(atStart.reason) === startKind ? atStart.reason : START_REASON[rr.source] ?? "Start" }];
  for (const c of changes.filter((x) => x.at > rr.placedAt)) events.push({ at: iso(c.at), level: c.to, from: c.from, kind: kindOf(c.reason), reason: c.reason });
  return { events, points: events.map((e) => ({ at: new Date(e.at), level: e.level })) };
}

// ------------------------------------------------------------------ one student

export interface RecentReading { runId: string; title: string; at: string; versionLevel: number; textLevel: number; studentLevel: number; fit: Fit; score: number | null; firstTry: boolean; stretch: boolean }
export interface StudentGrowthData {
  studentId: string; name: string; grade: number; placed: boolean;
  level: number | null; startLevel: number | null; source: string | null;
  history: HistoryEvent[];
  trend: { at: string; score: number; stretch: boolean }[]; recentAvg: number | null; earlierAvg: number | null; scoreDelta: number | null;
  wordsRead: number; readings: number; firstTries: number;
  weeks: string[]; perWeek: number[]; avgPerWeek: number | null;
  skills: ({ skill: string } & SkillCell)[]; stronger: { skill: string; early: number; recent: number }[];
  confidence: GrowthConfidence | null; confidenceText: string;
  stretch: { tried: number; succeeded: number; pct: number | null };
  streak: number; weeksMet: number; movesUp: number;
  projection: ProjectionRange | null;
  recent: RecentReading[];
}

/** Everything about one student's growth (no access check: callers check). */
export async function loadStudentGrowth(repo: Repo, studentId: string, now = new Date()): Promise<StudentGrowthData> {
  const [st, rr] = await Promise.all([repo.findUnique("Student", { id: studentId }), repo.findUnique("RRStudent", { studentId })]);
  if (!st) throw new ForbiddenError("Student not found.");
  const [user, grade] = await Promise.all([
    repo.findUnique("User", { id: s(st.userId) }), st.gradeId ? repo.findUnique("Grade", { id: s(st.gradeId) }) : Promise.resolve(null),
  ]);
  const base: StudentGrowthData = {
    studentId, name: s(user?.displayName) || "Student", grade: Number(grade?.level ?? 0), placed: !!rr, level: rr ? Number(rr.level) : null, startLevel: rr ? Number(rr.startLevel) : null, source: rr ? s(rr.source) : null,
    history: [], trend: [], recentAvg: null, earlierAvg: null, scoreDelta: null, wordsRead: 0, readings: 0, firstTries: 0, weeks: [], perWeek: [], avgPerWeek: null,
    skills: [], stronger: [], confidence: null, confidenceText: "", stretch: { tried: 0, succeeded: 0, pct: null }, streak: 0, weeksMet: 0, movesUp: 0, projection: null, recent: [],
  };
  if (!rr) return base;
  const [changeRows, runs] = await Promise.all([
    repo.findMany("RRLevelChange", { studentId }, { select: ["fromLevel", "toLevel", "reason", "createdAt"] }),
    repo.findMany("RRRun", { studentId }, { select: RUN_COLS }),
  ]);
  const done = runs.filter((r) => r.completedAt).sort((a, b) => time(a.completedAt) - time(b.completedAt));
  const ids = [...new Set(done.map((r) => s(r.articleId)))];
  const [vers, key, arts, yearEnd] = await Promise.all([
    ids.length ? repo.findMany("RRVersion", { articleId: { in: ids } }, { select: ["articleId", "level", "wordCount", "estLevel", "officialLexile"] }) : Promise.resolve([] as Row[]),
    answerKey(repo, ids),
    ids.length ? repo.findMany("RRArticle", { id: { in: ids } }, { select: ["id", "title"] }) : Promise.resolve([] as Row[]),
    yearEndFor(repo, s(rr.schoolId), now),
  ]);
  const ver = new Map(vers.map((v) => [`${v.articleId}|${v.level}`, v]));
  const title = new Map(arts.map((a) => [s(a.id), s(a.title)]));
  const changes = changeEvents(changeRows);
  const placedAt = time(rr.placedAt);
  const journey = levelJourney({ startLevel: Number(rr.startLevel), placedAt, source: s(rr.source) }, changes);
  const first = done.filter((r) => isFirst(r) && scored(r));
  const main = first.filter((r) => !isStretch(r));
  const counted = first.filter((r) => countsForLevel({ ...r, firstTry: true, stretch: isStretch(r) }));
  const conf = growthConfidence(counted.map((r) => ({ at: time(r.completedAt), score: Number(r.score) })), changes, placedAt);
  const tr = scoreTrend(main.map((r) => Number(r.score)));
  const wk = perWeek(main.map((r) => time(r.completedAt)), now);
  const goal = goalStats(first.filter((r) => Number(r.score) >= ENGINE.up).map((r) => toDate(r.completedAt)), Number(rr.weeklyGoal ?? 2), now);
  const answered = first.map((r) => ({ articleId: s(r.articleId), band: s(r.band), answers: r.answers }));
  return {
    ...base,
    history: journey.events,
    trend: main.slice(-20).map((r) => ({ at: iso(time(r.completedAt)), score: Number(r.score), stretch: false })),
    recentAvg: tr.recentAvg, earlierAvg: tr.earlierAvg, scoreDelta: tr.delta,
    wordsRead: done.reduce((a, r) => a + Number(ver.get(`${r.articleId}|${r.versionLevel}`)?.wordCount ?? 0), 0),
    readings: done.length, firstTries: main.length,
    weeks: wk.starts.map((w) => iso(w).slice(5, 10)), perWeek: wk.counts, avgPerWeek: Math.round((10 * wk.counts.reduce((a, b) => a + b, 0)) / wk.counts.length) / 10,
    skills: skillBreakdown(answered, key), stronger: strongerSkills(answered, key),
    confidence: conf, confidenceText: confidenceText(conf),
    stretch: stretchSuccess(first.filter(isStretch).map((r) => Number(r.score))),
    streak: goal.streak, weeksMet: goal.weeksMet, movesUp: journey.events.filter((e) => e.kind === "UP").length,
    projection: projectionRange(journey.points, main.map((r) => time(r.completedAt)), now, yearEnd),
    recent: [...done].reverse().slice(0, 12).map((r) => {
      const v = ver.get(`${r.articleId}|${r.versionLevel}`);
      const textLevel = v ? measuredLevel({ level: Number(v.level), estLevel: v.estLevel, officialLexile: v.officialLexile }) : Number(r.versionLevel);
      return {
        runId: s(r.id), title: title.get(s(r.articleId)) ?? "Article", at: iso(time(r.completedAt)), versionLevel: Number(r.versionLevel), textLevel,
        studentLevel: Number(r.levelBefore), fit: fitOf(textLevel, Number(r.levelBefore)), score: r.score === null || r.score === undefined ? null : Number(r.score), firstTry: isFirst(r), stretch: isStretch(r),
      };
    }),
  };
}

export interface StudentGrowthReport extends StudentGrowthData {
  classId: string; className: string; band: { low: number; high: number };
  /** TEACHER VIEW ONLY: the level against the grade's expected range */
  position: "BELOW" | "WITHIN" | "ABOVE" | null;
  projectedPosition: "BELOW" | "WITHIN" | "ABOVE" | null;
}

/** 👩‍🏫 One student's growth evidence for a class the actor can read (teachers, coordinators, admins). */
export async function studentGrowthReport(repo: Repo, actor: Actor, classId: string, studentId: string, now = new Date()): Promise<StudentGrowthReport> {
  const klass = await assertClassRead(repo, actor, classId);
  const member = await repo.findMany("ClassMembership", { classId, studentId, leftAt: null }, { select: ["studentId"], take: 1 });
  if (!member.length) throw new ForbiddenError("This student is not in the class.");
  const d = await loadStudentGrowth(repo, studentId, now);
  const band = gradeBand(d.grade);
  return {
    ...d, classId, className: s(klass.name), band,
    position: d.level === null ? null : gradePosition(d.level, band),
    projectedPosition: d.projection ? gradePosition(d.projection.mid, band) : null,
  };
}

// ------------------------------------------------------------------ the student's own story

export interface MyGrowthStory {
  level: number; startLevel: number; lines: StoryLine[];
  journey: { at: string; level: number; up: boolean }[];
  /** skill keys that got stronger, strongest gain first */
  stronger: string[];
  /** the student's best skills (80%+ with 8+ answers) */
  strengths: string[];
  streak: number; words: number; articles: number;
}

/** 🧒 The student's own growth story: encouraging words only — never a grade range or Below/On/Above. */
export async function myGrowthStory(repo: Repo, actor: Actor, now = new Date()): Promise<MyGrowthStory | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students have a growth story.");
  const d = await loadStudentGrowth(repo, actor.studentId, now);
  if (!d.placed || d.level === null || d.startLevel === null) return null;
  return {
    level: d.level, startLevel: d.startLevel,
    lines: storyLines({ level: d.level, startLevel: d.startLevel, movesUp: d.movesUp, streak: d.streak, weeksMet: d.weeksMet, articles: d.firstTries, words: d.wordsRead, stronger: d.stronger.map((x) => x.skill), stretchWins: d.stretch.succeeded, scoreDelta: d.scoreDelta }),
    // the journey shows the steps UP (a step down is just the level fitting better, so it is not drawn as a loss)
    journey: d.history.filter((e, i) => i === 0 || e.kind === "UP").map((e, i) => ({ at: e.at, level: e.level, up: i > 0 })),
    stronger: d.stronger.map((x) => x.skill),
    strengths: d.skills.filter((k) => k.total >= 8 && (k.pct ?? 0) >= 80).map((k) => k.skill),
    streak: d.streak, words: d.wordsRead, articles: d.firstTries,
  };
}

// ------------------------------------------------------------------ the class

export interface StudentEvidence {
  studentId: string; name: string; level: number | null; growthTerm: number | null; confirmedBy: number; against: number; confidence: string;
  projection: ProjectionRange | null; position: "BELOW" | "WITHIN" | "ABOVE" | null; lastActivity: string | null;
}
export interface SkillWeakness {
  skill: string; cell: SkillCell;
  /** students under 60% on this skill (4+ answers) */
  struggling: { studentId: string; name: string; pct: number }[];
  /** published articles with the most questions on this skill, not yet read by most of the class */
  suggested: { articleId: string; title: string; topic: string; questions: number }[];
}
export interface ClassGrowth {
  classId: string; className: string; grade: number; band: { low: number; high: number }; termStart: string;
  distribution: ClassReport["distribution"];
  term: { placed: number; avg: number | null; median: number | null; movedUp: number; movedDown: number };
  notReading: { studentId: string; name: string; placed: boolean; lastActivity: string | null }[];
  skills: ({ skill: string } & SkillCell)[];
  weaknesses: SkillWeakness[];
  students: StudentEvidence[];
}

/** 👩‍🏫 Class growth aggregates (bounded: the class's rows only, batched with `in`). */
export async function classGrowth(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassGrowth> {
  const klass = await assertClassRead(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const band = gradeBand(grade);
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const nowT = now.getTime();
  const schoolId = s(klass.schoolId);
  const [students, rrs, changeRows, runs, tStart, yearEnd] = await Promise.all([
    ids.length ? repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("RRStudent", { studentId: { in: ids } }, { select: ["studentId", "level", "startLevel", "placedAt", "source"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("RRLevelChange", { studentId: { in: ids } }, { select: ["studentId", "fromLevel", "toLevel", "reason", "createdAt"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("RRRun", { studentId: { in: ids } }, { select: RUN_COLS }) : Promise.resolve([] as Row[]),
    termStartOf(repo, schoolId, now), yearEndFor(repo, schoolId, now),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const uname = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const names = new Map(students.map((x) => [s(x.id), uname.get(s(x.userId)) ?? "Student"]));
  const rrBy = new Map(rrs.map((r) => [s(r.studentId), r]));
  const chBy = new Map<string, Row[]>(), runBy = new Map<string, Row[]>();
  for (const c of changeRows) chBy.set(s(c.studentId), [...(chBy.get(s(c.studentId)) ?? []), c]);
  for (const r of runs) runBy.set(s(r.studentId), [...(runBy.get(s(r.studentId)) ?? []), r]);
  const first = runs.filter((r) => isFirst(r) && scored(r));
  const readIds = [...new Set(first.map((r) => s(r.articleId)))];
  const key = await answerKey(repo, readIds);
  const termT = tStart.getTime();

  const evidence: StudentEvidence[] = ids.map((id) => {
    const rr = rrBy.get(id);
    const mine = runBy.get(id) ?? [];
    const last = Math.max(0, ...mine.map((r) => Math.max(time(r.completedAt), time(r.startedAt))));
    if (!rr) return { studentId: id, name: names.get(id) ?? "Student", level: null, growthTerm: null, confirmedBy: 0, against: 0, confidence: "Not placed", projection: null, position: null, lastActivity: last ? iso(last) : null };
    const changes = changeEvents(chBy.get(id) ?? []);
    const placedAt = time(rr.placedAt), level = Number(rr.level);
    const atTerm = levelAtTime({ startLevel: Number(rr.startLevel), placedAt }, changes.map((c) => ({ at: c.at, toLevel: c.to })), termT) ?? Number(rr.startLevel);
    const ft = mine.filter((r) => isFirst(r) && scored(r));
    const counted = ft.filter((r) => countsForLevel({ ...r, firstTry: true, stretch: isStretch(r) }));
    const conf = growthConfidence(counted.map((r) => ({ at: time(r.completedAt), score: Number(r.score) })), changes, placedAt);
    const journey = levelJourney({ startLevel: Number(rr.startLevel), placedAt, source: s(rr.source) }, changes);
    const proj = projectionRange(journey.points, ft.filter((r) => !isStretch(r)).map((r) => time(r.completedAt)), now, yearEnd);
    return {
      studentId: id, name: names.get(id) ?? "Student", level, growthTerm: level - atTerm, confirmedBy: conf.readings, against: conf.against, confidence: confidenceText(conf),
      projection: proj, position: gradePosition(level, band), lastActivity: last ? iso(last) : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const placed = evidence.filter((e) => e.level !== null);
  const growths = placed.map((e) => e.growthTerm!);
  const notReading = evidence.filter((e) => !e.lastActivity || nowT - time(e.lastActivity) >= INACTIVE_DAYS * DAY)
    .map((e) => ({ studentId: e.studentId, name: e.name, placed: e.level !== null, lastActivity: e.lastActivity }));

  // skills across the class (first tries), and who struggles
  const answered = (rs: Row[]) => rs.map((r) => ({ articleId: s(r.articleId), band: s(r.band), answers: r.answers }));
  const skills = skillBreakdown(answered(first), key);
  const weak = skills.filter((k) => k.total >= 8 && (k.pct ?? 100) < 70).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 3);
  const perStudent = new Map(ids.map((id) => [id, skillBreakdown(answered(first.filter((r) => s(r.studentId) === id)), key)]));
  let suggestions = new Map<string, SkillWeakness["suggested"]>();
  if (weak.length) {
    const arts = await visibleArticles(repo, schoolId);
    const readers = new Map<string, Set<string>>();
    for (const r of runs) { const set = readers.get(s(r.articleId)) ?? new Set<string>(); set.add(s(r.studentId)); readers.set(s(r.articleId), set); }
    const fresh = arts.filter((a) => (readers.get(s(a.id))?.size ?? 0) * 2 < Math.max(1, ids.length));
    const freshIds = fresh.map((a) => s(a.id));
    const weakSkills = new Set(weak.map((w) => w.skill));
    const qs = [...(await questionKeys(repo, freshIds))].flatMap(([articleId, rows]) => rows.filter((q) => weakSkills.has(q.skill)).map((q) => ({ articleId, band: q.band, skill: q.skill })));
    suggestions = new Map(weak.map((w) => {
      // questions on the skill in one band (each student answers one band), the best band of the article
      const perBand = new Map<string, number>(), count = new Map<string, number>();
      for (const q of qs) if (s(q.skill) === w.skill) { const k = `${q.articleId}|${q.band}`; perBand.set(k, (perBand.get(k) ?? 0) + 1); }
      for (const [k, n] of perBand) { const id = k.split("|")[0]; count.set(id, Math.max(count.get(id) ?? 0, n)); }
      const list = fresh.filter((a) => count.has(s(a.id)))
        .map((a) => ({ articleId: s(a.id), title: s(a.title), topic: s(a.topic), questions: count.get(s(a.id))! }))
        .sort((a, b) => b.questions - a.questions || a.title.localeCompare(b.title)).slice(0, 3);
      return [w.skill, list];
    }));
  }
  const weaknesses: SkillWeakness[] = weak.map((w) => ({
    skill: w.skill, cell: skillCell(w.correct, w.total),
    struggling: ids.map((id) => ({ id, c: perStudent.get(id)!.find((k) => k.skill === w.skill) }))
      .filter((x) => x.c && x.c.total >= 4 && (x.c.pct ?? 100) < 60)
      .map((x) => ({ studentId: x.id, name: names.get(x.id) ?? "Student", pct: x.c!.pct! })).sort((a, b) => a.pct - b.pct),
    suggested: suggestions.get(w.skill) ?? [],
  }));

  return {
    classId, className: s(klass.name), grade, band, termStart: tStart.toISOString(),
    distribution: histogram(placed.map((e) => e.level!), band),
    term: { placed: placed.length, avg: growths.length ? Math.round(growths.reduce((a, b) => a + b, 0) / growths.length) : null, median: median(growths), movedUp: growths.filter((g) => g > 0).length, movedDown: growths.filter((g) => g < 0).length },
    notReading, skills, weaknesses, students: evidence,
  };
}

/** The goal score (for page text). */
export const GROWTH_GOAL_SCORE = GOAL_SCORE;
