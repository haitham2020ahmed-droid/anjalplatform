/**
 * 🚀 ReadRise level engine (Achieve3000-like): the student's personal ReadRise Level and how it moves.
 *
 *  - Only FIRST-TRY activity scores count (the first scored reading of an article; re-reads never count).
 *  - Rolling window of the first-try scores since the last level change (any change resets it) — owner r69: faster
 *    DOWN, careful UP (a student placed far above their level, e.g. the old default start, is corrected quickly):
 *      one first-try score ≤ 25%                   → −100 at once
 *      two first-try scores in a row < 50%         → −100
 *      3 of the last 4 ≥ 75% and the latest ≥ 75%  → +50 (unchanged)
 *    never below 200 or above 1500; the reason is written in plain words (RRLevelChange) for the teacher.
 *  - An UNRELIABLE run (2+ rapid answers, accuracy.ts) never takes part: no level move, no goal, no skill evidence.
 *  - A STRETCH reading (one version higher) joins the window only when it scored ≥ 75%: it can help a student
 *    move up and counts toward the weekly goal, but never lowers the level.
 *  - A teacher can set the level (source TEACHER). Every change is an RRLevelChange with a clear reason.
 *  - Weekly goal (default 2 articles a week at 75%+ on the first try), streak of weeks meeting it, growth since
 *    placement, and a projected end-of-year level (linear trend of the last 8 weeks — an estimate).
 * Weeks start on Sunday (Saudi school week), Riyadh time (UTC+3).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { RR_LEVELS, RR_MAX, RR_MIN, defaultLevel } from "./level";

export const s = (v: unknown) => String(v ?? "");
export const toDate = (v: unknown) => (v instanceof Date ? v : new Date(s(v)));
// 🐛 fix (audit finding, Oct 2026): `max` keeps a 100-point margin above RR_MAX (same margin as before: it was 1500
// when RR_MAX was 1400) so ordinary reading-growth adjustments have room to move a student past the nearest version
// level without clamping — now that RR_MAX is 1600 (level.ts), this had to move too, or a student placed at 1600
// would get silently pulled back down to 1500 by the very next level-change calculation.
export const ENGINE = { up: 75, down: 50, step: 50, max: 1700, min: 200, /** one score at or under this → down at once */ floor: 25, /** a step down */ downStep: 100 } as const;
/** RRLevelChange rows with this reason prefix only record a teacher's retake permission (no level change). */
export const RETAKE_REASON = "Placement retake allowed";
const DAY = 86_400_000, WEEK = 7 * DAY, RIYADH = 3 * 3_600_000;

/** Round to 10 and keep inside the engine's range (200–1700). */
export const clampEngine = (l: number) => Math.min(ENGINE.max, Math.max(ENGINE.min, Math.round(l / 10) * 10));
/** The nearest of the 14 version levels to a measure (clamped to 300–1600). */
export function nearestLevel(x: number): number {
  const c = Math.min(RR_MAX, Math.max(RR_MIN, x));
  return (RR_LEVELS as readonly number[]).reduce((best, l) => (Math.abs(l - c) < Math.abs(best - c) ? l : best), RR_MIN);
}

// ------------------------------------------------------------------ the student's level row

/** The most recent MAP Lexile (any subject row that carries one), or null. */
export async function latestMapLexile(repo: Repo, studentId: string): Promise<number | null> {
  const rows = (await repo.findMany("MapResult", { studentId, lexile: { not: null } }, { select: ["lexile", "testDate"] }))
    .sort((a, b) => toDate(b.testDate).getTime() - toDate(a.testDate).getTime());
  const v = rows.length ? Number(rows[0].lexile) : NaN;
  return Number.isFinite(v) ? v : null;
}

async function studentGrade(repo: Repo, student: Row): Promise<number> {
  const g = await repo.findUnique("Grade", { id: s(student.gradeId) });
  return g ? Number(g.level) : 5;
}

/** The student's start before any placement: the latest MAP Lexile (nearest level) or the grade's default. */
export async function initialLevel(repo: Repo, studentId: string): Promise<{ level: number; source: "MAP" | "DEFAULT"; mapLexile: number | null }> {
  const map = await latestMapLexile(repo, studentId);
  if (map !== null) return { level: nearestLevel(map), source: "MAP", mapLexile: map };
  const st = await repo.findUnique("Student", { id: studentId });
  return { level: defaultLevel(st ? await studentGrade(repo, st) : 5), source: "DEFAULT", mapLexile: null };
}

/**
 * 🎯 Has the student a REAL ReadRise level? Only after the placement test (source PLACEMENT, or a completed
 * RRPlacement) or when a teacher set the level by hand (source TEACHER). The row that ensureRRStudent creates on
 * first use (the MAP Lexile or the grade's default, e.g. 950 in Grade 6: source MAP / DEFAULT) is only a working start
 * for picking article versions: it is never shown as a level (student pages, home gauge, teacher / admin reports
 * say "No placement yet"). Students who had such a row before this rule are treated the same; nothing is deleted.
 */
export function readRisePlaced(rr: Row | null | undefined, completedPlacement = false): boolean {
  if (!rr) return false;
  const src = s(rr.source);
  return src === "PLACEMENT" || src === "TEACHER" || completedPlacement;
}

/** The RRStudent row, created on first use (MAP Lexile or the grade default). */
export async function ensureRRStudent(repo: Repo, studentId: string, now = new Date()): Promise<Row> {
  const have = await repo.findUnique("RRStudent", { studentId });
  if (have) return have;
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st) throw new ForbiddenError("Student not found.");
  const init = await initialLevel(repo, studentId);
  return repo.upsert("RRStudent", { studentId }, { studentId, schoolId: s(st.schoolId), level: init.level, startLevel: init.level, source: init.source, placedAt: now }, {});
}

/** A teacher of the student's class, or a school admin of the student's school. Returns the Student row. */
export async function assertStaffForStudent(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || st.deletedAt) throw new ForbiddenError("Student not found.");
  const ok = actor.role === "SUPER_ADMIN" || (actor.schoolId === st.schoolId && (actor.role === "SCHOOL_ADMIN" || (actor.role === "TEACHER" && (actor.teacherStudentIds?.has(studentId) ?? false))));
  if (!ok) throw new ForbiddenError("You can only manage your own students.");
  return st;
}

export async function recordLevelChange(repo: Repo, c: { studentId: string; schoolId: string; from: number; to: number; reason: string; now: Date }): Promise<void> {
  await repo.create("RRLevelChange", { studentId: c.studentId, schoolId: c.schoolId, fromLevel: c.from, toLevel: c.to, reason: c.reason.slice(0, 300), createdAt: c.now });
}

/** Level changes that reset the window (not the retake-permission markers), oldest first. */
export async function levelChanges(repo: Repo, studentId: string): Promise<Row[]> {
  return (await repo.findMany("RRLevelChange", { studentId }))
    .filter((r) => !s(r.reason).startsWith(RETAKE_REASON))
    .sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime());
}

// ------------------------------------------------------------------ the rule (pure)

export interface LevelDecision { delta: number; reason: string | null }

/**
 * The level rule on the window of first-try scores since the last change (oldest → newest). Pure.
 * Down first (≤ 25% once, or two in a row under 50%: −100), then up (3 of the last 4 at 75%+ with the latest
 * 75%+: +50). The reason is in plain words for the teacher.
 */
export function levelDecision(scores: number[]): LevelDecision {
  if (!scores.length) return { delta: 0, reason: null };
  const latest = scores[scores.length - 1];
  if (latest <= ENGINE.floor) return { delta: -ENGINE.downStep, reason: `the first-try score on the last article was ${latest}% (${ENGINE.floor}% or lower), so the articles were too hard` };
  const prev = scores.length >= 2 ? scores[scores.length - 2] : null;
  if (prev !== null && latest < ENGINE.down && prev < ENGINE.down) return { delta: -ENGINE.downStep, reason: `the last two first-try scores were both under ${ENGINE.down}% (${prev}% and ${latest}%), so the articles were too hard` };
  const last4 = scores.slice(-4);
  const high = last4.filter((x) => x >= ENGINE.up).length;
  if (latest >= ENGINE.up && high >= 3) return { delta: ENGINE.step, reason: `${high} of the last ${last4.length} first-try scores were ${ENGINE.up}% or higher (latest ${latest}%)` };
  return { delta: 0, reason: null };
}

/** A run marked Unreliable (2+ rapid answers: accuracy.ts). */
const unreliableRun = (r: Row) => r.unreliable === true || r.unreliable === 1;

/** Does this scored run take part in the level window? (first try, not Unreliable; a stretch only when ≥ 75%) */
export const countsForLevel = (r: Row) => r.firstTry === true && r.score !== null && r.score !== undefined && !unreliableRun(r) && (r.stretch !== true || Number(r.score) >= ENGINE.up);

/**
 * Runs after a first-try activity was scored (the run row already has its score and completedAt).
 * Applies the rule; returns the level before/after. Writes RRStudent (+ RRLevelChange when it moves).
 */
// r85 audit (#3): applyFirstTryScore reads RRStudent.level/articlesDone, decides a new level from them, and used
// to write RRStudent back unconditionally — two runs for the same student finishing within the same moment (e.g. a
// stretch run and its base run, or a client retry) could both read the same stale row and the later write would
// silently clobber the earlier one (a lost articlesDone increment, or a level move undone), while the level-change
// audit row from the clobbered write stayed behind regardless. A few retries with the write conditioned on the
// exact row we read (optimistic concurrency) makes a lost update detectable instead of silent: on a stale write we
// just recompute from a fresh read, which is always safe here (studentId+level/articlesDone is the whole input).
const CONCURRENT_RETRIES = 3;
export async function applyFirstTryScore(repo: Repo, run: Row, now: Date): Promise<{ levelBefore: number; levelAfter: number; reason: string | null }> {
  const studentId = s(run.studentId);
  for (let attempt = 0; ; attempt++) {
    const rr = await ensureRRStudent(repo, studentId, now);
    const before = Number(rr.level);
    const articlesDoneBefore = Number(rr.articlesDone ?? 0);
    const changes = await levelChanges(repo, studentId);
    const since = changes.length ? toDate(changes[changes.length - 1].createdAt).getTime() : -Infinity;
    const runs = (await repo.findMany("RRRun", { studentId, firstTry: true, score: { not: null } }))
      .filter((r) => r.completedAt && toDate(r.completedAt).getTime() > since && countsForLevel(r))
      .sort((a, b) => toDate(a.completedAt).getTime() - toDate(b.completedAt).getTime());
    const dec = levelDecision(runs.map((r) => Number(r.score)));
    // a stretch can only move the level up. r85 audit (#4 — checked, not a bug): this guard looks like it could
    // mask a legitimate down-adjustment, but `countsForLevel` above only lets a stretch run into `runs` when its
    // OWN score is ≥ ENGINE.up (75), and this function is only ever called for a stretch run when its score is
    // already ≥ 75 (student.ts) — so whenever `run.stretch === true` reaches this line, `dec.delta` can never be
    // negative in practice; the `< 0` branch is unreachable. Left in place as a documented safety net, not removed.
    const delta = run.stretch === true && dec.delta < 0 ? 0 : dec.delta;
    const after = delta ? clampEngine(before + delta) : before;
    const patch: Row = run.stretch === true ? {} : { articlesDone: articlesDoneBefore + 1 };
    if (after !== before) patch.level = after;
    if (!Object.keys(patch).length) return { levelBefore: before, levelAfter: after, reason: null };
    // optimistic lock: only write if RRStudent still has the exact values we just read and decided from
    const where: Row = { studentId };
    if ("level" in patch) where.level = before;
    if ("articlesDone" in patch) where.articlesDone = articlesDoneBefore;
    const changed = await repo.updateMany("RRStudent", where, patch);
    if (!changed) {
      if (attempt >= CONCURRENT_RETRIES) throw new ValidationError("Could not save the reading result — please try again.");
      continue; // another run for this student committed in between; re-read and recompute from the fresh row
    }
    if (after !== before) await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: before, to: after, reason: `${after > before ? "Up" : "Down"} ${Math.abs(after - before)}: ${dec.reason}`, now });
    return { levelBefore: before, levelAfter: after, reason: after !== before ? dec.reason : null };
  }
}

/** 👩‍🏫 A teacher (or school admin) sets a student's ReadRise Level (for the teacher pages). */
export async function setLevelByTeacher(repo: Repo, actor: Actor, studentId: string, level: number, reason = "", now = new Date()): Promise<{ from: number; to: number }> {
  await assertStaffForStudent(repo, actor, studentId);
  if (!Number.isFinite(level)) throw new ValidationError("Enter a ReadRise Level.");
  const to = clampEngine(level);
  const rr = await ensureRRStudent(repo, studentId, now);
  const from = Number(rr.level);
  await repo.updateMany("RRStudent", { studentId }, { level: to, source: "TEACHER" });
  await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from, to, reason: `Teacher set the level${reason.trim() ? `: ${reason.trim()}` : ""}`, now });
  return { from, to };
}

// ------------------------------------------------------------------ weeks, goals, projection (pure)

/** Start (ms, UTC) of the Sunday-based Riyadh week that contains `d`. */
export function weekStart(d: Date): number {
  const local = new Date(d.getTime() + RIYADH);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return midnight - local.getUTCDay() * DAY - RIYADH;
}

export interface GoalStats { goal: number; thisWeek: number; met: boolean; streak: number; weeksMet: number }

/** Goal math from the qualifying completion dates (first try ≥ 75%, stretch included). */
export function goalStats(qualifying: Date[], weeklyGoal: number, now: Date): GoalStats {
  const goal = Math.max(1, weeklyGoal || 2);
  const perWeek = new Map<number, number>();
  for (const d of qualifying) { const w = weekStart(d); perWeek.set(w, (perWeek.get(w) ?? 0) + 1); }
  const cur = weekStart(now);
  const thisWeek = perWeek.get(cur) ?? 0;
  const met = thisWeek >= goal;
  let streak = 0;
  for (let w = met ? cur : cur - WEEK; (perWeek.get(w) ?? 0) >= goal; w -= WEEK) streak++;
  const weeksMet = [...perWeek.values()].filter((n) => n >= goal).length;
  return { goal, thisWeek, met, streak, weeksMet };
}

export interface LevelPoint { at: Date; level: number }

/** The level at a moment from the history (points sorted oldest first). */
export function levelAt(points: LevelPoint[], t: number): number | null {
  let v: number | null = null;
  for (const p of points) { if (p.at.getTime() <= t) v = p.level; else break; }
  return v;
}

/**
 * Projected level at `yearEnd`: least-squares slope of the weekly level over the last 8 weeks (per week,
 * limited to −20…+30), applied to the weeks left. null with under 2 weeks of history. An ESTIMATE.
 */
export function projectLevel(points: LevelPoint[], now: Date, yearEnd: Date): number | null {
  if (!points.length) return null;
  const xs: number[] = [], ys: number[] = [];
  for (let w = 8; w >= 0; w--) {
    const t = now.getTime() - w * WEEK;
    const v = levelAt(points, t);
    if (v !== null) { xs.push(-w); ys.push(v); }
  }
  if (xs.length < 3) return null;
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = Math.min(30, Math.max(-20, den ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den : 0));
  const weeksLeft = Math.max(0, (yearEnd.getTime() - now.getTime()) / WEEK);
  return clampEngine(ys[ys.length - 1] + slope * weeksLeft);
}

// ------------------------------------------------------------------ read helpers (dashboards may call these)

/** Level history for charts: the start, then every change. */
export async function levelHistory(repo: Repo, studentId: string): Promise<{ points: LevelPoint[]; changes: { at: Date; from: number; to: number; reason: string }[] }> {
  const rr = await repo.findUnique("RRStudent", { studentId });
  if (!rr) return { points: [], changes: [] };
  const changes = (await levelChanges(repo, studentId)).map((c) => ({ at: toDate(c.createdAt), from: Number(c.fromLevel), to: Number(c.toLevel), reason: s(c.reason) }));
  // the growth story starts at the placement (or the first use): its start level, then every later change
  const placedAt = toDate(rr.placedAt).getTime();
  const later = changes.filter((c) => c.at.getTime() > placedAt);
  const points: LevelPoint[] = [{ at: new Date(placedAt), level: Number(rr.startLevel) }, ...later.map((c) => ({ at: c.at, level: c.to }))];
  return { points, changes };
}

export async function yearEndFor(repo: Repo, schoolId: string, now: Date): Promise<Date> {
  const y = (await repo.findMany("AcademicYear", { schoolId, isCurrent: true }))[0];
  if (y && toDate(y.endDate).getTime() > now.getTime()) return toDate(y.endDate);
  const june = new Date(Date.UTC(now.getUTCFullYear(), 5, 30));
  return june.getTime() > now.getTime() ? june : new Date(Date.UTC(now.getUTCFullYear() + 1, 5, 30));
}

export interface ReadRiseSummary {
  level: number; startLevel: number; source: string; growth: number; articlesDone: number; firstTryAvg: number | null;
  weeklyGoal: number; thisWeek: number; goalMet: boolean; streak: number; weeksMet: number; projected: number | null; placed: boolean;
  /** scored first-try readings so far (0 = nothing read yet: no accuracy or growth to show) */
  runs: number;
}

/** A projection needs this much evidence: first-try runs (not stretch) spread over at least this many days. */
export const PROJECTION_MIN_RUNS = 4, PROJECTION_MIN_DAYS = 14;

/**
 * The end-of-year estimate (readiness I-21): only with PROJECTION_MIN_RUNS first-try runs over PROJECTION_MIN_DAYS
 * days, and always on the ReadRise scale (RR_MIN–RR_MAX) — never “about 200”.
 */
export async function readRiseProjection(repo: Repo, firstTry: Row[], points: LevelPoint[], schoolId: string, now: Date): Promise<number | null> {
  const at = firstTry.map((r) => (r.completedAt ? toDate(r.completedAt).getTime() : 0)).filter((t) => t > 0).sort((a, b) => a - b);
  if (at.length < PROJECTION_MIN_RUNS || at[at.length - 1] - at[0] < PROJECTION_MIN_DAYS * DAY) return null;
  const p = projectLevel(points, now, await yearEndFor(repo, schoolId, now));
  return p === null ? null : Math.min(RR_MAX, Math.max(RR_MIN, p));
}

/** One student's ReadRise numbers (null before the student ever opened ReadRise). */
export async function studentReadRiseSummary(repo: Repo, studentId: string, now = new Date()): Promise<ReadRiseSummary | null> {
  const rr = await repo.findUnique("RRStudent", { studentId });
  if (!rr) return null;
  // an Unreliable run (2+ rapid answers) counts for nothing: not the average, the goal or the projection
  const runs = (await repo.findMany("RRRun", { studentId, firstTry: true, score: { not: null } }, { select: ["score", "stretch", "completedAt", "unreliable"] })).filter((r) => !unreliableRun(r));
  const main = runs.filter((r) => r.stretch !== true);
  const firstTryAvg = main.length ? Math.round(main.reduce((a, r) => a + Number(r.score), 0) / main.length) : null;
  const g = goalStats(runs.filter((r) => Number(r.score) >= ENGINE.up && r.completedAt).map((r) => toDate(r.completedAt)), Number(rr.weeklyGoal), now);
  const { points } = await levelHistory(repo, studentId);
  const placed = readRisePlaced(rr, (await repo.count("RRPlacement", { studentId, completedAt: { not: null } })) > 0);
  return {
    level: Number(rr.level), startLevel: Number(rr.startLevel), source: s(rr.source), growth: Number(rr.level) - Number(rr.startLevel),
    articlesDone: Number(rr.articlesDone ?? 0), firstTryAvg, weeklyGoal: g.goal, thisWeek: g.thisWeek, goalMet: g.met, streak: g.streak, weeksMet: g.weeksMet,
    projected: await readRiseProjection(repo, main, points, s(rr.schoolId), now), placed, runs: runs.length,
  };
}
