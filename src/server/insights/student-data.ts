/**
 * 📈 Everything the platform knows about a group of students, read in a FIXED number of queries (whatever the
 * class size): MAP (Fall → latest → Spring target), practice (answers, accuracy, time, last active),
 * assignments (done / pending / late), levels. Shared by auto placement, the teacher dashboard, the student
 * plan, alerts, the grade summary and the parent report — one definition of each number.
 */
import { idsKey, sharedRead } from "../lib/shared-read";
import type { Repo, Row } from "../seeding/repo";
import { countGroups } from "../db/group-count";
import { nationalNorm, seasonOf, type Season } from "../map/rit";
import { bandOf as planBand } from "../map/personal-plan";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export type Level = "BELOW" | "ON" | "ABOVE";
export type Subject = "READING" | "LANGUAGE";
const isSubject = (subject: Subject, v: unknown) => (subject === "READING" ? /read/i : /language/i).test(s(v));

export interface MapPoint { rit: number; term: string; season: Season; date: number; percentile: number | null }
export interface MapSummary {
  fall: (MapPoint & { growth: number | null }) | null;
  latest: MapPoint | null;
  springTarget: number | null;
  springActual: number | null;
  /** NWEA projected growth (Spring Projection − Fall RIT) */
  gap: number | null;
  /** goal areas of the most recent term that has them, weakest first */
  goals: { name: string; areaId: string | null; rit: number }[];
  lexile: number | null;
  /** latest percentile → BELOW (< 41st) / ON (41st–60th) / ABOVE */
  band: Level | null;
  status: "ON_TRACK" | "AT_RISK" | "MET" | "MISSED" | "NO_DATA";
  statusWhy: string;
  /** which MAP test the status and labels come from, e.g. "Fall MAP · 2026-09-15" (Update 39B: labels show their
   *  season and date, and follow the newest test — a Winter score replaces the Fall label) */
  asOf: string | null;
}

/** "Fall MAP · 2026-09-15" for a MAP point. */
export function mapAsOf(p: { season: Season; date: number } | null | undefined): string | null {
  if (!p) return null;
  const name = p.season ? `${p.season.charAt(0)}${p.season.slice(1).toLowerCase()} MAP` : "MAP";
  return `${name} · ${new Date(p.date).toISOString().slice(0, 10)}`;
}

/** MAP of these students for one subject. */
/** `opts.rows`: the students' MapResult rows already loaded by the caller (Update 40: no second read). */
export async function mapSummaries(repo: Repo, studentIds: string[], subject: Subject, gradeOf: Map<string, number>, opts: { rows?: Row[] } = {}): Promise<Map<string, MapSummary>> {
  const out = new Map<string, MapSummary>();
  if (!studentIds.length) return out;
  const want = new Set(studentIds);
  const rows = (opts.rows ? opts.rows.filter((r) => want.has(s(r.studentId))) : await repo.findMany("MapResult", { studentId: { in: studentIds } })).filter((r) => isSubject(subject, r.subject));
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(s(r.studentId), [...(by.get(s(r.studentId)) ?? []), r]);
  const normCache = new Map<string, { mean: number; sd: number } | null>();
  const norm = async (g: number, se: Season) => { const k = `${g}:${se}`; if (!normCache.has(k)) normCache.set(k, await nationalNorm(repo, g, se)); return normCache.get(k)!; };
  for (const id of studentIds) {
    const list = (by.get(id) ?? []).sort((a, b) => time(a.testDate) - time(b.testDate));
    const overall = list.filter((r) => !r.goalName);
    const point = async (r: Row): Promise<MapPoint> => {
      const season = seasonOf(r.termName, r.testDate);
      let pct = r.achievementPercentile === null || r.achievementPercentile === undefined ? null : Number(r.achievementPercentile);
      if (pct === null) {
        const n = await norm(gradeOf.get(id) ?? 0, season);
        if (n) { const z = (Number(r.rit) - n.mean) / n.sd; pct = Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-1.702 * z))))); }
      }
      return { rit: Number(r.rit), term: s(r.termName) || season, season, date: time(r.testDate), percentile: pct };
    };
    const fallRow = [...overall].reverse().find((r) => seasonOf(r.termName, r.testDate) === "FALL");
    const latestRow = overall[overall.length - 1];
    const fall = fallRow ? { ...(await point(fallRow)), growth: fallRow.projectedGrowth === null || fallRow.projectedGrowth === undefined ? null : Number(fallRow.projectedGrowth) } : null;
    const latest = latestRow ? await point(latestRow) : null;
    const springRow = fallRow ? overall.find((r) => seasonOf(r.termName, r.testDate) === "SPRING" && time(r.testDate) > time(fallRow.testDate)) : undefined;
    const target = fall && fall.growth !== null ? fall.rit + fall.growth : null;
    const goalTerm = [...list].reverse().find((r) => r.goalName)?.termName;
    const goals = list.filter((r) => r.goalName && s(r.termName) === s(goalTerm)).map((r) => ({ name: s(r.goalName), areaId: r.goalAreaId ? s(r.goalAreaId) : null, rit: Number(r.rit) })).sort((a, b) => a.rit - b.rit);
    const lexRow = [...list].reverse().find((r) => r.lexile !== null && r.lexile !== undefined);
    let status: MapSummary["status"] = "NO_DATA", statusWhy = "No MAP score yet.";
    const asOf = mapAsOf(latest);
    if (springRow && target !== null) { const ok = Number(springRow.rit) >= target; status = ok ? "MET" : "MISSED"; statusWhy = ok ? `Spring ${springRow.rit} reached the target ${target}.` : `Spring ${springRow.rit} is under the target ${target}.`; }
    else if (fall && latest && latest.season !== "FALL" && target !== null) {
      const expected = fall.rit + Math.round((fall.growth ?? 0) / 2);
      status = latest.rit >= expected - 1 ? "ON_TRACK" : "AT_RISK";
      statusWhy = `${asOf}: RIT ${latest.rit} vs ${expected} expected by mid-year (target ${target}).`;
    } else if (latest) {
      status = (latest.percentile ?? 50) < 21 ? "AT_RISK" : "ON_TRACK";
      statusWhy = (latest.percentile ?? 50) < 21 ? `${asOf} (${latest.term}): ${latest.percentile}th percentile (low).` : `${asOf} (${latest.term}): ${latest.percentile ?? "—"}th percentile.`;
    }
    out.set(id, {
      fall, latest, springTarget: target, springActual: springRow ? Number(springRow.rit) : null, gap: fall?.growth ?? null, goals,
      lexile: lexRow ? Number(lexRow.lexile) : null, band: latest ? planBand(latest.percentile, null) : null, status, statusWhy, asOf,
    });
  }
  return out;
}

export interface PracticeStats { answers: number; correct: number; accuracy: number | null; week: { answers: number; minutes: number }; month: { answers: number; minutes: number }; totalMinutes: number; lastActive: string | null; recentAccuracy: number | null; recentAnswers: number;
  /** the student's ability on the skills practised in the last 30 days (θ, 0 = grade level), weighted by answers; null with under 10 answers */
  recentTheta: number | null }

/** Up to this many students, all-time answer totals are counted from the answers themselves (see answerTotals). */
export const EXACT_ANSWER_COUNT_MAX = 60;

/**
 * ONE definition of “answers” for every report (readiness I-19: the same student showed 607 on one page and 655 on
 * another): the number of saved answers (QuestionAttempt rows), all time, and how many were correct. Every answer is
 * counted: practice, assigned sets, lessons, Review my mistakes and the Diagnostic. For large groups (school-wide
 * scans, more than EXACT_ANSWER_COUNT_MAX students) the per-skill counters are summed instead (they count the same
 * answers except older review answers), so a school-wide job never reads every answer of the year.
 */
export async function answerTotals(repo: Repo, studentIds: string[]): Promise<Map<string, { answers: number; correct: number }> | null> {
  if (!studentIds.length || studentIds.length > EXACT_ANSWER_COUNT_MAX) return null;
  // ⚡ two GROUP BY counts (one row per student) instead of reading every answer of the year
  const [all, right] = await Promise.all([
    countGroups(repo, "QuestionAttempt", "studentId", { studentId: { in: studentIds } }),
    countGroups(repo, "QuestionAttempt", "studentId", { studentId: { in: studentIds }, isCorrect: true }),
  ]);
  return new Map(studentIds.map((id) => [id, { answers: all.get(id) ?? 0, correct: right.get(id) ?? 0 }]));
}

/**
 * Practice of these students (all time; week = last 7 days, month = last 30). Rapid guesses are not counted in accuracy.
 * Bounded for large schools: only the last 30 days of answers are read; all-time totals come from the mastery rows.
 */
/** `opts.attempts`: answers already loaded by the caller (any superset of the last 30 days of these students, with
 *  studentId, isCorrect, rapidGuess, createdAt) — filtered here, so the answers are not read twice (Update 40). */
export async function practiceStats(repo: Repo, studentIds: string[], now = new Date(), opts: { attempts?: Row[] } = {}): Promise<Map<string, PracticeStats>> {
  if (!studentIds.length) return new Map();
  // ⚡ the same students' stats asked again while a page is built: read once (fresh after any write)
  if (!opts.attempts) return new Map(await sharedRead(repo, `practiceStats|${Math.floor(now.getTime() / 60_000)}|${idsKey(studentIds)}`, PRACTICE_MODELS, 20_000, () => practiceStatsUncached(repo, studentIds, now, opts)));
  return practiceStatsUncached(repo, studentIds, now, opts);
}
const PRACTICE_MODELS = ["QuestionAttempt", "PracticeSession", "StudentSkillMastery", "StudentAbility"];

async function practiceStatsUncached(repo: Repo, studentIds: string[], now: Date, opts: { attempts?: Row[] }): Promise<Map<string, PracticeStats>> {
  const out = new Map<string, PracticeStats>();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const want = opts.attempts ? new Set(studentIds) : null;
  const [attempts, sessions, mastery, abilities, exact] = await Promise.all([
    opts.attempts ? Promise.resolve(opts.attempts.filter((a) => want!.has(s(a.studentId)) && time(a.createdAt) >= monthAgo.getTime()))
      : repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, createdAt: { gte: monthAgo } }, { select: ["studentId", "isCorrect", "rapidGuess", "createdAt"] }),
    repo.findMany("PracticeSession", { studentId: { in: studentIds } }, { select: ["studentId", "activeMs", "startedAt"] }),
    repo.findMany("StudentSkillMastery", { studentId: { in: studentIds } }, { select: ["studentId", "attempts", "correct", "lastPracticedAt"] }),
    repo.findMany("StudentAbility", { studentId: { in: studentIds }, updatedAt: { gte: monthAgo } }, { select: ["studentId", "scope", "theta", "responses"] }),
    answerTotals(repo, studentIds),
  ]);
  const week = now.getTime() - 7 * 86_400_000, month = monthAgo.getTime();
  for (const id of studentIds) out.set(id, { answers: 0, correct: 0, accuracy: null, week: { answers: 0, minutes: 0 }, month: { answers: 0, minutes: 0 }, totalMinutes: 0, lastActive: null, recentAccuracy: null, recentAnswers: 0, recentTheta: null });
  const recent = new Map<string, { n: number; c: number }>();
  const last = new Map<string, number>();
  for (const m of mastery) {
    const st = out.get(s(m.studentId)); if (!st) continue;
    st.answers += Number(m.attempts ?? 0); st.correct += Number(m.correct ?? 0);
    const t = m.lastPracticedAt ? time(m.lastPracticedAt) : 0;
    if (t > (last.get(s(m.studentId)) ?? 0)) last.set(s(m.studentId), t);
  }
  for (const a of attempts) {
    const st = out.get(s(a.studentId)); if (!st) continue;
    const t = time(a.createdAt);
    if (t >= week) st.week.answers++;
    if (t >= month) { st.month.answers++; if (!a.rapidGuess) { const r = recent.get(s(a.studentId)) ?? { n: 0, c: 0 }; r.n++; if (a.isCorrect) r.c++; recent.set(s(a.studentId), r); } }
    if (t > (last.get(s(a.studentId)) ?? 0)) last.set(s(a.studentId), t);
  }
  for (const x of sessions) {
    const st = out.get(s(x.studentId)); if (!st) continue;
    const m = Number(x.activeMs ?? 0) / 60_000, t = time(x.startedAt);
    st.totalMinutes += m; if (t >= week) st.week.minutes += m; if (t >= month) st.month.minutes += m;
  }
  const theta = new Map<string, { w: number; sum: number }>();
  for (const a of abilities) {
    if (!s(a.scope).startsWith("SKILL:")) continue;
    const w = Math.max(1, Number(a.responses ?? 1)), t = theta.get(s(a.studentId)) ?? { w: 0, sum: 0 };
    t.w += w; t.sum += w * Number(a.theta); theta.set(s(a.studentId), t);
  }
  if (exact) for (const [id, t] of exact) { const st = out.get(id); if (st) { st.answers = t.answers; st.correct = t.correct; } }
  for (const [id, st] of out) {
    st.accuracy = st.answers ? Math.round((st.correct / st.answers) * 100) : null;
    const r = recent.get(id); st.recentAnswers = r?.n ?? 0; st.recentAccuracy = r && r.n ? Math.round((r.c / r.n) * 100) : null;
    const th = theta.get(id); st.recentTheta = th && th.w >= 10 ? Math.round((th.sum / th.w) * 100) / 100 : null;
    st.totalMinutes = Math.round(st.totalMinutes); st.week.minutes = Math.round(st.week.minutes); st.month.minutes = Math.round(st.month.minutes);
    st.lastActive = last.has(id) ? new Date(last.get(id)!).toISOString() : null;
  }
  return out;
}

/**
 * The three practice numbers Data Health needs — lastActive, recentAnswers, recentAccuracy — computed exactly as
 * practiceStats does, from the answers the caller already loaded and the mastery rows' last-practised dates only
 * (practiceStats also reads every session, ability and the all-time totals). Update 40.
 */
export async function activityStats(repo: Repo, studentIds: string[], now: Date, attempts: Row[]): Promise<Map<string, Pick<PracticeStats, "lastActive" | "recentAnswers" | "recentAccuracy">>> {
  const out = new Map<string, Pick<PracticeStats, "lastActive" | "recentAnswers" | "recentAccuracy">>();
  if (!studentIds.length) return out;
  const month = now.getTime() - 30 * 86_400_000;
  const mastery = await repo.findMany("StudentSkillMastery", { studentId: { in: studentIds } }, { select: ["studentId", "lastPracticedAt"] });
  for (const id of studentIds) out.set(id, { lastActive: null, recentAnswers: 0, recentAccuracy: null });
  const recent = new Map<string, { n: number; c: number }>();
  const last = new Map<string, number>();
  for (const m of mastery) {
    if (!out.has(s(m.studentId))) continue;
    const t = m.lastPracticedAt ? time(m.lastPracticedAt) : 0;
    if (t > (last.get(s(m.studentId)) ?? 0)) last.set(s(m.studentId), t);
  }
  for (const a of attempts) {
    if (!out.has(s(a.studentId))) continue;
    const t = time(a.createdAt);
    if (t < month) continue;
    if (!a.rapidGuess) { const r = recent.get(s(a.studentId)) ?? { n: 0, c: 0 }; r.n++; if (a.isCorrect) r.c++; recent.set(s(a.studentId), r); }
    if (t > (last.get(s(a.studentId)) ?? 0)) last.set(s(a.studentId), t);
  }
  for (const [id, st] of out) {
    const r = recent.get(id); st.recentAnswers = r?.n ?? 0; st.recentAccuracy = r && r.n ? Math.round((r.c / r.n) * 100) : null;
    st.lastActive = last.has(id) ? new Date(last.get(id)!).toISOString() : null;
  }
  return out;
}

export interface WorkStats { done: number; pending: number; late: number; total: number }

/** Assignments of these students (question sets, skills and Respond to Reading). Late = past due and not done. */
export async function workStats(repo: Repo, studentIds: string[], now = new Date()): Promise<Map<string, WorkStats>> {
  const out = new Map<string, WorkStats>(studentIds.map((id) => [id, { done: 0, pending: 0, late: 0, total: 0 }]));
  if (!studentIds.length) return out;
  const rows = await repo.findMany("AssignmentStudent", { studentId: { in: studentIds } });
  const as = rows.length ? await repo.findMany("Assignment", { id: { in: [...new Set(rows.map((r) => s(r.assignmentId)))] } }, { select: ["id", "dueAt", "deletedAt"] }) : [];
  const due = new Map(as.filter((a) => !a.deletedAt).map((a) => [s(a.id), a.dueAt ? time(a.dueAt) : null]));
  for (const r of rows) {
    if (!due.has(s(r.assignmentId))) continue;
    const w = out.get(s(r.studentId))!; w.total++;
    const d = due.get(s(r.assignmentId));
    if (r.status === "COMPLETED") w.done++; else if (r.status === "OVERDUE" || (d !== null && d !== undefined && d < now.getTime())) w.late++; else w.pending++;
  }
  const rtr = await repo.findMany("RespondAssignmentStudent", { studentId: { in: studentIds } });
  const ra = rtr.length ? await repo.findMany("RespondAssignment", { id: { in: [...new Set(rtr.map((r) => s(r.assignmentId)))] } }, { select: ["id", "dueAt", "deletedAt"] }) : [];
  const rdue = new Map(ra.filter((a) => !a.deletedAt).map((a) => [s(a.id), a.dueAt ? time(a.dueAt) : null]));
  for (const r of rtr) {
    if (!rdue.has(s(r.assignmentId))) continue;
    const w = out.get(s(r.studentId))!; w.total++;
    const d = rdue.get(s(r.assignmentId));
    if (r.finishedAt) w.done++; else if (d !== null && d !== undefined && d < now.getTime()) w.late++; else w.pending++;
  }
  return out;
}

/** Names of students (display name), for any list of ids. */
export async function studentNames(repo: Repo, ids: string[]): Promise<Map<string, { name: string; number: string; gradeId: string }>> {
  if (!ids.length) return new Map();
  const st = await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId", "studentNumber", "gradeId"] });
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName", "username"] }) : [];
  return new Map(st.map((x) => { const u = users.find((y) => y.id === x.userId); return [s(x.id), { name: s(u?.displayName ?? "Student"), number: s(x.studentNumber) || s(u?.username), gradeId: s(x.gradeId) }]; }));
}

/** Students of a class (current members). */
export async function classMembers(repo: Repo, classId: string): Promise<string[]> {
  return (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
}

/** Levels: the working level + each category's level (CV / ACS / RTR). */
export async function levelsOf(repo: Repo, ids: string[]): Promise<Map<string, { level: Level | null; source: string | null; categories: Record<string, Level> }>> {
  const out = new Map(ids.map((id) => [id, { level: null as Level | null, source: null as string | null, categories: {} as Record<string, Level> }]));
  if (!ids.length) return out;
  const [lv, cat] = await Promise.all([repo.findMany("StudentLevel", { studentId: { in: ids } }), repo.findMany("StudentCategoryLevel", { studentId: { in: ids } })]);
  for (const r of lv) { const o = out.get(s(r.studentId)); if (o) { o.level = s(r.level) as Level; o.source = s(r.source); } }
  for (const r of cat) { const o = out.get(s(r.studentId)); if (o) o.categories[s(r.category)] = s(r.level) as Level; }
  return out;
}
