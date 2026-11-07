/**
 * 🏆 ReadRise points, achievements and the school scoreboard (round 6, owner: "like Achieve3000").
 *
 * Points are a SEPARATE counter from the platform's coins (motivation/coins.ts): nothing here writes CoinLedger or
 * pays a coin, so no reading is ever paid twice. Points are worked out on read from the student's RRRun rows (no new
 * table, no schema change) with a small per-student cache; the school scoreboard reads only the completed runs of the
 * current week, a few columns, cached 60 s with one request in flight per school.
 *
 * The rules (Achieve3000's):
 *   Respond   2 points per question right on the first try, 1 point right on the second try (RRRun.annotations
 *             .secondTry, when stored). Activity score bonus: 100% → 20, 88%+ → 15, 75%+ → 10. The first 100% ever
 *             → +10. Only a first try earns these (pointRuns / earnsActivityPoints — the ONE rule for the student's
 *             total, the school board and the reader's results): the article's earliest first try AND its earliest
 *             Stretch first try (owner, round 6: a Stretch always earns its points, but never counts for the level or
 *             the goal — first-try.ts countedTries).
 *   Polls     the before-reading (Ready) and after-reading (Reflect) polls: 5 points each, once a day each.
 *   Write     the teacher's writing score: 1–2 → 5, 3 → 10, 4 → 20; teacher badges (annotations.teacherBadges).
 *   Bonus     the 28 system achievements below (each once).
 *   Never     an Unreliable run (2+ rapid answers) or a run read too fast earns no points at all.
 */
import type { Repo, Row } from "../seeding/repo";
import { countedTries, earliestFirsts, goalRuns, isFirst, isStretchSetBand, isUnreliableRun, rapidRead, scoredRun, articleRuns, stretchRuns } from "./first-try";
import { riyadhDay, weekStart } from "./engine";
import { ANNUAL_GOAL } from "./benchmarks";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const RIYADH = 3 * 3_600_000;
const toMs = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return NaN;
  return v instanceof Date ? v.getTime() : new Date(s(v)).getTime();
};

// the yearly goal (40 activities, 75% first-try average) is the shared constant of benchmarks.ts
export { ANNUAL_GOAL };

/** The points table (the rules page lists these numbers). */
export const POINTS = {
  firstTryRight: 2,
  secondTryRight: 1,
  bonus100: 20,
  bonus88: 15,
  bonus75: 10,
  first100: 10,
  poll: 5,
} as const;

/** The teacher's writing score (0–4, the Grading Center) → points. */
export function writingPoints(score: unknown): number {
  const n = Number(score);
  if (score === null || score === undefined || !Number.isFinite(n) || n <= 0) return 0;
  return n >= 4 ? 20 : n >= 3 ? 10 : 5;
}
export const WRITING_POINTS: { score: string; points: number }[] = [{ score: "1–2", points: 5 }, { score: "3", points: 10 }, { score: "4", points: 20 }];

/** Teacher badges (given in the Grading Center, stored on the run's annotations.teacherBadges). */
export const TEACHER_BADGES: { code: string; name: string; points: number }[] = [
  { code: "word-wiz", name: "Word Wiz", points: 20 },
  { code: "text-to-text-connector", name: "Text-to-Text Connector", points: 20 },
  { code: "text-to-self-connector", name: "Text-to-Self Connector", points: 10 },
  { code: "predictor-victor", name: "Predictor Victor", points: 20 },
  { code: "inquiring-mind", name: "Inquiring Mind", points: 20 },
  { code: "questioner", name: "Questioner", points: 10 },
  { code: "strategic-reader", name: "Strategic Reader", points: 20 },
  { code: "summarizer", name: "Summarizer", points: 20 },
  { code: "purpose-setter", name: "Purpose Setter", points: 20 },
  { code: "literary-luminary", name: "Literary Luminary", points: 20 },
];
const slug = (x: unknown) => s(x).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const TEACHER_BADGE_OF = new Map(TEACHER_BADGES.map((b) => [b.code, b]));

/** The activity score bonus for a first-try score. */
export function scoreBonus(score: number): number {
  return score >= 100 ? POINTS.bonus100 : score >= 88 ? POINTS.bonus88 : score >= 75 ? POINTS.bonus75 : 0;
}

// ------------------------------------------------------------------ the run's extra data (agent R / the Grading Center)

function parse(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}
/** annotations is the highlights array in older rows; round 6 extras live on an object form or an array element. */
function extrasOf(annotations: unknown): { secondTry: unknown; teacherBadges: unknown } {
  const a = parse(annotations);
  if (Array.isArray(a)) {
    const out: { secondTry: unknown; teacherBadges: unknown } = { secondTry: null, teacherBadges: null };
    for (const x of a) if (x && typeof x === "object" && !Array.isArray(x)) {
      const o = x as Row;
      if (o.secondTry !== undefined && out.secondTry === null) out.secondTry = o.secondTry;
      if (o.teacherBadges !== undefined && out.teacherBadges === null) out.teacherBadges = o.teacherBadges;
    }
    return out;
  }
  if (a && typeof a === "object") { const o = a as Row; return { secondTry: o.secondTry ?? null, teacherBadges: o.teacherBadges ?? null }; }
  return { secondTry: null, teacherBadges: null };
}
const truthy = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";
/**
 * How many questions were right on the SECOND try. Accepted shapes of annotations.secondTry: [3, 5] (the questions
 * right on the second try), { right: [3, 5] }, { "3": true }, { "3": { correct: true } } (also ok / right).
 */
export function secondTryRight(annotations: unknown): number {
  const v = parse(extrasOf(annotations).secondTry);
  if (!v) return 0;
  const ok = (x: unknown): boolean => {
    if (typeof x === "number") return Number.isInteger(x);
    if (x && typeof x === "object") { const o = x as Row; return truthy(o.correct) || truthy(o.ok) || truthy(o.right); }
    return truthy(x);
  };
  if (Array.isArray(v)) return new Set(v.filter(ok).map((x) => (typeof x === "number" ? x : s((x as Row).n ?? (x as Row).number ?? (x as Row).q ?? JSON.stringify(x))))).size;
  if (typeof v === "object") {
    const o = v as Row;
    if (Array.isArray(o.right)) return new Set(o.right.map(String)).size;
    return Object.values(o).filter(ok).length;
  }
  return 0;
}
/** The teacher badges of a run (codes from TEACHER_BADGES), each once; entries may be codes, names or { code | name, at }. */
export function teacherBadgesOf(annotations: unknown): { code: string; at: number | null }[] {
  const v = parse(extrasOf(annotations).teacherBadges);
  if (!Array.isArray(v)) return [];
  const out = new Map<string, number | null>();
  for (const x of v) {
    const o = x && typeof x === "object" ? (x as Row) : null;
    const code = slug(o ? o.code ?? o.name ?? o.badge : x);
    if (!TEACHER_BADGE_OF.has(code) || out.has(code)) continue;
    const at = o ? toMs(o.at) : NaN;
    out.set(code, Number.isFinite(at) ? at : null);
  }
  return [...out].map(([code, at]) => ({ code, at }));
}

// ------------------------------------------------------------------ points of one run (pure)

export type PointKind = "QUESTIONS" | "SCORE_BONUS" | "FIRST_100" | "POLL_BEFORE" | "POLL_AFTER" | "WRITING" | "TEACHER_BADGE" | "ACHIEVEMENT";
export interface PointEvent { at: number; points: number; kind: PointKind; runId?: string; code?: string }

/** The number of questions on a run (its answers, else 8 — 4 for a stretch set). */
function questionCount(run: Row): number {
  if (typeof run.questionCount === "number" && run.questionCount > 0) return run.questionCount; // a slim row (slimRun)
  const a = parse(run.answers);
  const n = a && typeof a === "object" ? Object.keys(a as Row).length : 0;
  return n > 0 ? n : isStretchSetBand(run.band) ? 4 : 8;
}

/**
 * 🎯 THE points rule (owner, round 6) — one helper for the student's total, the school board and the reader's results:
 * a reliable, carefully read FIRST try earns its question points and score bonus — the article's first try and its
 * Stretch first try alike (a Stretch never counts for the level or the goal: first-try.ts countedTries). A re-read,
 * an Unreliable run or a run read too fast earns none.
 */
export const earnsActivityPoints = (r: Row): boolean => isFirst(r) && !isUnreliableRun(r) && !rapidRead(r);
/** The runs whose activity earns points: the earliest first try and the earliest Stretch first try per article. */
export function pointRuns<T extends Row>(runs: readonly T[]): Set<T> {
  return new Set(earliestFirsts(runs).filter(earnsActivityPoints));
}

/**
 * The points ONE run earns by itself (no daily poll cap, no "first 100%" and no achievements — those need the
 * student's history: studentPoints). `counted` = the run earns its activity points (default: earnsActivityPoints;
 * callers with the history pass pointRuns). An Unreliable or too-fast run earns nothing.
 */
export function pointsForRun(run: Row, opts: { counted?: boolean } = {}): PointEvent[] {
  if (isUnreliableRun(run) || rapidRead(run)) return [];
  const id = s(run.id) || undefined;
  const started = toMs(run.startedAt), done = toMs(run.completedAt);
  const at = Number.isFinite(done) ? done : started;
  if (!Number.isFinite(at)) return [];
  const out: PointEvent[] = [];
  if (run.prePoll !== null && run.prePoll !== undefined) out.push({ at: Number.isFinite(started) ? started : at, points: POINTS.poll, kind: "POLL_BEFORE", runId: id });
  if (run.postPoll !== null && run.postPoll !== undefined) out.push({ at, points: POINTS.poll, kind: "POLL_AFTER", runId: id });
  const counted = opts.counted ?? earnsActivityPoints(run);
  if (counted && scoredRun(run)) {
    const score = Math.max(0, Math.min(100, Number(run.score) || 0));
    const n = questionCount(run);
    const right = Math.min(n, Math.round((score * n) / 100));
    const second = Math.min(n - right, secondTryRight(run.annotations));
    const q = right * POINTS.firstTryRight + second * POINTS.secondTryRight;
    if (q > 0) out.push({ at: done, points: q, kind: "QUESTIONS", runId: id });
    const b = scoreBonus(score);
    if (b > 0) out.push({ at: done, points: b, kind: "SCORE_BONUS", runId: id });
  }
  const w = writingPoints(run.writingScore);
  if (w > 0) out.push({ at, points: w, kind: "WRITING", runId: id });
  for (const tb of teacherBadgesOf(run.annotations)) out.push({ at: tb.at ?? at, points: TEACHER_BADGE_OF.get(tb.code)!.points, kind: "TEACHER_BADGE", runId: id, code: tb.code });
  return out;
}

/** The polls pay once a day each (the before poll and the after poll, Riyadh day). Keeps the other events. */
export function capPolls(events: readonly PointEvent[]): PointEvent[] {
  const seen = new Set<string>();
  return [...events].sort((a, b) => a.at - b.at).filter((e) => {
    if (e.kind !== "POLL_BEFORE" && e.kind !== "POLL_AFTER") return true;
    const k = `${e.kind}|${riyadhDay(e.at)}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ------------------------------------------------------------------ the 28 achievements

export type AchievementMetric = "perfect" | "strong" | "pairs" | "level" | "dailyTop" | "weeklyTop" | "articles" | "stretches" | "writings" | "words" | "goalWeeks" | "streak" | "annual" | "levelUps";
export interface AchievementDef { code: string; name: string; description: string; points: number; metric: AchievementMetric; target: number }

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: "activity-rookie", name: "Activity Rookie", description: "Score 100% on an activity for the third time.", points: 20, metric: "perfect", target: 3 },
  { code: "activity-wiz", name: "Activity Wiz", description: "Score 100% on 5 activities.", points: 30, metric: "perfect", target: 5 },
  { code: "guru-of-understanding", name: "Guru of Understanding", description: "Score 100% on 20 activities.", points: 50, metric: "perfect", target: 20 },
  { code: "sage", name: "Sage", description: "Score 100% on 40 activities.", points: 100, metric: "perfect", target: 40 },
  { code: "activity-pro", name: "Activity Pro", description: "Score 75% or more on 20 activities.", points: 30, metric: "strong", target: 20 },
  { code: "activity-expert", name: "Activity Expert", description: "Score 75% or more on 40 activities.", points: 50, metric: "strong", target: 40 },
  { code: "commentator", name: "Commentator", description: "Answer the before and after polls of an article.", points: 10, metric: "pairs", target: 1 },
  { code: "debater", name: "Debater", description: "Answer the before and after polls of 20 articles.", points: 20, metric: "pairs", target: 20 },
  { code: "opinionator", name: "Opinionator", description: "Answer the before and after polls of 40 articles.", points: 30, metric: "pairs", target: 40 },
  { code: "level-achiever", name: "Level Achiever", description: "Grow 35 levels above your start-of-year reading check, or reach level 1210.", points: 20, metric: "level", target: 1 },
  { code: "daily-top-scorer", name: "School Daily Top Scorer", description: "Earn the most points in your school in one day.", points: 25, metric: "dailyTop", target: 1 },
  { code: "weekly-top-scorer", name: "School Weekly Top Scorer", description: "Earn the most points in your school in one week.", points: 50, metric: "weeklyTop", target: 1 },
  { code: "first-article", name: "First Article", description: "Finish your first article.", points: 10, metric: "articles", target: 1 },
  { code: "reader-10", name: "Busy Reader", description: "Finish 10 articles.", points: 20, metric: "articles", target: 10 },
  { code: "reader-25", name: "Keen Reader", description: "Finish 25 articles.", points: 30, metric: "articles", target: 25 },
  { code: "reader-50", name: "Super Reader", description: "Finish 50 articles.", points: 50, metric: "articles", target: 50 },
  { code: "first-stretch", name: "First Stretch", description: "Finish your first stretch reading.", points: 10, metric: "stretches", target: 1 },
  { code: "stretch-10", name: "Stretch Star", description: "Finish 10 stretch readings.", points: 30, metric: "stretches", target: 10 },
  { code: "first-writing", name: "First Writing", description: "Send your first thought question answer.", points: 10, metric: "writings", target: 1 },
  { code: "writer-10", name: "Steady Writer", description: "Send 10 thought question answers.", points: 30, metric: "writings", target: 10 },
  { code: "words-25", name: "Word Collector", description: "Save 25 words to My Words.", points: 10, metric: "words", target: 25 },
  { code: "words-100", name: "Word Master", description: "Save 100 words to My Words.", points: 30, metric: "words", target: 100 },
  { code: "goal-4", name: "Goal Getter", description: "Meet your weekly goal in 4 weeks.", points: 20, metric: "goalWeeks", target: 4 },
  { code: "goal-10", name: "Goal Champion", description: "Meet your weekly goal in 10 weeks.", points: 50, metric: "goalWeeks", target: 10 },
  { code: "streak-3", name: "Three Days in a Row", description: "Finish an activity 3 days in a row.", points: 10, metric: "streak", target: 3 },
  { code: "streak-7", name: "Seven Days in a Row", description: "Finish an activity 7 days in a row.", points: 20, metric: "streak", target: 7 },
  { code: "annual-goal", name: "Annual Goal", description: "Score 75% or more on 40 activities this school year.", points: 100, metric: "annual", target: 1 },
  { code: "level-up", name: "Level Up", description: "Move up your reading level for the first time.", points: 10, metric: "levelUps", target: 1 },
];
export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length; // 28

export interface EarnedAchievement { code: string; name: string; description: string; points: number; at: string }

/** The dated facts the achievements are read from (each list sorted, ms). */
export interface AchievementFacts {
  perfect: number[]; strong: number[]; pairs: number[]; articles: number[]; stretches: number[]; writings: number[];
  words: number[]; goalWeeks: number[]; levelUps: number[]; activeDays: number[];
  /** the moment the level first reached the Level Achiever mark, or null */
  levelAt: number | null; annualAt: number | null;
  dailyTop: number[]; weeklyTop: number[];
}

/** The day a run of `k` consecutive Riyadh days was first reached, from the active days' moments. */
export function streakReachedAt(moments: readonly number[], k: number): number | null {
  const days = [...new Set(moments.map((m) => riyadhDay(m)))].sort();
  let run = 0, prev = "";
  for (const d of days) {
    run = prev && Date.parse(`${d}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`) === DAY ? run + 1 : 1;
    prev = d;
    if (run >= k) return Date.parse(`${d}T12:00:00Z`) - RIYADH;
  }
  return null;
}

/** Which achievements are earned, and when (pure). */
export function achievementsFrom(f: AchievementFacts): EarnedAchievement[] {
  const kth = (xs: readonly number[], k: number) => { const a = [...xs].sort((x, y) => x - y); return a.length >= k ? a[k - 1] : null; };
  const out: EarnedAchievement[] = [];
  for (const a of ACHIEVEMENTS) {
    let at: number | null = null;
    switch (a.metric) {
      case "level": at = f.levelAt; break;
      case "annual": at = f.annualAt; break;
      case "streak": at = streakReachedAt(f.activeDays, a.target); break;
      default: at = kth(f[a.metric], a.target);
    }
    if (at !== null && Number.isFinite(at)) out.push({ code: a.code, name: a.name, description: a.description, points: a.points, at: new Date(at).toISOString() });
  }
  return out;
}

// ------------------------------------------------------------------ one student

const RUN_COLUMNS = ["id", "studentId", "articleId", "band", "step", "firstTry", "stretch", "score", "prePoll", "postPoll", "writing", "writingScore", "answers", "annotations", "levelBefore", "levelAfter", "unreliable", "readSeconds", "startedAt", "completedAt"] as const;

/**
 * A run row cut down to what the points read (never kept with its big fields): annotations → { secondTry,
 * teacherBadges } only (no highlights, notes or drafts), answers → their count, writing → "1" when sent.
 */
export function slimRun(r: Row): Row {
  const { annotations, answers, writing, ...rest } = r;
  const ex = extrasOf(annotations);
  const a = parse(answers);
  const n = a && typeof a === "object" ? Object.keys(a as Row).length : 0;
  const out: Row = { ...rest, annotations: { secondTry: ex.secondTry ?? undefined, teacherBadges: ex.teacherBadges ?? undefined }, questionCount: n };
  if (writing !== undefined) out.writing = s(writing).trim() ? "1" : null;
  return out;
}
/** A thought-question answer was sent: RRRun.writing is set (or the teacher scored it). */
const wroteRun = (r: Row): boolean => s(r.writing).trim().length > 0 || (r.writingScore !== null && r.writingScore !== undefined);
export const TOP_SCORERS_KEY = "readrise.topScorers";
export const LEVEL_ACHIEVER = { growth: 35, level: 1210 } as const;

export interface StudentPoints {
  total: number;
  events: PointEvent[];
  achievements: EarnedAchievement[];
}

/** What is cached per student: the events, the achievements and the year's goal numbers — never the run rows. */
interface Computed { events: PointEvent[]; achievements: EarnedAchievement[]; year: { done: number; avg: number | null } }
const studentCache = new WeakMap<object, Map<string, { at: number; p: Promise<Computed> }>>();
const STUDENT_TTL = 60_000, STUDENT_CACHE_MAX = 300;
const cacheKey = (studentId: string, yearStartMs: number | null) => `${studentId}|${yearStartMs ?? ""}`;

/** Forget one student's cached points (e.g. right after they finish an activity) — every school-year key. */
export function forgetStudentPoints(repo: Repo, studentId: string): void {
  const m = studentCache.get(repo);
  if (!m) return;
  const prefix = `${studentId}|`;
  for (const k of [...m.keys()]) if (k.startsWith(prefix)) m.delete(k);
}
/** (tests) how many entries the student points cache holds for this repo */
export function studentCacheSize(repo: Repo): number { return studentCache.get(repo)?.size ?? 0; }

/** The school year's counted, scored, reliable first tries: how many at 75%+ and their average (the annual goal). */
function yearGoal(runs: readonly Row[], yearStartMs: number | null): { done: number; avg: number | null } {
  const counted = new Set(countedTries(runs));
  const y0 = yearStartMs ?? -Infinity;
  const year = runs.filter((r) => counted.has(r) && scoredRun(r) && !isUnreliableRun(r) && !rapidRead(r) && toMs(r.completedAt) >= y0);
  return { done: year.filter((r) => Number(r.score) >= ANNUAL_GOAL.avg).length, avg: year.length ? Math.round(year.reduce((a, r) => a + Number(r.score), 0) / year.length) : null };
}

async function computeStudent(repo: Repo, studentId: string, yearStartMs: number | null): Promise<Computed> {
  const st = await repo.findUnique("Student", { id: studentId });
  const schoolId = st ? s(st.schoolId) : "";
  const [runs, rr, placements, words, top] = await Promise.all([
    repo.findMany("RRRun", { studentId }, { select: RUN_COLUMNS, take: 3000 }).then((rs) => rs.map(slimRun)),
    repo.findUnique("RRStudent", { studentId }),
    repo.findMany("RRPlacement", { studentId, completedAt: { not: null }, result: { not: null } }, { select: ["result", "period", "completedAt"], take: 50 }),
    repo.findMany("StudentWord", { studentId }, { select: ["firstAt"], orderBy: [{ field: "firstAt", dir: "asc" }], take: 100 }),
    schoolId ? repo.findUnique("SchoolSetting", { schoolId, key: TOP_SCORERS_KEY }) : Promise.resolve(null),
  ]);
  return { ...studentPointsFrom({ studentId, runs, rr, placements, words: words.map((w) => toMs(w.firstAt)), topScorers: top?.value, yearStartMs }), year: yearGoal(runs, yearStartMs) };
}

/** The pure part of studentPoints (tests use it directly). */
export function studentPointsFrom(i: { studentId: string; runs: readonly Row[]; rr?: Row | null; placements?: readonly Row[]; words?: readonly number[]; topScorers?: unknown; yearStartMs?: number | null }): { events: PointEvent[]; achievements: EarnedAchievement[] } {
  const runs = earliestFirsts(i.runs);
  const counted = new Set(countedTries(runs));
  const paid = pointRuns(runs);
  const reliable = (r: Row) => !isUnreliableRun(r) && !rapidRead(r);
  // per-run points (the ONE points rule: pointRuns — a Stretch first try too), polls once a day each
  let events: PointEvent[] = capPolls(runs.flatMap((r) => pointsForRun(r, { counted: paid.has(r) })));
  // the score facts: counted, scored, reliable first tries
  const scored = runs.filter((r) => counted.has(r) && scoredRun(r) && reliable(r)).sort((a, b) => toMs(a.completedAt) - toMs(b.completedAt));
  const perfect = scored.filter((r) => Number(r.score) >= 100).map((r) => toMs(r.completedAt));
  if (perfect.length) events.push({ at: perfect[0], points: POINTS.first100, kind: "FIRST_100" });
  const strong = scored.filter((r) => Number(r.score) >= 75).map((r) => toMs(r.completedAt));
  // the Level Achiever: 35 above the year's start-of-year check (else the earliest check of the year, else the start level), or 1210
  const ys = i.yearStartMs ?? null;
  const pl = [...(i.placements ?? [])].filter((p) => ys === null || toMs(p.completedAt) >= ys).sort((a, b) => toMs(a.completedAt) - toMs(b.completedAt));
  const pre = (pl.find((p) => s(p.period) === "BOY") ?? pl[0])?.result ?? i.rr?.startLevel;
  const preLevel = pre === null || pre === undefined || !Number.isFinite(Number(pre)) ? null : Number(pre);
  const levelHit = scored.find((r) => { const l = Number(r.levelAfter); return Number.isFinite(l) && r.levelAfter !== null && (l >= LEVEL_ACHIEVER.level || (preLevel !== null && l >= preLevel + LEVEL_ACHIEVER.growth)); });
  // the weekly goal: the run that met each week's goal
  const goal = Math.max(1, Number(i.rr?.weeklyGoal) || 2);
  const perWeek = new Map<number, number[]>();
  for (const r of goalRuns(runs)) { const t = toMs(r.completedAt); const w = weekStart(new Date(t)); perWeek.set(w, [...(perWeek.get(w) ?? []), t]); }
  const goalWeeks = [...perWeek.values()].filter((ts) => ts.length >= goal).map((ts) => ts.sort((a, b) => a - b)[goal - 1]);
  // the annual goal: the 40th activity at 75%+ this school year
  const yearStrong = strong.filter((t) => ys === null || t >= ys);
  const top = parse(i.topScorers) as { day?: Record<string, string>; week?: Record<string, string> } | null;
  const wins = (o: Record<string, string> | undefined, len: number) => Object.entries(o ?? {}).filter(([, sid]) => sid === i.studentId).map(([d]) => Date.parse(`${d}T00:00:00Z`) - RIYADH + len);
  const facts: AchievementFacts = {
    perfect, strong,
    pairs: runs.filter((r) => reliable(r) && r.prePoll !== null && r.prePoll !== undefined && r.postPoll !== null && r.postPoll !== undefined).map((r) => toMs(r.completedAt ?? r.startedAt)).filter(Number.isFinite),
    articles: articleRuns(runs).map((r) => toMs(r.completedAt)),
    stretches: stretchRuns(runs).filter(reliable).map((r) => toMs(r.completedAt)),
    // a writing = a SENT thought-question answer (RRRun.writing) or one the teacher scored — never just a finished step
    writings: runs.filter((r) => reliable(r) && wroteRun(r)).map((r) => toMs(r.completedAt)).filter(Number.isFinite),
    words: [...(i.words ?? [])].filter(Number.isFinite),
    goalWeeks,
    levelUps: scored.filter((r) => r.levelAfter !== null && r.levelAfter !== undefined && Number(r.levelAfter) > Number(r.levelBefore)).map((r) => toMs(r.completedAt)),
    activeDays: runs.filter((r) => scoredRun(r) && reliable(r)).map((r) => toMs(r.completedAt)),
    levelAt: levelHit ? toMs(levelHit.completedAt) : null,
    annualAt: yearStrong.length >= ANNUAL_GOAL.activities ? yearStrong[ANNUAL_GOAL.activities - 1] : null,
    dailyTop: wins(top?.day, DAY - 1),
    weeklyTop: wins(top?.week, 7 * DAY - 1),
  };
  const achievements = achievementsFrom(facts);
  for (const a of achievements) events.push({ at: Date.parse(a.at), points: a.points, kind: "ACHIEVEMENT", code: a.code });
  events = events.filter((e) => Number.isFinite(e.at)).sort((a, b) => a.at - b.at);
  return { events, achievements };
}

async function cachedStudent(repo: Repo, studentId: string, yearStartMs: number | null, now = Date.now()): Promise<Computed> {
  let m = studentCache.get(repo);
  if (!m) studentCache.set(repo, (m = new Map()));
  const key = cacheKey(studentId, yearStartMs);
  const hit = m.get(key);
  if (hit && now - hit.at < STUDENT_TTL && now >= hit.at) return hit.p;
  // evict the expired entries (and the oldest beyond the cap)
  for (const [k, v] of m) if (now - v.at >= STUDENT_TTL || now < v.at) m.delete(k);
  const p = computeStudent(repo, studentId, yearStartMs);
  m.set(key, { at: now, p });
  p.catch(() => m!.delete(key));
  while (m.size > STUDENT_CACHE_MAX) m.delete(m.keys().next().value as string);
  return p;
}

/**
 * A student's ReadRise points between `from` and `to` (default: all time) — the events (with the achievement
 * bonuses) and every achievement earned. `opts.yearStart` = the school year's first day (the Level Achiever's
 * start-of-year check and the Annual Goal).
 */
export async function studentPoints(repo: Repo, studentId: string, from?: Date | null, to?: Date | null, opts: { yearStart?: Date | null } = {}): Promise<StudentPoints> {
  const c = await cachedStudent(repo, studentId, opts.yearStart ? opts.yearStart.getTime() : null);
  const lo = from ? from.getTime() : -Infinity, hi = to ? to.getTime() : Infinity;
  const events = c.events.filter((e) => e.at >= lo && e.at < hi);
  return { total: events.reduce((a, e) => a + e.points, 0), events, achievements: c.achievements };
}

// ------------------------------------------------------------------ the school scoreboard (bounded, cached 60 s)

/** "A.K." from a display name — students are shown by initials only. */
export function initials(name: unknown): string {
  const all = s(name).trim().split(/\s+/).filter(Boolean);
  const words = all.filter((x) => /^\p{L}/u.test(x));
  const w = words.length ? words : all;
  if (!w.length) return "?";
  const first = w[0].charAt(0).toUpperCase(), last = w.length > 1 ? w[w.length - 1].charAt(0).toUpperCase() : "";
  return `${first}.${last ? `${last}.` : ""}`;
}
const surname = (name: unknown) => { const w = s(name).trim().split(/\s+/).filter(Boolean); return w.length ? w[w.length - 1] : ""; };

export interface TopStudent { initials: string; grade: number | null; points: number }
export interface TopClass { classId: string; name: string; teacher: string; points: number }
export interface SchoolBoard { classesWeek: TopClass[]; dailyTop: TopStudent | null; weeklyTop: TopStudent | null; at: string }

/** Each student's points from a set of runs (per-run points, polls once a day each; no history bonuses). */
export function pointsByStudent(runs: readonly Row[], from: number, to = Infinity): Map<string, number> {
  const by = new Map<string, Row[]>();
  for (const r of earliestFirsts(runs)) { const k = s(r.studentId); const xs = by.get(k); if (xs) xs.push(r); else by.set(k, [r]); }
  const out = new Map<string, number>();
  for (const [sid, rs] of by) {
    const paid = pointRuns(rs); // the ONE points rule (the student's total uses it too)
    const pts = capPolls(rs.flatMap((r) => pointsForRun(r, { counted: paid.has(r) }))).filter((e) => e.at >= from && e.at < to).reduce((a, e) => a + e.points, 0);
    if (pts > 0) out.set(sid, pts);
  }
  return out;
}
/** The highest scorer (ties: the smaller id, stable), or null. */
export function topOf(m: ReadonlyMap<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [k, v] of m) if (v > 0 && (!best || v > best[1] || (v === best[1] && k < best[0]))) best = [k, v];
  return best;
}

const dayStartMs = (t: number) => Date.parse(`${riyadhDay(t)}T00:00:00Z`) - RIYADH;
const BOARD_COLUMNS = ["id", "studentId", "articleId", "band", "firstTry", "stretch", "score", "prePoll", "postPoll", "writingScore", "answers", "annotations", "unreliable", "readSeconds", "startedAt", "completedAt"] as const;
const BOARD_TAKE = 4000;
const boardCache = new WeakMap<object, Map<string, { at: number; p: Promise<SchoolBoard> }>>();
const BOARD_TTL = 60_000;

async function weekRuns(repo: Repo, schoolId: string, from: number, to: number): Promise<Row[]> {
  // only the small fields are kept: annotations → { secondTry, teacherBadges }, answers → their count (slimRun)
  const rows = await repo.findMany("RRRun", { schoolId, completedAt: { gte: new Date(from), lt: new Date(to) } }, { select: BOARD_COLUMNS, take: BOARD_TAKE });
  return rows.map(slimRun);
}

async function topStudent(repo: Repo, pick: [string, number] | null): Promise<TopStudent | null> {
  if (!pick) return null;
  const st = await repo.findUnique("Student", { id: pick[0] });
  if (!st) return null;
  const [u, g] = await Promise.all([repo.findUnique("User", { id: s(st.userId) }), repo.findUnique("Grade", { id: s(st.gradeId) })]);
  return { initials: initials(u?.displayName), grade: g && Number.isFinite(Number(g.level)) ? Number(g.level) : null, points: pick[1] };
}

/** Remember yesterday's and last week's top scorers (their achievements) — once each, bounded history. */
async function recordWinners(repo: Repo, schoolId: string, now: number, runsSinceYesterday: Row[]): Promise<void> {
  const row = await repo.findUnique("SchoolSetting", { schoolId, key: TOP_SCORERS_KEY });
  const v = (parse(row?.value) ?? {}) as { day?: Record<string, string>; week?: Record<string, string> };
  const day = { ...(v.day ?? {}) }, week = { ...(v.week ?? {}) };
  const today = dayStartMs(now), yesterday = today - DAY, thisWeek = weekStart(new Date(now)), lastWeek = thisWeek - 7 * DAY;
  const yKey = riyadhDay(yesterday), wKey = riyadhDay(lastWeek);
  let changed = false;
  if (!(yKey in day)) {
    const w = topOf(pointsByStudent(runsSinceYesterday, yesterday, today));
    day[yKey] = w ? w[0] : ""; changed = true;
  }
  if (!(wKey in week)) {
    const w = topOf(pointsByStudent(await weekRuns(repo, schoolId, lastWeek, thisWeek), lastWeek, thisWeek));
    week[wKey] = w ? w[0] : ""; changed = true;
  }
  if (!changed) return;
  const trim = (o: Record<string, string>, n: number) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, n));
  const value = { day: trim(day, 200), week: trim(week, 60) };
  await repo.upsert("SchoolSetting", { schoolId, key: TOP_SCORERS_KEY }, { schoolId, key: TOP_SCORERS_KEY, value }, { value });
}

async function computeBoard(repo: Repo, schoolId: string, now: number): Promise<SchoolBoard> {
  const today = dayStartMs(now), wk = weekStart(new Date(now));
  const from = Math.min(today - DAY, wk);
  const runs = await weekRuns(repo, schoolId, from, now + DAY);
  const week = pointsByStudent(runs, wk), day = pointsByStudent(runs, today);
  // the classes: points of their students this week (a student in two classes counts for both)
  const ids = [...week.keys()];
  const classPts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 1000) {
    const ms = await repo.findMany("ClassMembership", { studentId: { in: ids.slice(i, i + 1000) }, leftAt: null }, { select: ["classId", "studentId"] });
    for (const m of ms) classPts.set(s(m.classId), (classPts.get(s(m.classId)) ?? 0) + (week.get(s(m.studentId)) ?? 0));
  }
  const ranked = [...classPts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const classes = ranked.length ? await repo.findMany("Class", { id: { in: ranked.slice(0, 20).map(([id]) => id) }, deletedAt: null }, { select: ["id", "name", "schoolId"] }) : [];
  const live = new Map(classes.filter((c) => !c.schoolId || s(c.schoolId) === schoolId).map((c) => [s(c.id), s(c.name)]));
  const top3 = ranked.filter(([id]) => live.has(id)).slice(0, 3);
  const ct = top3.length ? await repo.findMany("ClassTeacher", { classId: { in: top3.map(([id]) => id) } }, { select: ["classId", "teacherId", "isLead"] }) : [];
  const teachers = ct.length ? await repo.findMany("Teacher", { id: { in: [...new Set(ct.map((x) => s(x.teacherId)))] } }, { select: ["id", "userId", "title"] }) : [];
  const users = teachers.length ? await repo.findMany("User", { id: { in: teachers.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOfUser = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const teacherName = new Map(teachers.map((x) => [s(x.id), `${x.title ? `${s(x.title)} ` : ""}${surname(nameOfUser.get(s(x.userId)))}`.trim()]));
  const leadOf = (classId: string) => {
    const rows = ct.filter((x) => s(x.classId) === classId).sort((a, b) => Number(b.isLead === true || b.isLead === 1) - Number(a.isLead === true || a.isLead === 1));
    return rows.length ? teacherName.get(s(rows[0].teacherId)) ?? "" : "";
  };
  const [dailyTop, weeklyTop] = await Promise.all([topStudent(repo, topOf(day)), topStudent(repo, topOf(week))]);
  // the achievements of yesterday's / last week's winners (never blocks the board)
  await recordWinners(repo, schoolId, now, runs).catch(() => undefined);
  return { classesWeek: top3.map(([id, points]) => ({ classId: id, name: live.get(id)!, teacher: leadOf(id), points })), dailyTop, weeklyTop, at: new Date(now).toISOString() };
}

/** The school's scoreboard: top 3 classes this week, today's and this week's top scorers. Cached 60 s, one in flight. */
export async function schoolScoreboard(repo: Repo, schoolId: string, now = new Date()): Promise<SchoolBoard> {
  let m = boardCache.get(repo);
  if (!m) boardCache.set(repo, (m = new Map()));
  const t = now.getTime(), hit = m.get(schoolId);
  if (hit && t - hit.at < BOARD_TTL && t >= hit.at) return hit.p;
  for (const [k, v] of m) if (t - v.at >= BOARD_TTL || t < v.at) m.delete(k); // evict the expired boards
  const p = computeBoard(repo, schoolId, t);
  m.set(schoolId, { at: t, p });
  p.catch(() => m!.delete(schoolId));
  if (m.size > 50) m.delete(m.keys().next().value as string);
  return p;
}

// ------------------------------------------------------------------ the student's panel

export const badgesOffKey = (classId: string) => `readrise.badgesOff:${classId}`;

/** false when any of the student's classes turned celebrations off (SchoolSetting readrise.badgesOff:<classId> = "1"). */
export async function celebrationsOn(repo: Repo, studentId: string, schoolId?: string | null): Promise<boolean> {
  const sid = schoolId ?? s((await repo.findUnique("Student", { id: studentId }))?.schoolId);
  if (!sid) return true;
  const cls = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"], take: 20 });
  if (!cls.length) return true;
  const rows = await repo.findMany("SchoolSetting", { schoolId: sid, key: { in: cls.map((c) => badgesOffKey(s(c.classId))) } }, { select: ["key", "value"] });
  return !rows.some((r) => { const v = parse(r.value); return v === "1" || v === 1 || v === true || (!!v && typeof v === "object" && (v as { on?: unknown }).on === true); });
}

export interface Scoreboard {
  today: number; year: number;
  goal: { done: number; target: number; avg: number | null; avgTarget: number };
  achievements: { earned: number; total: number; recent: EarnedAchievement[]; fresh: EarnedAchievement[] };
  school: SchoolBoard | null;
  celebrate: boolean;
}

/**
 * Everything the student's scoreboard panel shows: points today / this school year, the annual goal (activities at
 * 75%+ and the year's first-try average), achievements x/28 with the recent ones, and the school's boards.
 * `fresh` = achievements earned in the last day (empty when the class turned celebrations off).
 */
export async function studentScoreboard(repo: Repo, studentId: string, opts: { schoolId: string; yearStart?: Date | null; now?: Date }): Promise<Scoreboard> {
  const now = opts.now ?? new Date();
  const ys = opts.yearStart ?? null;
  const [c, school, celebrate] = await Promise.all([
    cachedStudent(repo, studentId, ys ? ys.getTime() : null, now.getTime()),
    schoolScoreboard(repo, opts.schoolId, now).catch(() => null),
    celebrationsOn(repo, studentId, opts.schoolId).catch(() => true),
  ]);
  const t = now.getTime(), today = dayStartMs(t), y0 = ys ? ys.getTime() : -Infinity;
  const sum = (lo: number) => c.events.filter((e) => e.at >= lo && e.at <= t + DAY).reduce((a, e) => a + e.points, 0);
  const recent = [...c.achievements].sort((a, b) => (a.at < b.at ? 1 : -1));
  return {
    today: sum(today), year: sum(y0),
    goal: { done: c.year.done, target: ANNUAL_GOAL.activities, avg: c.year.avg, avgTarget: ANNUAL_GOAL.avg },
    achievements: { earned: c.achievements.length, total: ACHIEVEMENT_COUNT, recent: recent.slice(0, 3), fresh: celebrate ? recent.filter((a) => t - Date.parse(a.at) < DAY && Date.parse(a.at) <= t) : [] },
    school, celebrate,
  };
}
