/**
 * 🚀 ReadRise level engine (Achieve3000-like): the student's personal ReadRise Level and how it moves.
 *
 *  - Only FIRST-TRY activity scores count (the first scored reading of an article; re-reads never count).
 *  - Rolling window of the first-try scores since the last level change (any change resets it) — owner r69: faster
 *    DOWN, careful UP (a student placed far above their level, e.g. the old default start, is corrected quickly):
 *      one first-try score ≤ 25%                   → −100 at once
 *      two first-try scores in a row < 50%         → −100
 *      3 of the last 4 ≥ 75% and the latest ≥ 75%  → +50 (unchanged)
 *    never below RR_FLOOR (−400, "BR400L": round 6) or above 1700; the reason is written in plain words (RRLevelChange) for the teacher.
 *  - An UNRELIABLE run (2+ rapid answers, accuracy.ts) never takes part: no level move, no goal, no skill evidence.
 *  - A STRETCH reading (one version higher) joins the window only when it scored ≥ 75% AND used new questions (a
 *    stretch set "S-…" or a new band, first-try.ts): it can help a student move up but never lowers the level. A
 *    practice stretch (same questions) never joins the window. Weekly goal: one credit per article (goalRuns).
 *  - A teacher can set the level (source TEACHER). Every change is an RRLevelChange with a clear reason.
 *  - Weekly goal (default 2 articles a week at 75%+ on the first try), streak of weeks meeting it, growth since
 *    placement, and a projected end-of-year level (linear trend of the last 8 weeks — an estimate).
 * Weeks start on Sunday (Saudi school week), Riyadh time (UTC+3).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { RR_FLOOR, RR_LEVELS, RR_MAX, RR_MIN, defaultLevel } from "./level";
import { articleRuns, countedTries, goalRuns, isUnreliableRun, rapidRead } from "./first-try";

export const s = (v: unknown) => String(v ?? "");
export const toDate = (v: unknown) => (v instanceof Date ? v : new Date(s(v)));
// 🐛 fix (audit finding, Oct 2026): `max` keeps a 100-point margin above RR_MAX (same margin as before: it was 1500
// when RR_MAX was 1400) so ordinary reading-growth adjustments have room to move a student past the nearest version
// level without clamping — now that RR_MAX is 1600 (level.ts), this had to move too, or a student placed at 1600
// would get silently pulled back down to 1500 by the very next level-change calculation.
// Round 6 (owner): `min` is RR_FLOOR (−400, "BR400L") — a weak reader's level can go below the lowest version (300);
// they read the 300 version (level.ts).
/**
 * Round 9 (owner, 7 Nov 2026 — "fully automatic, in the student's favour"):
 *  - up: 3 of the last 4 at 75%+ with the latest 75%+ → +50 (unchanged);
 *  - ONE bad article (even ≤ 25%) never moves the level (a bad day, a strange topic, a wrong click);
 *  - two in a row under 50% → −50 (was −100); two in a row at or under 25% → −100 (the texts are far too hard);
 *  - 3 of the last 4 under 50% with the latest under 50% → −50;
 *  - round 14: the last 4 averaging under 60% (latest under 75%) → −50;
 *  - after an automatic drop, two in a row at 75%+ → +50 back at once (a wrong drop mends itself fast);
 *  - every automatic drop sends the class teachers a notification (information only: nothing to approve).
 */
export const ENGINE = {
  up: 75, down: 50, step: 50, max: 1700, min: RR_FLOOR,
  /** two scores in a row at or under this → the big step down */ floor: 25,
  /** the big step down (two very low scores in a row) */ downStep: 100,
  /** the usual step down */ downSmall: 50,
  /** after an automatic drop: this many strong reads in a row move the level back up */ returnReads: 2,
  /** 🎯 round 11 (Achieve3000: "routinely ABOVE 75%"): the strong scores that move the level up must average above this */ upAverage: 75,
  /** 🌱 round 11 (Achieve3000: emerging readers can rise below 75%): an emerging reader's "strong" score */ upEmerging: 63,
  /** 🌱 below this level a reader is an emerging reader (Achieve3000's ER) */ emergingBelow: 50,
  /** 📉 round 14 (owner audit: a reader averaging ~55% never moved down — 50% is not "under 50%"): the last 4 counted
   * first tries averaging under this (latest under ENGINE.up) → down ENGINE.downSmall */ downAverage: 60,
} as const;
/**
 * 🛡️ Round 10 (owner, 11 Nov 2026: a Grade 5 reader placed at 1600 scored 38% and the level stayed): the first
 * PROBATION_READS counted first tries after a placement (or a MAP check) confirm it — one score under 50% moves the
 * level down 100 at once, at or under 25% down 200; it keeps doing so for each of those first reads.
 */
export const PROBATION_READS = 3;
export const PROBATION_TAG = "(check after placement)";
/** 🧹 round 13: the reason prefix of the one-time level check after the question rewrite (round13.ts). */
export const LEVEL_CHECK_PREFIX = "Level check";
/** A level change that starts a new probation: a placement, a MAP check or a level check (round 13). */
export const isAnchorChange = (reason: unknown): boolean => /^(Placement|MAP check|Level check)/.test(s(reason));
/** The reason prefix of an automatic drop (RRLevelChange.reason starts with it). */
export const AUTO_DOWN_PREFIX = "Down ";
/** RRLevelChange rows with this reason prefix only record a teacher's retake permission (no level change). */
export const RETAKE_REASON = "Placement retake allowed";
const DAY = 86_400_000, WEEK = 7 * DAY, RIYADH = 3 * 3_600_000;

/** Round to 10 and keep inside the engine's range (RR_FLOOR −400 … 1700). */
export const clampEngine = (l: number) => Math.min(ENGINE.max, Math.max(ENGINE.min, Math.round(l / 10) * 10));
/**
 * The nearest of the 14 version levels to a measure (clamped to 300–1600). Round 6: a measure below 250 (e.g. a MAP
 * Lexile of 95 or BR150) is no longer pushed up to 300 — it is rounded to 10 and kept at or above RR_FLOOR.
 */
export function nearestLevel(x: number): number {
  if (!Number.isFinite(x)) return RR_MIN;
  if (x < RR_MIN - 50) return Math.max(RR_FLOOR, Math.round(x / 10) * 10);
  const c = Math.min(RR_MAX, Math.max(RR_MIN, x));
  return (RR_LEVELS as readonly number[]).reduce((best, l) => (Math.abs(l - c) < Math.abs(best - c) ? l : best), RR_MIN);
}

// ------------------------------------------------------------------ the student's level row

/** The most recent MAP Lexile (any subject row that carries one), or null. */
export async function latestMapLexile(repo: Repo, studentId: string): Promise<number | null> {
  return (await latestMap(repo, studentId))?.lexile ?? null;
}

/** The most recent MAP Lexile with its test date, or null. */
export async function latestMap(repo: Repo, studentId: string): Promise<{ lexile: number; testDate: Date } | null> {
  const rows = (await repo.findMany("MapResult", { studentId, lexile: { not: null } }, { select: ["lexile", "testDate"] }))
    .sort((a, b) => toDate(b.testDate).getTime() - toDate(a.testDate).getTime());
  const v = rows.length ? Number(rows[0].lexile) : NaN;
  return Number.isFinite(v) ? { lexile: v, testDate: toDate(rows[0].testDate) } : null;
}

/** 🛡️ Round 10: a ReadRise level stays within this many points of a recent MAP Lexile (placement + MAP check). */
export const MAP_BAND = 150;

/** Round 6: a MAP Lexile counts as a placement start / check only when it is this recent. */
export const MAP_RECENT_DAYS = 183;
/** The latest MAP Lexile when it is from the last 6 months (MAP_RECENT_DAYS), else null. */
export async function recentMapLexile(repo: Repo, studentId: string, now = new Date()): Promise<number | null> {
  const m = await latestMap(repo, studentId);
  if (!m) return null;
  const age = now.getTime() - m.testDate.getTime();
  return Number.isFinite(age) && age <= MAP_RECENT_DAYS * DAY ? m.lexile : null;
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

/**
 * 🩹 fix (Oct 2026): ensureRRStudent() only ever runs its MAP lookup ONCE, the first time a student opens
 * ReadRise — if their MAP Reading Lexile is imported LATER (after that first open), the row it already created
 * stays on the grade-based guess (source DEFAULT) forever, since nothing ever re-checks it. Call this right after a
 * MAP Reading score with a Lexile lands, so that specific gap closes automatically with no teacher action needed.
 *
 * Deliberately narrow: only touches a student whose RRStudent row is still source === "DEFAULT" (never had a real
 * anchor — placement test, teacher override, or an earlier MAP import). A student already on MAP/PLACEMENT/TEACHER
 * is left completely alone, even if this new MAP score differs — their level may already reflect real reading
 * growth from practice since that anchor, and a fresh test score re-anchoring it would throw that away. If the
 * student has no RRStudent row yet, there is nothing to backfill: ensureRRStudent() will pick this MAP score up
 * correctly the first time they do open ReadRise, same as always.
 */
export async function backfillReadRiseFromMap(repo: Repo, studentId: string, mapLexile: number, now = new Date()): Promise<void> {
  const rr = await repo.findUnique("RRStudent", { studentId });
  if (!rr || s(rr.source) !== "DEFAULT") return;
  const level = nearestLevel(mapLexile);
  if (level === Number(rr.level)) return; // same rung already: nothing to change, no noise in the level history
  await repo.updateMany("RRStudent", { studentId }, { level, startLevel: level, source: "MAP" });
  await recordLevelChange(repo, {
    studentId, schoolId: s(rr.schoolId), from: Number(rr.level), to: level,
    reason: "MAP Reading Lexile imported after this student's placeholder grade-level start — level corrected to the real measure.",
    now,
  });
}

/**
 * 🛡️ Round 10 (owner: "fully automatic"): a placed student's level is kept within MAP_BAND of a MAP Reading Lexile
 * from the last 6 months — run when a MAP file is imported and once after the update (the startup job). A level a
 * teacher set by hand is left alone (the teacher decided). The change is a "MAP check" (an anchor: the next first
 * tries are the probation). Returns the new level, or null when nothing changed.
 */
/** 🛡️ Round 10: the Lexile NWEA reports for a Reading RIT (fitted on the school's own reports: 166 → 10L, 204 → 740L). */
export const lexileForRit = (rit: number): number => Math.round(19.3 * (Number(rit) - 166) + 10);
/** a MAP Lexile further than this from lexileForRit(RIT) is a data error (e.g. 1725L for a Grade 5 reader) */
export const LEXILE_RIT_TOLERANCE = 350;
export const lexileFitsRit = (lexile: number, rit: number | null): boolean => rit === null || !Number.isFinite(Number(rit)) || Math.abs(Number(lexile) - lexileForRit(Number(rit))) <= LEXILE_RIT_TOLERANCE;

export async function alignReadRiseToMap(repo: Repo, studentId: string, now = new Date()): Promise<number | null> {
  const rr = await repo.findUnique("RRStudent", { studentId });
  if (!rr || s(rr.source) !== "PLACEMENT") return null;
  const map = await latestMap(repo, studentId);
  if (!map || now.getTime() - map.testDate.getTime() > MAP_RECENT_DAYS * DAY) return null;
  const level = Number(rr.level);
  const to = clampEngine(Math.min(map.lexile + MAP_BAND, Math.max(map.lexile - MAP_BAND, level)));
  if (to === level) return null;
  const changed = await repo.updateMany("RRStudent", { studentId, level: rr.level }, { level: to });
  if (!changed) return null;
  await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: level, to, reason: `MAP check: the MAP Reading Lexile is ${map.lexile}, so the level was moved within ${MAP_BAND} of it (was ${level})`, now });
  return to;
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
 * The level rule on the window of first-try scores since the last change (oldest → newest). Pure. Round 9 (see
 * ENGINE): down first — two in a row ≤ 25% → −100; two in a row under 50% → −50; 3 of the last 4 under 50% (latest
 * under 50%) → −50; one bad score alone never moves the level. Then up — after an automatic drop (`afterDrop`), two
 * in a row at 75%+ → +50; else 3 of the last 4 at 75%+ with the latest 75%+ → +50. Round 11 (Achieve3000): those strong
 * scores must average ABOVE 75%; an emerging reader (level < 50) moves up from 63%. The reason is in plain words for
 * the teacher.
 */
export function levelDecision(scores: number[], opts: { afterDrop?: boolean; probation?: boolean; level?: number | null } = {}): LevelDecision {
  if (!scores.length) return { delta: 0, reason: null };
  const latest = scores[scores.length - 1];
  // 🛡️ round 10: right after a placement one low score is enough (the placement may have been too high)
  if (opts.probation && latest < ENGINE.down) return latest <= ENGINE.floor
    ? { delta: -2 * ENGINE.downStep, reason: `${PROBATION_TAG} the first-try score was ${latest}% (${ENGINE.floor}% or lower) soon after the placement or level check, so the level was too high` }
    : { delta: -ENGINE.downStep, reason: `${PROBATION_TAG} the first-try score was ${latest}% (under ${ENGINE.down}%) soon after the placement or level check, so the level was too high` };
  const prev = scores.length >= 2 ? scores[scores.length - 2] : null;
  if (prev !== null && latest <= ENGINE.floor && prev <= ENGINE.floor) return { delta: -ENGINE.downStep, reason: `the last two first-try scores were both ${ENGINE.floor}% or lower (${prev}% and ${latest}%), so the articles were far too hard` };
  if (prev !== null && latest < ENGINE.down && prev < ENGINE.down) return { delta: -ENGINE.downSmall, reason: `the last two first-try scores were both under ${ENGINE.down}% (${prev}% and ${latest}%), so the articles were too hard` };
  const last4 = scores.slice(-4);
  const low = last4.filter((x) => x < ENGINE.down).length;
  if (latest < ENGINE.down && low >= 3) return { delta: -ENGINE.downSmall, reason: `${low} of the last ${last4.length} first-try scores were under ${ENGINE.down}% (latest ${latest}%), so the articles were too hard` };
  // 📉 round 14: texts that stay too hard without single scores under 50% (63, 50, 50, 63 …): the last 4 average under 60%
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (last4.length >= 4 && latest < ENGINE.up && mean(last4) < ENGINE.downAverage) return { delta: -ENGINE.downSmall, reason: `the last 4 first-try scores averaged ${Math.round(mean(last4))}% (under ${ENGINE.downAverage}%), so the articles were too hard` };
  // 🎯 round 11: up like Achieve3000 — strong scores must average ABOVE 75% (75, 75, 75 is not enough); an emerging
  // reader (level under 50) moves up from 63% (Achieve3000: emerging readers can rise below 75%)
  const emerging = opts.level !== undefined && opts.level !== null && Number(opts.level) < ENGINE.emergingBelow;
  const bar = emerging ? ENGINE.upEmerging : ENGINE.up;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // the STRONG scores (75%+) must average above 75%: 75, 75, 75 is not enough; 80, 40, 80, 80 is
  const strong = (xs: number[]) => xs.filter((x) => x >= bar);
  const avgOk = (xs: number[]) => emerging || (strong(xs).length > 0 && avg(strong(xs)) > ENGINE.upAverage);
  const tail = emerging ? " (an emerging reader)" : "";
  const lastN = scores.slice(-ENGINE.returnReads);
  if (opts.afterDrop && lastN.length === ENGINE.returnReads && lastN.every((x) => x >= bar) && avgOk(lastN)) return { delta: ENGINE.step, reason: `back up after the drop: the last ${ENGINE.returnReads} first-try scores were ${bar}% or higher (${lastN.map((x) => `${x}%`).join(" and ")})${tail}` };
  const high = last4.filter((x) => x >= bar).length;
  if (latest >= bar && high >= 3 && avgOk(last4)) return { delta: ENGINE.step, reason: emerging ? `${high} of the last ${last4.length} first-try scores were ${bar}% or higher (latest ${latest}%)${tail}` : `${high} of the last ${last4.length} first-try scores were ${bar}% or higher (average ${Math.round(avg(strong(last4)))}%, above ${ENGINE.upAverage}%), latest ${latest}%` };
  return { delta: 0, reason: null };
}

/** Round 9: was the last level change an automatic drop? (then two strong reads bring the level back up) */
export const afterAutoDrop = (changes: readonly Row[]): boolean => changes.length > 0 && s(changes[changes.length - 1].reason).startsWith(AUTO_DOWN_PREFIX);

/** A run marked Unreliable (2+ rapid answers: accuracy.ts). */
const unreliableRun = (r: Row) => isUnreliableRun(r);

/**
 * Does this scored run take part in the level window? (first try, not Unreliable; a stretch only when ≥ 75%).
 * Round 4 (owner): the SAME read-time rule as the skill evidence — a run read faster than RR_MIN_READ_SECONDS
 * (first-try.ts) never counts for the level either. A stretch must also be in a NEW question band: callers that have
 * the student's runs use countedTries (first-try.ts) before this.
 */
export const countsForLevel = (r: Row) => r.firstTry === true && r.score !== null && r.score !== undefined && !unreliableRun(r) && !rapidRead(r) && r.stretch !== true; // round 6: a Stretch (grade-level text) is practice — never in the level window

/**
 * The completion dates that count toward the weekly goal (round 5, first-try.ts goalRuns): ONE credit per article —
 * its first try OR its stretch (a counted or a practice stretch), whichever first scored 75%+ reliably and was not
 * read faster than RR_MIN_READ_SECONDS. A re-read never. Rows need studentId, articleId, firstTry, stretch, score,
 * completedAt, unreliable (and readSeconds for the read-time rule).
 */
export function goalDates(runs: readonly Row[]): Date[] {
  return goalRuns(runs, ENGINE.up).map((r) => toDate(r.completedAt));
}

/**
 * 📈 How many more strong reads (75%+, counted) would move the level up now: the level window (counted first tries
 * since the last level change, oldest first) plus k reads of 100% until levelDecision says +50. Pure. 1…4; null when
 * the student's `level` is already at or above RR_MAX (the top version).
 */
export function readsToMoveUp(windowScores: readonly number[]): number;
export function readsToMoveUp(windowScores: readonly number[], level: number, afterDrop?: boolean): number | null;
export function readsToMoveUp(windowScores: readonly number[], level?: number, afterDrop = false): number | null {
  // at / above the top version (RR_MAX) there is no higher article to move up to: no "+50" promise
  if (level !== undefined && Number(level) >= RR_MAX) return null;
  for (let k = 1; k <= 4; k++) if (levelDecision([...windowScores, ...Array<number>(k).fill(100)], { afterDrop, level: level ?? null }).delta > 0) return k;
  return 4;
}

/** Round 9: the level window and whether it follows an automatic drop (for readsToMoveUp). */
export async function levelWindowState(repo: Repo, studentId: string): Promise<{ scores: number[]; afterDrop: boolean }> {
  const changes = await levelChanges(repo, studentId);
  return { scores: await levelWindow(repo, studentId, changes), afterDrop: afterAutoDrop(changes) };
}

/** The student's level window: the scores of the counted first tries since the last level change (oldest first). */
export async function levelWindow(repo: Repo, studentId: string, known?: Row[]): Promise<number[]> {
  const changes = known ?? await levelChanges(repo, studentId);
  const since = changes.length ? toDate(changes[changes.length - 1].createdAt).getTime() : -Infinity;
  return countedTries(await repo.findMany("RRRun", { studentId, firstTry: true, score: { not: null } }, { select: ["studentId", "articleId", "band", "firstTry", "stretch", "score", "completedAt", "unreliable", "readSeconds"] }))
    .filter((r) => r.completedAt && toDate(r.completedAt).getTime() > since && countsForLevel(r))
    .sort((a, b) => toDate(a.completedAt).getTime() - toDate(b.completedAt).getTime())
    .map((r) => Number(r.score));
}

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
  // round 6 (Achieve3000-like): a Stretch is a grade-level practice text — it never moves the level
  if (run.stretch === true) { const lv = Number((await ensureRRStudent(repo, studentId, now)).level); return { levelBefore: lv, levelAfter: lv, reason: null }; }
  for (let attempt = 0; ; attempt++) {
    const rr = await ensureRRStudent(repo, studentId, now);
    const before = Number(rr.level);
    const articlesDoneBefore = Number(rr.articlesDone ?? 0);
    const changes = await levelChanges(repo, studentId);
    const since = changes.length ? toDate(changes[changes.length - 1].createdAt).getTime() : -Infinity;
    // only counted first tries (a same-band stretch without a stretch set reuses its questions: practice, never counted)
    const runs = countedTries(await repo.findMany("RRRun", { studentId, firstTry: true, score: { not: null } }))
      .filter((r) => r.completedAt && toDate(r.completedAt).getTime() > since && countsForLevel(r))
      .sort((a, b) => toDate(a.completedAt).getTime() - toDate(b.completedAt).getTime());
    const dec = levelDecision(runs.map((r) => Number(r.score)), { afterDrop: afterAutoDrop(changes), probation: await onProbation(repo, studentId, changes), level: before }); // round 9 · 10 · 11
    // a stretch can only move the level up. r85 audit (#4 — checked, not a bug): this guard looks like it could
    // mask a legitimate down-adjustment, but `countsForLevel` above only lets a stretch run into `runs` when its
    // OWN score is ≥ ENGINE.up (75), and this function is only ever called for a stretch run when its score is
    // already ≥ 75 (student.ts) — so whenever `run.stretch === true` reaches this line, `dec.delta` can never be
    // negative in practice; the `< 0` branch is unreachable. Left in place as a documented safety net, not removed.
    // ↩️ round 11: after the teacher undid a drop, no automatic drop for the next NO_DROP_READS counted first tries
    const delta = (run.stretch === true || dropsPaused(changes, runs.length)) && dec.delta < 0 ? 0 : dec.delta;
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
    if (after !== before) await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: before, to: after, reason: `${after > before ? "Up" : AUTO_DOWN_PREFIX.trim()} ${Math.abs(after - before)}: ${dec.reason}`, now });
    return { levelBefore: before, levelAfter: after, reason: after !== before ? dec.reason : null };
  }
}

/**
 * 🛡️ Round 10: is the student in the probation after a placement / MAP check? — the last anchor change is followed
 * only by probation drops, and at most PROBATION_READS counted first tries were read since the anchor (this one included).
 */
export async function onProbation(repo: Repo, studentId: string, changes: readonly Row[]): Promise<boolean> {
  let i = changes.length - 1;
  while (i >= 0 && s(changes[i].reason).includes(PROBATION_TAG)) i--;
  if (i < 0 || !isAnchorChange(changes[i].reason)) return false;
  const since = toDate(changes[i].createdAt).getTime();
  const runs = countedTries(await repo.findMany("RRRun", { studentId, firstTry: true, score: { not: null } }, { select: ["studentId", "articleId", "band", "firstTry", "stretch", "score", "completedAt", "unreliable", "readSeconds"] }))
    .filter((r) => r.completedAt && toDate(r.completedAt).getTime() > since && countsForLevel(r));
  return runs.length >= 1 && runs.length <= PROBATION_READS;
}

/**
 * ↩️ Round 11 (Achieve3000: the teacher reviews a drop within a week and can keep the level): the teacher can undo the
 * last AUTOMATIC drop for UNDO_DROP_DAYS. After an undo no automatic drop happens until NO_DROP_READS more counted
 * first tries (Achieve3000: "ineligible … until eight multiple-choice sets are completed"); moving up still works.
 */
export const UNDO_DROP_TAG = "Teacher kept the level";
export const UNDO_DROP_DAYS = 7;
export const NO_DROP_READS = 8;
export interface UndoableDrop { from: number; to: number; at: string; reason: string }
/** The last automatic drop the teacher can still undo (pure): the newest level change, an automatic drop, at most
 * UNDO_DROP_DAYS old, and the level is still where the drop put it. */
export function undoableDrop(changes: readonly Row[], level: number | null, now: Date): UndoableDrop | null {
  const list = changes.filter((c) => !s(c.reason).startsWith(RETAKE_REASON)).slice().sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime());
  const last = list[list.length - 1];
  if (!last || !s(last.reason).startsWith(AUTO_DOWN_PREFIX)) return null;
  const at = toDate(last.createdAt);
  if (now.getTime() - at.getTime() > UNDO_DROP_DAYS * 86_400_000) return null;
  if (level === null || Number(level) !== Number(last.toLevel)) return null;
  return { from: Number(last.fromLevel), to: Number(last.toLevel), at: at.toISOString(), reason: s(last.reason) };
}
/** After an undo: no automatic drop until NO_DROP_READS counted first tries (pure). */
export const dropsPaused = (changes: readonly Row[], countedSince: number): boolean =>
  changes.length > 0 && s(changes[changes.length - 1].reason).startsWith(UNDO_DROP_TAG) && countedSince < NO_DROP_READS;

/** ↩️ The teacher undoes the last automatic drop (see undoableDrop). */
export async function undoLevelDrop(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<{ from: number; to: number }> {
  await assertStaffForStudent(repo, actor, studentId);
  const rr = await ensureRRStudent(repo, studentId, now);
  const drop = undoableDrop(await repo.findMany("RRLevelChange", { studentId }), Number(rr.level), now);
  if (!drop) throw new ValidationError(`There is no automatic drop from the last ${UNDO_DROP_DAYS} days to undo.`);
  const ok = await repo.updateMany("RRStudent", { studentId, level: rr.level }, { level: clampEngine(drop.from) });
  if (!ok) throw new ValidationError("The level changed in the meantime. Reload the page.");
  await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: drop.to, to: drop.from, reason: `${UNDO_DROP_TAG}: the teacher undid the automatic drop (${drop.to} → ${drop.from}); no automatic drop for the next ${NO_DROP_READS} articles`, now });
  return { from: drop.to, to: drop.from };
}

/** 👩‍🏫 A teacher (or school admin) sets a student's ReadRise Level (for the teacher pages). */
export async function setLevelByTeacher(repo: Repo, actor: Actor, studentId: string, level: number, reason = "", now = new Date()): Promise<{ from: number; to: number }> {
  await assertStaffForStudent(repo, actor, studentId);
  if (!Number.isFinite(level)) throw new ValidationError("Enter a ReadRise Level.");
  const to = clampEngine(level);
  const rr = await ensureRRStudent(repo, studentId, now);
  const from = Number(rr.level);
  // 🐛 round 4: a never-placed student (the working start: DEFAULT / MAP) — the teacher's level IS the start, so
  // growth starts here (before: startLevel stayed the working start → a fake "growth −350")
  const neverPlaced = s(rr.source) === "DEFAULT" || s(rr.source) === "MAP";
  await repo.updateMany("RRStudent", { studentId }, neverPlaced ? { level: to, source: "TEACHER", startLevel: to, placedAt: now } : { level: to, source: "TEACHER" });
  await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from, to, reason: `Teacher set the level${reason.trim() ? `: ${reason.trim()}` : ""}`, now });
  return { from, to };
}

// ------------------------------------------------------------------ weeks, goals, projection (pure)

/** The Riyadh calendar day (yyyy-mm-dd) of a moment — the same rule as analytics/practice.ts riyadhDay (that module
 * is not imported here: it would pull the whole analytics graph into the ReadRise engine). */
export const riyadhDay = (at: Date | string | number): string => new Date((typeof at === "number" ? at : toDate(at).getTime()) + RIYADH).toISOString().slice(0, 10);
/** A week's label (mm-dd of its Sunday, Riyadh time) from its start (weekStart). */
export const weekLabel = (start: number): string => riyadhDay(start).slice(5, 10);

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
 * days, and always on the ReadRise scale. Round 6: a level below 300 is real now (RR_FLOOR…RR_MAX).
 */
export async function readRiseProjection(repo: Repo, firstTry: Row[], points: LevelPoint[], schoolId: string, now: Date): Promise<number | null> {
  const at = firstTry.map((r) => (r.completedAt ? toDate(r.completedAt).getTime() : 0)).filter((t) => t > 0).sort((a, b) => a - b);
  if (at.length < PROJECTION_MIN_RUNS || at[at.length - 1] - at[0] < PROJECTION_MIN_DAYS * DAY) return null;
  const p = projectLevel(points, now, await yearEndFor(repo, schoolId, now));
  return p === null ? null : Math.min(RR_MAX, Math.max(RR_FLOOR, p));
}

/** One student's ReadRise numbers (null before the student ever opened ReadRise). */
export async function studentReadRiseSummary(repo: Repo, studentId: string, now = new Date()): Promise<ReadRiseSummary | null> {
  const rr = await repo.findUnique("RRStudent", { studentId });
  if (!rr) return null;
  // an Unreliable run (2+ rapid answers) counts for nothing: not the average, the goal or the projection
  const all = await repo.findMany("RRRun", { studentId, firstTry: true, score: { not: null } }, { select: ["studentId", "articleId", "band", "firstTry", "score", "stretch", "completedAt", "unreliable", "readSeconds"] });
  const runs = countedTries(all).filter((r) => !unreliableRun(r));
  // round 4: ONE article definition (first-try.ts articleRuns): a reliable, scored, non-stretch first try
  const main = articleRuns(all);
  const firstTryAvg = main.length ? Math.round(main.reduce((a, r) => a + Number(r.score), 0) / main.length) : null;
  const g = goalStats(goalDates(all), Number(rr.weeklyGoal), now);
  const { points } = await levelHistory(repo, studentId);
  const placed = readRisePlaced(rr, (await repo.count("RRPlacement", { studentId, completedAt: { not: null }, result: { not: null } })) > 0);
  return {
    level: Number(rr.level), startLevel: Number(rr.startLevel), source: s(rr.source), growth: Number(rr.level) - Number(rr.startLevel),
    articlesDone: main.length, firstTryAvg, weeklyGoal: g.goal, thisWeek: g.thisWeek, goalMet: g.met, streak: g.streak, weeksMet: g.weeksMet,
    projected: await readRiseProjection(repo, main, points, s(rr.schoolId), now), placed, runs: runs.length,
  };
}
