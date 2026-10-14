/**
 * ⚖️ The evidence behind a student's overall level (Update 39B — readiness I-9, I-10, I-14, I-15, P-3, P-11).
 *
 *   levelThetas      ONE ability (θ, 0 = grade level) from the student's own recent answers: every answer that was
 *                    not a rapid guess in the last 42 days, pooled over skills (EAP, 3PL with the item format's
 *                    guessing floor), recent answers counting more (half-life 14 days). It also compares the last
 *                    14 days with the 4 weeks before (the decline check).
 *   declining        a sustained decline needs BOTH tests (calibrated on the readiness simulation: either alone
 *                    flagged 10% of stable students; both together 1%, while catching traced student #2 in week 3):
 *                    isDeclining — the last 2 weeks ≥ 0.6 logits under the 4 weeks before (8+ answers on 3+ days
 *                    in each window, drop > 1.64 SE), and isTrendDeclining — three weekly windows each no higher than
 *                    the one before, first → last ≥ 0.4 logits. Both on a skill-mix-free scale (skillOffsets).
 *   fluencyEvidence  the median of the last 3 fluency checks; ONE check never adjusts a level (only notes it).
 *   diagnosticValid  a Diagnostic counts only while it is valid: under 30% rapid guesses and under 10 weeks old.
 *   nextLevelState   the hysteresis rule: a new level is taken only when (1) the evidence crosses the boundary by
 *                    the margin, (2) at least 12 answers were given since the last change (platform evidence), and
 *                    (3) it holds on 2 evaluations in a row or for 7+ days. A teacher's level wins in its window.
 *   refreshLevelStates  the daily job: evaluates every student, applies the rule, writes StudentLevelState and the
 *                    level history (AuditLog level.change, category OVERALL, with the evidence summary).
 */
import { idsKey, sharedRead } from "../lib/shared-read";
import type { Repo, Row } from "../seeding/repo";
import { estimateAbilityEAP, type EapCache } from "../../adaptive/irt";
import { scoringParams } from "../practice/scoring-params";
import type { Level } from "../insights/student-data";

const DAY = 86_400_000;
const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();

/** θ boundaries of the overall level (calibrated with the readiness simulation after the guessing floor). */
export const THETA_ABOVE = 0.9, THETA_BELOW = -0.6;
/** hysteresis: to move INTO a band the ability must pass its boundary by this much; to leave it, fall back by as much */
export const THETA_MARGIN = 0.15;
/** comprehension counts as borderline On Level under this θ (fluency may then tip it to Below) */
export const THETA_BORDERLINE = -0.35;
/** at least this many effective answers (not rapid guesses) behind a platform level */
export const LEVEL_MIN_ANSWERS = 10;
/** and this many since the last change before the platform may change it again */
export const LEVEL_MIN_NEW_ANSWERS = 12;
/** a new level must hold on this many evaluations in a row, or for this many days */
export const LEVEL_PERSIST_EVALS = 2, LEVEL_PERSIST_DAYS = 7;
export const THETA_WINDOW_DAYS = 42, THETA_HALF_LIFE_DAYS = 14, THETA_RECENT_DAYS = 14;
export const DECLINE_LOGITS = 0.6, DECLINE_MIN_ANSWERS = 8;
/** each window of a decline test needs answers on this many different days (not one test sitting) */
export const DECLINE_MIN_DAYS = 3, TREND_MIN_DAYS = 2;
/** the trend test: three 7-day windows, each no higher than the one before (± tolerance), first → last ≥ this drop */
export const TREND_DROP_LOGITS = 0.4, TREND_TOLERANCE = 0.1, TREND_WEEKS = 3;
/** a Diagnostic (or check) with this share of rapid guesses or more is invalid: re-test */
export const RAPID_INVALID_SHARE = 0.3;
/** a Diagnostic older than this no longer sets a level or a tier (about 10 school weeks) */
export const DIAGNOSTIC_VALID_DAYS = 70;
/** evidence weight of answers by source (rapid guesses are excluded before this) */
export const SOURCE_WEIGHT: Record<string, number> = { GAME: 0.5, REVIEW: 0.5, READMASTER: 0.5 };   // ReadMaster: no per-question time, so rapid guesses cannot be seen — half weight

export interface ThetaEstimate { theta: number; se: number; effN: number; /** distinct days with answers (a baseline from one sitting is fragile) */ days?: number }
export interface LevelTheta extends ThetaEstimate { answers: number; recent: ThetaEstimate | null; prior: ThetaEstimate | null; declining: boolean; drift: number | null; lastAt: number;
  /** the last 3 weeks, oldest first (null = too few answers that week) — the trend test */
  weeks?: (ThetaEstimate | null)[] }

export interface PooledAnswer { b: number; c: number; credit: number; weight: number }
/** EAP ability from pooled answers (pure). Prior N(0, 1): grade level. */
export function pooledTheta(list: PooledAnswer[], prior = { mean: 0, sd: 1 }, cache?: EapCache): ThetaEstimate {
  const effN = list.reduce((t, r) => t + r.weight, 0);
  if (!list.length) return { theta: prior.mean, se: prior.sd, effN: 0 };
  const e = estimateAbilityEAP(list.map((r) => ({ a: 1, b: r.b, c: r.c, credit: r.credit, weight: r.weight })), { priorMean: prior.mean, priorSD: prior.sd, thetaMin: -3, thetaMax: 3, model: 3, cache });
  return { theta: Math.round(e.theta * 100) / 100, se: Math.round(e.se * 100) / 100, effN: Math.round(effN * 10) / 10 };
}

/** Sustained decline (pure): recent vs prior window. */
export function isDeclining(recent: ThetaEstimate | null, prior: ThetaEstimate | null): boolean {
  if (!recent || !prior || recent.effN < DECLINE_MIN_ANSWERS || prior.effN < DECLINE_MIN_ANSWERS) return false;
  if ((recent.days ?? DECLINE_MIN_DAYS) < DECLINE_MIN_DAYS || (prior.days ?? DECLINE_MIN_DAYS) < DECLINE_MIN_DAYS) return false;
  const drop = prior.theta - recent.theta;
  // one-sided 95%: the drop is larger than 1.64 standard errors of the difference
  return drop >= DECLINE_LOGITS && drop >= 1.64 * Math.sqrt(recent.se ** 2 + prior.se ** 2);
}

/**
 * Sustained decline as a TREND (pure): the last three 7-day windows (oldest first) each with enough answers, each no
 * higher than the one before (within TREND_TOLERANCE), and the first → last drop ≥ TREND_DROP_LOGITS and larger
 * than 1.64 standard errors. Catches a steady slide (−0.25 logit a week) that the 2-weeks-vs-4-weeks step test sees
 * only late; an up-and-down student (good week / bad week) is never "declining" by it.
 */
export function isTrendDeclining(weeks: (ThetaEstimate | null)[]): boolean {
  if (weeks.length < TREND_WEEKS || weeks.some((w) => !w || w.effN < DECLINE_MIN_ANSWERS || (w.days ?? TREND_MIN_DAYS) < TREND_MIN_DAYS)) return false;
  const w = weeks as ThetaEstimate[];
  for (let i = 1; i < w.length; i++) if (w[i].theta > w[i - 1].theta + TREND_TOLERANCE) return false;
  const drop = w[0].theta - w[w.length - 1].theta;
  return drop >= TREND_DROP_LOGITS && drop >= 1.64 * Math.sqrt(w[0].se ** 2 + w[w.length - 1].se ** 2);
}

/**
 * Each skill's offset from the student's overall ability (pure): the skill's own θ (EAP with the prior at the overall
 * θ, SD 0.7 — a skill with few answers stays near 0) minus the overall θ.
 */
export function skillOffsets(list: (PooledAnswer & { skill: string })[], overall: number, cache?: EapCache): Map<string, number> {
  const by = new Map<string, PooledAnswer[]>();
  for (const x of list) { const l = by.get(x.skill); if (l) l.push(x); else by.set(x.skill, [x]); }
  const out = new Map<string, number>();
  for (const [k, l] of by) out.set(k, pooledTheta(l, { mean: overall, sd: 0.7 }, cache).theta - overall);
  return out;
}

/** The answer columns `levelThetas` reads (callers that preload the answers select at least these). */
export const LEVEL_THETA_COLUMNS = ["studentId", "questionId", "skillId", "isCorrect", "partialCredit", "difficultyB", "rapidGuess", "usedHint", "source", "createdAt", "unreliable"];

/**
 * Recent ability of these students from their answers (rapid guesses excluded; live-game and review answers count
 * half; hinted answers half). Bounded: one read of the last 42 days of answers.
 *
 * Options (Update 40, Data Health speed): `rows` = answers already loaded by the caller (any superset of the window
 * with LEVEL_THETA_COLUMNS; they are filtered to these students and the 42-day window here, so no second read);
 * `only: "theta"` = only the recency-weighted θ, its SE, effN, answers and lastAt (no recent/prior windows, no decline
 * or trend tests: `recent`/`prior` null, `declining` false, `drift` null) — for callers that need only the level.
 */
export async function levelThetas(repo: Repo, ids: string[], now = new Date(), opts: { rows?: Row[]; only?: "theta" } = {}): Promise<Map<string, LevelTheta>> {
  if (!ids.length) return new Map();
  // ⚡ asked again for the same students while a page is built: computed once (fresh after any write); callers get a copy
  if (!opts.rows) return new Map(await sharedRead(repo, `levelThetas|${opts.only ?? ""}|${Math.floor(now.getTime() / 60_000)}|${idsKey(ids)}`, ["QuestionAttempt", "QuestionOption", "Question"], 20_000, () => levelThetasUncached(repo, ids, now, opts)));
  return levelThetasUncached(repo, ids, now, opts);
}

async function levelThetasUncached(repo: Repo, ids: string[], now: Date, opts: { rows?: Row[]; only?: "theta" }): Promise<Map<string, LevelTheta>> {
  const out = new Map<string, LevelTheta>();
  const from = now.getTime() - THETA_WINDOW_DAYS * DAY;
  let rows: Row[];
  const tOf = new Map<Row, number>(); // each answer's time, parsed once
  if (opts.rows) { const want = new Set(ids); rows = opts.rows.filter((r) => { if (!want.has(s(r.studentId))) return false; const t = time(r.createdAt); tOf.set(r, t); return t >= from && t <= now.getTime(); }); }
  else rows = await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(from), lte: now } }, { select: LEVEL_THETA_COLUMNS });
  // r67: answers of an Unreliable session (> 20 % rapid guesses) never move the level either
  const valid = rows.filter((r) => !r.rapidGuess && !r.unreliable);
  const cache: EapCache = new Map(); // one item's grid logs are shared by every estimate of this call (same numbers)
  const params = await scoringParams(repo, valid.map((r) => s(r.questionId)));
  const by = new Map<string, Row[]>();
  for (const r of valid) { const k = s(r.studentId); const l = by.get(k); if (l) l.push(r); else by.set(k, [r]); }
  for (const [id, list] of by) {
    if (opts.only === "theta") {
      // the same numbers as below, without the windows the level does not need
      const all: PooledAnswer[] = [];
      let lastAt = 0;
      for (const r of list) {
        const t = tOf.get(r) ?? time(r.createdAt); lastAt = Math.max(lastAt, t);
        const p = params.get(s(r.questionId))!;
        const credit = r.partialCredit !== null && r.partialCredit !== undefined ? Number(r.partialCredit) : r.isCorrect ? 1 : 0;
        const w0 = (SOURCE_WEIGHT[s(r.source)] ?? 1) * (r.usedHint ? 0.5 : 1);
        all.push({ b: Number(r.difficultyB) || 0, c: p.c, credit, weight: w0 * Math.pow(0.5, (now.getTime() - t) / (THETA_HALF_LIFE_DAYS * DAY)) });
      }
      const th = pooledTheta(all, undefined, cache);
      const effN = list.reduce((n, r) => n + (SOURCE_WEIGHT[s(r.source)] ?? 1) * (r.usedHint ? 0.5 : 1), 0);
      out.set(id, { ...th, effN: Math.round(effN * 10) / 10, answers: list.length, recent: null, prior: null, declining: false, drift: null, lastAt });
      continue;
    }
    const all: PooledAnswer[] = [], recent: PooledAnswer[] = [], prior: PooledAnswer[] = [];
    const items: { a: PooledAnswer; t: number; skill: string }[] = [];
    let lastAt = 0;
    for (const r of list) {
      const t = tOf.get(r) ?? time(r.createdAt); lastAt = Math.max(lastAt, t);
      const p = params.get(s(r.questionId))!;
      const credit = r.partialCredit !== null && r.partialCredit !== undefined ? Number(r.partialCredit) : r.isCorrect ? 1 : 0;
      const w0 = (SOURCE_WEIGHT[s(r.source)] ?? 1) * (r.usedHint ? 0.5 : 1);
      const a = { b: Number(r.difficultyB) || 0, c: p.c, credit, weight: w0 };
      all.push({ ...a, weight: w0 * Math.pow(0.5, (now.getTime() - t) / (THETA_HALF_LIFE_DAYS * DAY)) });
      (t >= now.getTime() - THETA_RECENT_DAYS * DAY ? recent : prior).push(a);
      items.push({ a, t, skill: s(r.skillId) });
    }
    const th = pooledTheta(all, undefined, cache);
    const effN = list.reduce((n, r) => n + (SOURCE_WEIGHT[s(r.source)] ?? 1) * (r.usedHint ? 0.5 : 1), 0);
    const re = recent.length ? pooledTheta(recent, undefined, cache) : null, pr = prior.length ? pooledTheta(prior, undefined, cache) : null;
    // the decline tests compare windows on a SKILL-MIX-FREE scale: each skill's offset from the student's ability in
    // the EARLIER window (shrunk toward 0) is taken out of the item difficulty — otherwise a student simply sent to
    // practise a skill already known to be weak (e.g. Inference) looks "declining" (Update 39B, readiness sim #5).
    // Offsets come from the earlier window only, so a real slide (every skill falling) is not absorbed by them.
    const earlier = items.filter((x) => x.t < now.getTime() - THETA_RECENT_DAYS * DAY);
    const off = pr ? skillOffsets(earlier.map((x) => ({ ...x.a, skill: x.skill })), pr.theta, cache) : new Map<string, number>();
    const adj = (x: { a: PooledAnswer; skill: string }) => ({ ...x.a, b: x.a.b - (off.get(x.skill) ?? 0) });
    const rA = items.filter((x) => x.t >= now.getTime() - THETA_RECENT_DAYS * DAY).map(adj), pA = earlier.map(adj);
    const wk: PooledAnswer[][] = Array.from({ length: TREND_WEEKS }, () => []);
    for (const x of items) { const back = Math.floor((now.getTime() - x.t) / (7 * DAY)); if (back >= 0 && back < TREND_WEEKS) wk[TREND_WEEKS - 1 - back].push(adj(x)); }
    const dayN = (ts: number[]) => new Set(ts.map((t) => Math.floor(t / DAY))).size;
    const recentT = items.filter((x) => x.t >= now.getTime() - THETA_RECENT_DAYS * DAY).map((x) => x.t), wkT: number[][] = Array.from({ length: TREND_WEEKS }, () => []);
    for (const x of items) { const back = Math.floor((now.getTime() - x.t) / (7 * DAY)); if (back >= 0 && back < TREND_WEEKS) wkT[TREND_WEEKS - 1 - back].push(x.t); }
    const reA = rA.length ? { ...pooledTheta(rA, undefined, cache), days: dayN(recentT) } : null, prA = pA.length ? { ...pooledTheta(pA, undefined, cache), days: dayN(earlier.map((x) => x.t)) } : null;
    const weeks = wk.map((l, i) => (l.length ? { ...pooledTheta(l, undefined, cache), days: dayN(wkT[i]) } : null));
    out.set(id, { ...th, effN: Math.round(effN * 10) / 10, answers: list.length, recent: re, prior: pr, declining: isDeclining(reA, prA) && isTrendDeclining(weeks), drift: reA && prA ? Math.round((reA.theta - prA.theta) * 100) / 100 : null, lastAt, weeks });
  }
  return out;
}

/**
 * The θ the LEVEL uses (pure): the recency-weighted θ — or, while a sustained decline is detected, the last 2 weeks'
 * θ when it is lower (a falling student is not held up by older, better weeks: faster response, same hysteresis).
 */
export function levelThetaOf(th: LevelTheta): number {
  return th.declining && th.recent && th.recent.effN >= DECLINE_MIN_ANSWERS ? Math.min(th.theta, th.recent.theta) : th.theta;
}

/** The level a θ points to; with a current level, the band must be crossed by the margin (pure). */
export function levelForTheta(theta: number, current: Level | null = null): Level {
  const m = current ? THETA_MARGIN : 0;
  const up = THETA_ABOVE + (current === "ABOVE" ? -m : m), down = THETA_BELOW - (current === "BELOW" ? -m : m);
  if (theta >= up) return "ABOVE";
  if (theta <= down) return "BELOW";
  return "ON";
}

export interface FluencyPoint { percentile: number | null; wcpm: number; at: number; source: string }
export interface FluencySummary { percentile: number | null; wcpm: number; at: string; checks: number; usable: boolean }
/**
 * Fluency evidence (pure): the median of the last 3 checks of the last 12 months. `usable` (may adjust a level or a
 * tier) needs 2+ checks, or one check entered by the teacher (a benchmark read 1:1); one Fluency Coach score alone
 * is only noted.
 */
export function fluencySummary(points: FluencyPoint[]): FluencySummary | null {
  const list = points.filter((p) => p.percentile !== null).sort((a, b) => b.at - a.at).slice(0, 3);
  if (!list.length) return null;
  const ps = list.map((p) => p.percentile!).sort((a, b) => a - b);
  const ws = list.map((p) => p.wcpm).sort((a, b) => a - b);
  const mid = (v: number[]) => (v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2));
  return { percentile: mid(ps), wcpm: mid(ws), at: new Date(list[0].at).toISOString().slice(0, 10), checks: list.length, usable: list.length >= 2 || s(list[0].source) === "TEACHER" };
}
/** For the LEVEL only: two or more checks (a fluency adjustment of the comprehension level needs confirmation). */
export const fluencyAdjustsLevel = (f: FluencySummary | null) => Boolean(f && f.checks >= 2);

/** A Diagnostic result still counts (pure): enough real answers, recent enough. */
export function diagnosticValid(d: { rapid: number; total: number; at: number } | null, now: Date): { valid: boolean; why: string | null } {
  if (!d) return { valid: false, why: null };
  if (d.total > 0 && d.rapid / d.total >= RAPID_INVALID_SHARE) return { valid: false, why: `invalid: ${d.rapid} of ${d.total} answers were rapid guesses — re-test` };
  if (now.getTime() - d.at > DIAGNOSTIC_VALID_DAYS * DAY) return { valid: false, why: `older than ${Math.round(DIAGNOSTIC_VALID_DAYS / 7)} weeks` };
  return { valid: true, why: null };
}
export const isInvalidResult = (rapid: number, total: number) => total > 0 && rapid / total >= RAPID_INVALID_SHARE;

// ------------------------------------------------------------------ the hysteresis rule

export interface LevelStateLike { level: Level; source: string; since: number; pending: Level | null; pendingSince: number | null; pendingCount: number }
export interface RawLevel { level: Level; from: string; reason: string; newAnswers: number }
export interface StateStep { state: LevelStateLike; changed: boolean; held: string | null }

/**
 * One evaluation of the hysteresis rule (pure). `raw` is what the evidence says now (already with the θ margin
 * relative to the current level); `newAnswers` = effective answers since the current level was set.
 */
export function nextLevelState(cur: LevelStateLike | null, raw: RawLevel, now: Date): StateStep {
  const t = now.getTime();
  if (!cur) return { state: { level: raw.level, source: raw.from, since: t, pending: null, pendingSince: null, pendingCount: 0 }, changed: true, held: null };
  // the teacher's choice is authoritative in its window; a teacher-set level is taken at once
  if (raw.from === "TEACHER") return raw.level === cur.level && cur.source === "TEACHER" ? { state: { ...cur, pending: null, pendingSince: null, pendingCount: 0 }, changed: false, held: null } : { state: { level: raw.level, source: "TEACHER", since: t, pending: null, pendingSince: null, pendingCount: 0 }, changed: raw.level !== cur.level, held: null };
  if (raw.level === cur.level) return { state: { ...cur, source: cur.source === "NO_DATA" || cur.source === "SAVED" ? raw.from : cur.source, pending: null, pendingSince: null, pendingCount: 0 }, changed: false, held: null };
  // first real evidence after "no data yet" (or a saved level) is taken at once
  if (cur.source === "NO_DATA" || (cur.source === "SAVED" && raw.from !== "SAVED")) return { state: { level: raw.level, source: raw.from, since: t, pending: null, pendingSince: null, pendingCount: 0 }, changed: true, held: null };
  const pendingCount = cur.pending === raw.level ? cur.pendingCount + 1 : 1;
  const pendingSince = cur.pending === raw.level && cur.pendingSince ? cur.pendingSince : t;
  const enoughAnswers = raw.from !== "PLATFORM" || raw.newAnswers >= LEVEL_MIN_NEW_ANSWERS;
  const persisted = pendingCount >= LEVEL_PERSIST_EVALS || t - pendingSince >= LEVEL_PERSIST_DAYS * DAY;
  if (enoughAnswers && persisted) return { state: { level: raw.level, source: raw.from, since: t, pending: null, pendingSince: null, pendingCount: 0 }, changed: true, held: null };
  const held = !enoughAnswers ? `needs ${LEVEL_MIN_NEW_ANSWERS} answers since the last change (${Math.floor(raw.newAnswers)} so far)` : `waiting for a second evaluation to confirm (${pendingCount}/${LEVEL_PERSIST_EVALS})`;
  return { state: { ...cur, pending: raw.level, pendingSince, pendingCount }, changed: false, held };
}

const NAME: Record<Level, string> = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };
export const levelName = (l: Level) => NAME[l];

/**
 * The daily job: evaluates every enrolled student of the school, applies the hysteresis rule, writes
 * StudentLevelState and records each change in the level history (with the evidence). Returns the changes.
 */
const LEVEL_CHUNK = 50;
export async function refreshLevelStates(repo: Repo, schoolId: string, now = new Date()): Promise<{ students: number; changed: number; declining: number }> {
  const { rawEvidenceLevels } = await import("./evidence-level");
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "gradeId"] });
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const gradeOfClass = new Map(classes.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const byGrade = new Map<number, string[]>();
  for (const m of members) { const g = gradeOfClass.get(s(m.classId)) ?? 0; const l = byGrade.get(g) ?? []; if (!l.includes(s(m.studentId))) l.push(s(m.studentId)); byGrade.set(g, l); }
  let students = 0, changed = 0, declining = 0;
  for (const [grade, all] of byGrade) {
    if (!grade) continue;
    // 50 students per round (Update 42A: 300 at a time needed ~100 MB; every student is evaluated on their own)
    for (let i = 0; i < all.length; i += LEVEL_CHUNK) {
      const ids = all.slice(i, i + LEVEL_CHUNK);
      students += ids.length;
      const states = new Map((await repo.findMany("StudentLevelState", { studentId: { in: ids } })).map((r) => [s(r.studentId), r]));
      const thetas = await levelThetas(repo, ids, now);
      const raw = await rawEvidenceLevels(repo, schoolId, ids, grade, {}, now, { thetas, states });
      // answers since the current level was set (for the "12 new answers" rule)
      const sinceOf = (id: string) => { const st = states.get(id); return st ? time(st.since) : 0; };
      // bounded: at most the last 6 weeks are read (12 answers since an older change are then counted within them)
      const fresh = await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(Math.max(Math.min(...ids.map(sinceOf), now.getTime()), now.getTime() - THETA_WINDOW_DAYS * DAY)) }, rapidGuess: false, unreliable: false }, { select: ["studentId", "createdAt", "source", "usedHint"] });
      const newAnswers = new Map<string, number>();
      for (const a of fresh) if (time(a.createdAt) > sinceOf(s(a.studentId))) newAnswers.set(s(a.studentId), (newAnswers.get(s(a.studentId)) ?? 0) + (SOURCE_WEIGHT[s(a.source)] ?? 1) * (a.usedHint ? 0.5 : 1));
      for (const id of ids) {
        const e = raw.get(id); if (!e) continue;
        const row = states.get(id);
        const cur: LevelStateLike | null = row ? { level: s(row.level) as Level, source: s(row.source), since: time(row.since), pending: row.pending ? (s(row.pending) as Level) : null, pendingSince: row.pendingSince ? time(row.pendingSince) : null, pendingCount: Number(row.pendingCount ?? 0) } : null;
        const step = nextLevelState(cur, { level: e.level, from: e.from, reason: e.reason, newAnswers: newAnswers.get(id) ?? 0 }, now);
        const th = thetas.get(id) ?? null;
        if (th?.declining) declining++;
        const reason = (step.changed || !row ? e.reason : s(row.reason)).slice(0, 500);
        const data = {
          schoolId, level: step.state.level, source: step.state.source, reason, since: new Date(step.state.since),
          pending: step.state.pending, pendingSince: step.state.pendingSince ? new Date(step.state.pendingSince) : null, pendingCount: step.state.pendingCount,
          theta: th?.theta ?? null, thetaSE: th?.se ?? null, effN: th?.effN ?? 0, thetaRecent: th?.recent?.theta ?? null, thetaPrior: th?.prior?.theta ?? null, declining: Boolean(th?.declining), evaluatedAt: now,
        };
        await repo.upsert("StudentLevelState", { studentId: id }, { studentId: id, ...data }, data);
        if (step.changed) {
          changed++;
          await repo.create("AuditLog", {
            actorId: null, action: "level.change", entityType: "Student", entityId: id, before: cur ? { level: cur.level } : null,
            after: { level: step.state.level, source: "EVIDENCE", outcome: "CHANGED", category: "OVERALL", reason: e.reason, evidence: { from: e.from, theta: th?.theta ?? null, se: th?.se ?? null, answers: th?.effN ?? 0, newAnswers: Math.round(newAnswers.get(id) ?? 0), recentTheta: th?.recent?.theta ?? null, priorTheta: th?.prior?.theta ?? null, declining: Boolean(th?.declining), confirmedOn: cur?.pendingCount ? cur.pendingCount + 1 : 1 } },
            createdAt: now,
          });
        }
      }
    }
  }
  return { students, changed, declining };
}
