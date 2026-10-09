/**
 * 📈 Everything the platform knows about a group of students, read in a FIXED number of queries (whatever the
 * class size): MAP (Fall → latest → Spring target), practice (answers, accuracy, time, last active),
 * assignments (done / pending / late), levels. Shared by auto placement, the teacher dashboard, the student
 * plan, alerts, the grade summary and the parent report — one definition of each number.
 */
import type { Repo, Row } from "../seeding/repo";
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
}

/** MAP of these students for one subject. */
export async function mapSummaries(repo: Repo, studentIds: string[], subject: Subject, gradeOf: Map<string, number>): Promise<Map<string, MapSummary>> {
  const out = new Map<string, MapSummary>();
  if (!studentIds.length) return out;
  const rows = (await repo.findMany("MapResult", { studentId: { in: studentIds } })).filter((r) => isSubject(subject, r.subject));
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
    if (springRow && target !== null) { const ok = Number(springRow.rit) >= target; status = ok ? "MET" : "MISSED"; statusWhy = ok ? `Spring ${springRow.rit} reached the target ${target}.` : `Spring ${springRow.rit} is under the target ${target}.`; }
    else if (fall && latest && latest.season !== "FALL" && target !== null) {
      const expected = fall.rit + Math.round((fall.growth ?? 0) / 2);
      status = latest.rit >= expected - 1 ? "ON_TRACK" : "AT_RISK";
      statusWhy = `${latest.term} ${latest.rit} vs ${expected} expected by mid-year (target ${target}).`;
    } else if (latest) {
      status = (latest.percentile ?? 50) < 21 ? "AT_RISK" : "ON_TRACK";
      statusWhy = (latest.percentile ?? 50) < 21 ? `${latest.term}: ${latest.percentile}th percentile (low).` : `${latest.term}: ${latest.percentile ?? "—"}th percentile.`;
    }
    out.set(id, {
      fall, latest, springTarget: target, springActual: springRow ? Number(springRow.rit) : null, gap: fall?.growth ?? null, goals,
      lexile: lexRow ? Number(lexRow.lexile) : null, band: latest ? planBand(latest.percentile, null) : null, status, statusWhy,
    });
  }
  return out;
}

export interface PracticeStats { answers: number; correct: number; accuracy: number | null; week: { answers: number; minutes: number }; month: { answers: number; minutes: number }; totalMinutes: number; lastActive: string | null; recentAccuracy: number | null; recentAnswers: number }

/** Practice of these students (all time; week = last 7 days, month = last 30). Rapid guesses are not counted in accuracy. */
export async function practiceStats(repo: Repo, studentIds: string[], now = new Date()): Promise<Map<string, PracticeStats>> {
  const out = new Map<string, PracticeStats>();
  if (!studentIds.length) return out;
  const [attempts, sessions] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: studentIds } }, { select: ["studentId", "isCorrect", "rapidGuess", "createdAt"] }),
    repo.findMany("PracticeSession", { studentId: { in: studentIds } }, { select: ["studentId", "activeMs", "startedAt"] }),
  ]);
  const week = now.getTime() - 7 * 86_400_000, month = now.getTime() - 30 * 86_400_000;
  for (const id of studentIds) out.set(id, { answers: 0, correct: 0, accuracy: null, week: { answers: 0, minutes: 0 }, month: { answers: 0, minutes: 0 }, totalMinutes: 0, lastActive: null, recentAccuracy: null, recentAnswers: 0 });
  const recent = new Map<string, { n: number; c: number }>();
  const last = new Map<string, number>();
  for (const a of attempts) {
    const st = out.get(s(a.studentId)); if (!st) continue;
    const t = time(a.createdAt);
    st.answers++; if (a.isCorrect) st.correct++;
    if (t >= week) st.week.answers++;
    if (t >= month) { st.month.answers++; if (!a.rapidGuess) { const r = recent.get(s(a.studentId)) ?? { n: 0, c: 0 }; r.n++; if (a.isCorrect) r.c++; recent.set(s(a.studentId), r); } }
    if (t > (last.get(s(a.studentId)) ?? 0)) last.set(s(a.studentId), t);
  }
  for (const x of sessions) {
    const st = out.get(s(x.studentId)); if (!st) continue;
    const m = Number(x.activeMs ?? 0) / 60_000, t = time(x.startedAt);
    st.totalMinutes += m; if (t >= week) st.week.minutes += m; if (t >= month) st.month.minutes += m;
  }
  for (const [id, st] of out) {
    st.accuracy = st.answers ? Math.round((st.correct / st.answers) * 100) : null;
    const r = recent.get(id); st.recentAnswers = r?.n ?? 0; st.recentAccuracy = r && r.n ? Math.round((r.c / r.n) * 100) : null;
    st.totalMinutes = Math.round(st.totalMinutes); st.week.minutes = Math.round(st.week.minutes); st.month.minutes = Math.round(st.month.minutes);
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
