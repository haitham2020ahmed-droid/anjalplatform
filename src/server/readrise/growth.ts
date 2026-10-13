/**
 * 🚀 ReadRise growth evidence — PURE functions (no database): how sure we are of a level, accuracy by question
 * skill, the first-try trend, the end-of-year projection WITH an honest range, and the student's own growth story
 * in encouraging words. The loaders that feed them are in growth-report.ts.
 *
 * None of this changes how a level moves (that is engine.ts). The ReadRise Level is an estimate on a Lexile-like
 * scale — never called a Lexile.
 */
import { RR_SKILLS } from "./import";
import { RR_MAX, RR_MIN } from "./level";
import { ENGINE, PROJECTION_MIN_DAYS, PROJECTION_MIN_RUNS, projectLevel, weekStart, type LevelPoint } from "./engine";

const DAY = 86_400_000, WEEK = 7 * DAY;
const round10 = (x: number) => Math.round(x / 10) * 10;
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// ------------------------------------------------------------------ growth confidence

export interface ScoredReading { at: number; score: number }
export interface LevelChangeEvent { at: number; from: number; to: number; reason: string }
export type ConfidenceLabel = "NONE" | "EMERGING" | "CONFIRMED" | "STRONG" | "MIXED";
export interface GrowthConfidence {
  /** first-try readings that support the current level */
  readings: number;
  /** first-try readings at the current level that scored under 50% */
  against: number;
  label: ConfidenceLabel;
  /** when the current level started (ms) */
  since: number;
}

/**
 * How many first-try readings support the CURRENT level:
 *   · every counted first-try reading since the level was reached that scored 50%+ (the student coped at this level);
 *   · when the level was reached by an automatic move, the readings that caused it (75%+ for a move up, under 50%
 *     for a move down) — up to 4.
 * Readings under 50% since the level was reached count AGAINST it. Labels: 0 NONE · 1–2 EMERGING · 3–5 CONFIRMED ·
 * 6+ STRONG; MIXED when at least 2 readings disagree and they are more than a third of all the evidence.
 * `readings` = the counted first-try runs (engine.countsForLevel), any order.
 */
export function growthConfidence(readings: ScoredReading[], changes: LevelChangeEvent[], placedAt: number): GrowthConfidence {
  const later = changes.filter((c) => c.at > placedAt).sort((a, b) => a.at - b.at);
  const last = later[later.length - 1];
  const since = last ? last.at : placedAt;
  const after = readings.filter((r) => r.at > since);
  let support = after.filter((r) => r.score >= ENGINE.down).length;
  const against = after.length - support;
  if (last && /^(Up|Down) /.test(last.reason)) {
    const prevAt = later.length > 1 ? later[later.length - 2].at : placedAt;
    const win = readings.filter((r) => r.at > prevAt && r.at <= last.at);
    support += Math.min(4, win.filter((r) => (last.to > last.from ? r.score >= ENGINE.up : r.score < ENGINE.down)).length);
  }
  const label: ConfidenceLabel = against >= 2 && against * 2 > support ? "MIXED" : support === 0 ? "NONE" : support <= 2 ? "EMERGING" : support <= 5 ? "CONFIRMED" : "STRONG";
  return { readings: support, against, label, since };
}

/** The teacher's one-line reading of the confidence. */
export function confidenceText(c: GrowthConfidence): string {
  if (c.label === "MIXED") return `Mixed evidence: ${c.readings} reading${c.readings === 1 ? "" : "s"} support this level, ${c.against} scored under ${ENGINE.down}%`;
  if (c.readings === 0) return "Not confirmed yet: no first-try reading at this level";
  return `Level confirmed by ${c.readings} reading${c.readings === 1 ? "" : "s"}`;
}

// ------------------------------------------------------------------ skills

export interface SkillCell { correct: number; total: number; pct: number | null }
export const skillCell = (c: number, t: number): SkillCell => ({ correct: c, total: t, pct: t ? Math.round((100 * c) / t) : null });

/** A run's answers ({ "1": "B", … }) from JSON or an object. */
export function parseAnswers(v: unknown): Record<string, string> {
  let raw = v;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = {}; } }
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}

export interface AnsweredRun { articleId: string; band: string; answers: unknown; at?: number }
export type AnswerKey = Map<string, { answer: string; skill: string }>;
export const keyOf = (articleId: string, band: string, n: number | string) => `${articleId}|${band}|${n}`;

/** Each answer of the runs as { skill, ok } in run order. */
function answerList(runs: AnsweredRun[], key: AnswerKey): { skill: string; ok: boolean }[] {
  const out: { skill: string; ok: boolean }[] = [];
  for (const r of runs) {
    const a = parseAnswers(r.answers);
    for (let n = 1; n <= 8; n++) {
      const q = key.get(keyOf(r.articleId, r.band, n));
      if (q) out.push({ skill: q.skill, ok: String(a[String(n)] ?? "").toUpperCase() === q.answer });
    }
  }
  return out;
}

/** Accuracy by question skill (central idea, detail, inference, vocabulary, structure, cause/effect …), known skills first. */
export function skillBreakdown(runs: AnsweredRun[], key: AnswerKey): ({ skill: string } & SkillCell)[] {
  const m = new Map<string, [number, number]>();
  for (const a of answerList(runs, key)) { const c = m.get(a.skill) ?? [0, 0]; c[0] += a.ok ? 1 : 0; c[1]++; m.set(a.skill, c); }
  const order = [...RR_SKILLS as readonly string[], ...[...m.keys()].filter((k) => !(RR_SKILLS as readonly string[]).includes(k)).sort()];
  return order.filter((k) => m.has(k)).map((k) => ({ skill: k, ...skillCell(m.get(k)![0], m.get(k)![1]) }));
}

/**
 * Skills getting stronger: each skill's answers in time order, split into an earlier and a recent half; stronger
 * when the recent half is at least 10 points better and each half has 4+ answers. `runs` oldest first.
 */
export function strongerSkills(runs: AnsweredRun[], key: AnswerKey): { skill: string; early: number; recent: number }[] {
  const by = new Map<string, boolean[]>();
  for (const a of answerList(runs, key)) by.set(a.skill, [...(by.get(a.skill) ?? []), a.ok]);
  const out: { skill: string; early: number; recent: number }[] = [];
  for (const [skill, oks] of by) {
    const half = Math.floor(oks.length / 2);
    if (half < 4) continue;
    const pct = (xs: boolean[]) => Math.round((100 * xs.filter(Boolean).length) / xs.length);
    const early = pct(oks.slice(0, half)), recent = pct(oks.slice(oks.length - half));
    if (recent - early >= 10) out.push({ skill, early, recent });
  }
  return out.sort((a, b) => b.recent - b.early - (a.recent - a.early));
}

// ------------------------------------------------------------------ trend and usage

/** First-try score trend: the last 5 vs the 5 before (null when there are not enough). */
export function scoreTrend(scoresOldestFirst: number[]): { recentAvg: number | null; earlierAvg: number | null; delta: number | null } {
  const recent = scoresOldestFirst.slice(-5), earlier = scoresOldestFirst.slice(-10, -5);
  const ra = avg(recent), ea = earlier.length >= 3 ? avg(earlier) : null;
  return { recentAvg: ra, earlierAvg: ea, delta: ra !== null && ea !== null ? ra - ea : null };
}

/** Readings per school week (Sunday, Riyadh) for the last `weeks` weeks, oldest first. */
export function perWeek(times: number[], now: Date, weeks = 8): { starts: number[]; counts: number[] } {
  const cur = weekStart(now);
  const starts = Array.from({ length: weeks }, (_, i) => cur - (weeks - 1 - i) * WEEK);
  return { starts, counts: starts.map((w) => times.filter((t) => t >= w && t < w + WEEK).length) };
}

/** Stretch readings: tried, scored 75%+, success rate. */
export function stretchSuccess(stretchScores: number[]): { tried: number; succeeded: number; pct: number | null } {
  const ok = stretchScores.filter((x) => x >= ENGINE.up).length;
  return { tried: stretchScores.length, succeeded: ok, pct: stretchScores.length ? Math.round((100 * ok) / stretchScores.length) : null };
}

/** Where a level sits against the grade's expected range (TEACHER views only). */
export function gradePosition(level: number, band: { low: number; high: number }): "BELOW" | "WITHIN" | "ABOVE" {
  return level < band.low ? "BELOW" : level > band.high ? "ABOVE" : "WITHIN";
}

// ------------------------------------------------------------------ projection with a range

export interface ProjectionRange { mid: number; low: number; high: number; confidence: "HIGH" | "MEDIUM" | "LOW"; weeksLeft: number; readings: number }

/**
 * The end-of-year estimate with an honest range. The middle is the engine's projection (same rule as the summary:
 * at least PROJECTION_MIN_RUNS first-try readings over PROJECTION_MIN_DAYS days, else null). The half-width adds
 *   · the slope's uncertainty: 1.96 × its standard error (weekly levels of the last 8 weeks) × weeks left, and
 *   · the thin-evidence term: (50 + 250 / √readings) × min(1, weeks left / 20),
 * kept between 50 and 400 and rounded to 10. Confidence: HIGH ≤ 100 · MEDIUM ≤ 200 · LOW above.
 */
export function projectionRange(points: LevelPoint[], readingTimes: number[], now: Date, yearEnd: Date): ProjectionRange | null {
  const at = readingTimes.filter((t) => t > 0).sort((a, b) => a - b);
  if (at.length < PROJECTION_MIN_RUNS || at[at.length - 1] - at[0] < PROJECTION_MIN_DAYS * DAY) return null;
  const p = projectLevel(points, now, yearEnd);
  if (p === null) return null;
  const mid = Math.min(RR_MAX, Math.max(RR_MIN, p));
  // slope standard error from the same weekly samples projectLevel uses
  const xs: number[] = [], ys: number[] = [];
  for (let w = 8; w >= 0; w--) {
    const t = now.getTime() - w * WEEK;
    let v: number | null = null;
    for (const q of points) { if (q.at.getTime() <= t) v = q.level; else break; }
    if (v !== null) { xs.push(-w); ys.push(v); }
  }
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  const sse = ys.reduce((a, y, i) => a + (y - (my + slope * (xs[i] - mx))) ** 2, 0);
  const se = n > 2 && sxx ? Math.sqrt(sse / (n - 2) / sxx) : 0;
  const weeksLeft = Math.max(0, (yearEnd.getTime() - now.getTime()) / WEEK);
  const half = Math.min(400, Math.max(50, round10(1.96 * se * weeksLeft + (50 + 250 / Math.sqrt(at.length)) * Math.min(1, weeksLeft / 20))));
  const low = Math.max(RR_MIN, round10(mid - half)), high = Math.min(RR_MAX, round10(mid + half));
  return { mid, low: Math.min(low, mid), high: Math.max(high, mid), confidence: half <= 100 ? "HIGH" : half <= 200 ? "MEDIUM" : "LOW", weeksLeft: Math.round(weeksLeft), readings: at.length };
}

// ------------------------------------------------------------------ the student's own words

export interface StoryInput {
  level: number; startLevel: number; movesUp: number; streak: number; weeksMet: number; articles: number; words: number;
  stronger: string[]; stretchWins: number; scoreDelta: number | null;
}
/** One sentence of the story: English text with {placeholders} (translated with t) and its values. */
export interface StoryLine { icon: string; text: string; vars?: Record<string, string | number> }

/**
 * The student's growth story — ENCOURAGING words only: what grew, what got stronger, what they kept up. It never
 * names a grade range, Below / On / Above, tiers, or a level going down (a lower level is "articles that fit").
 */
export function storyLines(x: StoryInput): StoryLine[] {
  const out: StoryLine[] = [];
  if (x.articles === 0) return [{ icon: "🌱", text: "Read your first article to start your growth story." }];
  const growth = x.level - x.startLevel;
  if (growth > 0) out.push({ icon: "🚀", text: "Your level grew {n} points: from {from} to {to}.", vars: { n: growth, from: x.startLevel, to: x.level } });
  else out.push({ icon: "🌱", text: "You are building strong reading habits at level {level}.", vars: { level: x.level } });
  if (x.movesUp === 1) out.push({ icon: "⬆️", text: "You moved up a level once. Great work!" });
  else if (x.movesUp > 1) out.push({ icon: "⬆️", text: "You moved up {n} times.", vars: { n: x.movesUp } });
  if (x.streak > 1) out.push({ icon: "🔥", text: "You met your weekly goal {n} weeks in a row.", vars: { n: x.streak } });
  else if (x.weeksMet > 0) out.push({ icon: "🎯", text: "You met your weekly goal in {n} weeks.", vars: { n: x.weeksMet } });
  out.push({ icon: "📚", text: "You read {n} articles and {w} words.", vars: { n: x.articles, w: x.words.toLocaleString("en-US") } });
  if (x.stronger.length) out.push({ icon: "💪", text: "Getting stronger: {skills}.", vars: { skills: x.stronger.join(", ") } });
  if (x.stretchWins > 0) out.push({ icon: "🧗", text: "You scored 75% or more on {n} stretch articles.", vars: { n: x.stretchWins } });
  if (x.scoreDelta !== null && x.scoreDelta >= 5) out.push({ icon: "📈", text: "Your recent first-try scores went up {n} points.", vars: { n: x.scoreDelta } });
  return out;
}

/** Fills a story line's placeholders (for tests and plain-text use). */
export const fillLine = (l: StoryLine, t: (s: string, v?: Record<string, string | number>) => string = (s, v) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v && k in v ? String(v[k]) : m))) => t(l.text, l.vars);
