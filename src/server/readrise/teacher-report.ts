/**
 * 📋 The teacher's ReadRise report (owner r69 item 4) — ONE clear page per class (/teacher/readrise/report, reports hub
 * "Programs → ReadRise"):
 *
 *   each student   the level line (the year's placements and every change), the three reading checks (start →
 *                  middle → end), the projected end-of-year level from the trend (an ESTIMATE, with its range)
 *   lists          "Stuck" (placed, no level change for STUCK_DAYS+ days) and "Rising fast" (up RISING_GAIN+ in the
 *                  last 4 weeks)
 *   accuracy       class accuracy by question type (main idea, details, inference, vocabulary …) from reliable first
 *                  tries; rapid answers left out
 *   unreliable     the runs with 2+ rapid answers (never moved a level)
 * The level is always called "the ReadRise level". Bounded reads: the class's rows only, batched with `in`,
 * only the needed columns.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertClassRead } from "../teacher/coordinators";
import { RETAKE_REASON, readRisePlaced, s, toDate, yearEndFor } from "./engine";
import { gradeBand } from "./dashboards";
import { levelJourney, type HistoryKind } from "./growth-report";
import { projectionRange, type ProjectionRange } from "./growth";
import { questionKeys } from "./question-key";
import { QUESTION_TYPES, QUESTION_TYPE_NAME, isUnreliableRun, normalizeQuestionType, storedRapid, type QuestionType } from "./accuracy";
import { loadReadRiseWindows, placementChecks, type RRPeriod, type RRWindows } from "./windows";
import type { Actor } from "../auth/rbac";

const DAY = 86_400_000;
/** no level change for this many days → "Stuck" */
export const STUCK_DAYS = 28;
/** up this much in the last RISING_DAYS days → "Rising fast" */
export const RISING_GAIN = 100, RISING_DAYS = 28;
/** at most this many unreliable runs are listed (newest first) */
export const UNRELIABLE_LIST = 30;

const time = (v: unknown) => (v === null || v === undefined ? 0 : toDate(v).getTime());
const iso = (t: number) => new Date(t).toISOString();
const isFirst = (r: Row) => r.firstTry === true || r.firstTry === 1;
const isStretch = (r: Row) => r.stretch === true || r.stretch === 1;

export interface ReportPoint { at: string; level: number; kind: HistoryKind }
export interface ReportStudent {
  studentId: string; name: string; placed: boolean; level: number | null; startLevel: number | null;
  points: ReportPoint[];
  checks: Record<RRPeriod, { level: number; at: string } | null>;
  /** the end-of-year level from the trend — an ESTIMATE (null: too few readings yet) */
  projected: ProjectionRange | null;
  lastChangeAt: string | null; daysSinceChange: number | null;
  /** level change over the last RISING_DAYS days */
  gain4w: number | null;
  readings4w: number;
  unreliableRuns: number;
}
export interface TypeAccuracy { type: QuestionType; name: string; correct: number; total: number; pct: number | null }
export interface UnreliableRun { runId: string; studentId: string; name: string; title: string; at: string; rapid: number; score: number | null }
export interface ReadRiseTeacherReport {
  classId: string; className: string; grade: number; band: { low: number; high: number }; yearEnd: string; windows: RRWindows;
  /** when the report was made (ISO) */
  now: string;
  students: ReportStudent[];
  stuck: { studentId: string; name: string; level: number; days: number; readings4w: number }[];
  rising: { studentId: string; name: string; level: number; gain: number }[];
  byType: TypeAccuracy[];
  unreliable: UnreliableRun[];
  summary: { students: number; placed: number; stuck: number; rising: number; unreliable: number; checksDue: { MOY: number; EOY: number } };
}

/** The level at a moment from a student's points (oldest first), null before the first. Pure. */
export function levelOn(points: readonly { at: string; level: number }[], t: number): number | null {
  let v: number | null = null;
  for (const p of points) { if (time(p.at) <= t) v = p.level; else break; }
  return v;
}

/** Stuck / rising for one student (pure). */
export function movement(points: readonly ReportPoint[], now: Date): { lastChangeAt: string | null; daysSinceChange: number | null; gain4w: number | null } {
  if (!points.length) return { lastChangeAt: null, daysSinceChange: null, gain4w: null };
  const last = points[points.length - 1];
  const nowT = now.getTime();
  const before = levelOn(points, nowT - RISING_DAYS * DAY) ?? points[0].level;
  return { lastChangeAt: last.at, daysSinceChange: Math.max(0, Math.floor((nowT - time(last.at)) / DAY)), gain4w: last.level - before };
}

/** Accuracy by question type from answered runs (pure): rapid answers are left out. */
export function accuracyByType(runs: readonly { articleId: string; band: string; answers: unknown; rapid: number[] }[], key: Map<string, { band: string; number: number; answer: string; skill: string }[]>): TypeAccuracy[] {
  const tally = new Map<QuestionType, [number, number]>();
  for (const r of runs) {
    const raw = typeof r.answers === "string" ? (() => { try { return JSON.parse(r.answers as string) as unknown; } catch { return {}; } })() : r.answers;
    const answers = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const skip = new Set(r.rapid);
    for (const q of key.get(r.articleId) ?? []) {
      if (q.band !== r.band || skip.has(q.number)) continue;
      const chosen = s(answers[String(q.number)]).toUpperCase();
      if (!chosen) continue;
      const type = normalizeQuestionType(q.skill) ?? "detail";
      const c = tally.get(type) ?? [0, 0];
      c[0] += chosen === q.answer.toUpperCase() ? 1 : 0; c[1]++;
      tally.set(type, c);
    }
  }
  return QUESTION_TYPES.filter((t) => tally.has(t)).map((type) => {
    const [correct, total] = tally.get(type)!;
    return { type, name: QUESTION_TYPE_NAME[type], correct, total, pct: total ? Math.round((100 * correct) / total) : null };
  });
}

/** 👩‍🏫 The class's ReadRise report (teachers of the class, coordinators, admins). */
export async function readRiseTeacherReport(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ReadRiseTeacherReport> {
  const klass = await assertClassRead(repo, actor, classId);
  const schoolId = s(klass.schoolId);
  const [grade, members, windows, yearEnd] = await Promise.all([
    repo.findUnique("Grade", { id: klass.gradeId }),
    repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] }),
    loadReadRiseWindows(repo, schoolId, now),
    yearEndFor(repo, schoolId, now),
  ]);
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const g = Number(grade?.level ?? 0);
  const empty = { classId, className: s(klass.name), grade: g, band: gradeBand(g), yearEnd: yearEnd.toISOString(), windows, now: now.toISOString() };
  if (!ids.length) return { ...empty, students: [], stuck: [], rising: [], byType: [], unreliable: [], summary: { students: 0, placed: 0, stuck: 0, rising: 0, unreliable: 0, checksDue: { MOY: 0, EOY: 0 } } };
  const [students, rrs, changeRows, runs, placements] = await Promise.all([
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
    repo.findMany("RRStudent", { studentId: { in: ids } }, { select: ["studentId", "level", "startLevel", "placedAt", "source"] }),
    repo.findMany("RRLevelChange", { studentId: { in: ids } }, { select: ["studentId", "fromLevel", "toLevel", "reason", "createdAt"] }),
    repo.findMany("RRRun", { studentId: { in: ids }, completedAt: { not: null } }, { select: ["id", "studentId", "articleId", "band", "answers", "score", "firstTry", "stretch", "completedAt", "answerMs", "rapidCount", "unreliable"] }),
    repo.findMany("RRPlacement", { studentId: { in: ids }, completedAt: { not: null } }, { select: ["studentId", "result", "period", "completedAt"] }),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const uname = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const names = new Map(students.map((x) => [s(x.id), uname.get(s(x.userId)) || "Student"]));
  const group = <T extends Row>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) { const l = m.get(s(r.studentId)); if (l) l.push(r); else m.set(s(r.studentId), [r]); } return m; };
  const rrBy = new Map(rrs.map((r) => [s(r.studentId), r]));
  const chBy = group(changeRows), runBy = group(runs), plBy = group(placements);
  const nowT = now.getTime();

  const rows: ReportStudent[] = ids.map((id) => {
    const rr = rrBy.get(id);
    const mine = runBy.get(id) ?? [];
    const placed = readRisePlaced(rr, (plBy.get(id) ?? []).length > 0) && !!rr;
    const checks = placementChecks(windows, plBy.get(id) ?? []);
    const unreliableRuns = mine.filter(isUnreliableRun).length;
    const readings4w = mine.filter((r) => isFirst(r) && time(r.completedAt) >= nowT - RISING_DAYS * DAY).length;
    if (!placed || !rr) return { studentId: id, name: names.get(id) ?? "Student", placed: false, level: null, startLevel: null, points: [], checks, projected: null, lastChangeAt: null, daysSinceChange: null, gain4w: null, readings4w, unreliableRuns };
    const changes = (chBy.get(id) ?? []).filter((c) => !s(c.reason).startsWith(RETAKE_REASON))
      .map((c) => ({ at: time(c.createdAt), from: Number(c.fromLevel), to: Number(c.toLevel), reason: s(c.reason) })).sort((a, b) => a.at - b.at);
    const journey = levelJourney({ startLevel: Number(rr.startLevel), placedAt: time(rr.placedAt), source: s(rr.source) }, changes);
    const points: ReportPoint[] = journey.events.map((e) => ({ at: e.at, level: e.level, kind: e.kind }));
    // the current level wins for "now" (a change may not have a history row)
    if (points.length && points[points.length - 1].level !== Number(rr.level)) points.push({ at: iso(nowT), level: Number(rr.level), kind: "OTHER" });
    const main = mine.filter((r) => isFirst(r) && !isStretch(r) && !isUnreliableRun(r));
    return {
      studentId: id, name: names.get(id) ?? "Student", placed: true, level: Number(rr.level), startLevel: Number(rr.startLevel), points, checks,
      projected: projectionRange(journey.points, main.map((r) => time(r.completedAt)), now, yearEnd),
      ...movement(points, now), readings4w, unreliableRuns,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const stuck = rows.filter((r) => r.placed && (r.daysSinceChange ?? 0) >= STUCK_DAYS)
    .map((r) => ({ studentId: r.studentId, name: r.name, level: r.level!, days: r.daysSinceChange!, readings4w: r.readings4w })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  const rising = rows.filter((r) => r.placed && (r.gain4w ?? 0) >= RISING_GAIN)
    .map((r) => ({ studentId: r.studentId, name: r.name, level: r.level!, gain: r.gain4w! })).sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name));

  // accuracy by question type: reliable first tries, rapid answers out
  const reliable = runs.filter((r) => isFirst(r) && !isUnreliableRun(r) && r.score !== null && r.score !== undefined);
  const key = await questionKeys(repo, [...new Set(reliable.map((r) => s(r.articleId)))]);
  const byType = accuracyByType(reliable.map((r) => ({ articleId: s(r.articleId), band: s(r.band), answers: r.answers, rapid: storedRapid(r.answerMs) })), key);

  const bad = runs.filter(isUnreliableRun).sort((a, b) => time(b.completedAt) - time(a.completedAt)).slice(0, UNRELIABLE_LIST);
  const arts = bad.length ? await repo.findMany("RRArticle", { id: { in: [...new Set(bad.map((r) => s(r.articleId)))] } }, { select: ["id", "title"] }) : [];
  const title = new Map(arts.map((a) => [s(a.id), s(a.title)]));
  const unreliable = bad.map((r) => ({
    runId: s(r.id), studentId: s(r.studentId), name: names.get(s(r.studentId)) ?? "Student", title: title.get(s(r.articleId)) ?? "Article",
    at: iso(time(r.completedAt)), rapid: Number(r.rapidCount ?? 0) || storedRapid(r.answerMs).length, score: r.score === null || r.score === undefined ? null : Number(r.score),
  }));
  const today = iso(nowT).slice(0, 10);
  const open = (p: "MOY" | "EOY") => today >= windows[p].opens && today <= windows[p].closes;
  return {
    ...empty, students: rows, stuck, rising, byType, unreliable,
    summary: {
      students: rows.length, placed: rows.filter((r) => r.placed).length, stuck: stuck.length, rising: rising.length, unreliable: runs.filter(isUnreliableRun).length,
      checksDue: { MOY: open("MOY") ? rows.filter((r) => r.placed && !r.checks.MOY).length : 0, EOY: open("EOY") ? rows.filter((r) => r.placed && !r.checks.EOY).length : 0 },
    },
  };
}
