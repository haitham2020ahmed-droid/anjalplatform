/**
 * 🚨 Early warning — THE rules in one file (pure: no database). Every threshold is a named constant here; the loader
 * (early-warning.ts) only reads the measures and calls these functions, so a rule is changed in one place and tested
 * without a database (tests/early-warning.test.ts).
 *
 *  - a measure's pattern from its last results: steady rise ↑, steady drop ↓, sudden drop, swinging up-down,
 *    flat (no progress for FLAT_WEEKS weeks), a single drop / rise, back on track;
 *  - the student's severity: 🔴 Urgent (act now) · 🟠 Watch · 🟢 Good news;
 *  - the reason in plain words ("ReadRise level down 2 levels and skill average −18% in 3 weeks").
 * Staff only: students never see this (nor any level word).
 */

export const DAY = 86_400_000;
const WEEK = 7 * DAY;

// ------------------------------------------------------------------ thresholds (named, in one place)

/** Swinging: at least this many direction changes among the last SWING_WINDOW results. */
export const SWING_WINDOW = 5;
export const SWING_CHANGES = 3;
/** Flat: no change of one step for this many weeks while the student keeps working. */
export const FLAT_WEEKS = 4;
/** Flat needs at least this many results in that time (or, for ReadRise, this many articles read). */
export const FLAT_MIN_RESULTS = 3;
/** Drops on 2+ measures count as "at the same time" when both latest results are this recent. */
export const SAME_TIME_DAYS = 28;
/** No practice for this many days (with a falling level) is urgent. */
export const NO_PRACTICE_URGENT_DAYS = 14;
/** Invalid tests (30%+ rapid guesses) this many times in INVALID_WINDOW_DAYS is urgent. */
export const INVALID_REPEAT = 2;
export const INVALID_WINDOW_DAYS = 60;
/** How far back the measures are read (about one term), and how many results a sparkline shows. */
export const SERIES_DAYS = 120;
export const MAX_POINTS = 8;
/** A week of practice counts for the skill average with at least this many careful answers. */
export const MIN_WEEK_ANSWERS = 5;
/** Weeks of practice in the skill-average line. */
export const SKILL_WEEKS = 6;
/** A test / check result counts with at least this many questions. */
export const MIN_TEST_QUESTIONS = 3;
/** Group moves shown for this many days ("this month"). */
export const MOVES_DAYS = 30;
/** The admin's list: urgent students not handled for this many days. */
export const UNHANDLED_DAYS = 7;
/** The school's scan is cached this long (like the alert scan). */
export const SCAN_CACHE_MS = 3 * 3600_000;

export type MeasureKey = "LEVEL" | "SKILLS" | "READRISE" | "MAP" | "CHECKS" | "WEEKLY" | "TESTS" | "FLUENCY" | "NAFS" | "WRITING";

export interface MeasureDef {
  /** Short name for the screen (an interface string). */
  label: string;
  /** How it is written in a reason ("skill average −18%"). */
  say: string;
  /** One step = a real change (smaller moves are noise). */
  step: number;
  /** A big change (sudden drop, big rise). */
  big: number;
  /** How a change is written: percentage points, ReadRise levels (100 = one level), RIT, WCPM or level groups. */
  unit: "pct" | "rr" | "rit" | "wcpm" | "group";
  /** A pattern counts only while the latest result is this recent. */
  recentDays: number;
  /** "Flat" is checked for this measure (growth is expected). */
  flat: boolean;
  /** Sparkline range. */
  min: number; max: number;
}

export const MEASURES: Record<MeasureKey, MeasureDef> = {
  LEVEL: { label: "Level group", say: "level group", step: 1, big: 2, unit: "group", recentDays: 42, flat: false, min: 0, max: 2 },
  SKILLS: { label: "Skill average", say: "skill average", step: 8, big: 15, unit: "pct", recentDays: 21, flat: false, min: 0, max: 100 },
  READRISE: { label: "ReadRise level", say: "ReadRise level", step: 100, big: 200, unit: "rr", recentDays: 42, flat: true, min: 300, max: 1400 },
  MAP: { label: "MAP RIT", say: "MAP RIT", step: 3, big: 6, unit: "rit", recentDays: 120, flat: false, min: 160, max: 260 },
  CHECKS: { label: "Progress checks", say: "progress checks", step: 10, big: 20, unit: "pct", recentDays: 42, flat: false, min: 0, max: 100 },
  WEEKLY: { label: "Weekly checks", say: "weekly checks", step: 10, big: 20, unit: "pct", recentDays: 42, flat: false, min: 0, max: 100 },
  TESTS: { label: "Test scores", say: "test scores", step: 10, big: 20, unit: "pct", recentDays: 60, flat: false, min: 0, max: 100 },
  FLUENCY: { label: "Fluency (WCPM)", say: "fluency", step: 8, big: 15, unit: "wcpm", recentDays: 60, flat: true, min: 0, max: 200 },
  NAFS: { label: "NAFS results", say: "NAFS results", step: 10, big: 20, unit: "pct", recentDays: 90, flat: false, min: 0, max: 100 },
  WRITING: { label: "Writing scores", say: "writing score", step: 10, big: 20, unit: "pct", recentDays: 60, flat: false, min: 0, max: 100 },
};
export const MEASURE_KEYS = Object.keys(MEASURES) as MeasureKey[];

// ------------------------------------------------------------------ patterns

export type Pattern = "SUDDEN_DROP" | "STEADY_DROP" | "SWINGING" | "DROP" | "FLAT" | "BACK_ON_TRACK" | "BIG_RISE" | "STEADY_RISE" | "RISE" | "STABLE";
export const DROPS: readonly Pattern[] = ["SUDDEN_DROP", "STEADY_DROP", "DROP"];
export const GOOD_PATTERNS: readonly Pattern[] = ["BIG_RISE", "BACK_ON_TRACK", "STEADY_RISE"];
export const PATTERN_NAME: Record<Pattern, string> = {
  SUDDEN_DROP: "Sudden drop", STEADY_DROP: "Steady drop", SWINGING: "Swinging up and down", DROP: "Dropped", FLAT: "No progress",
  BACK_ON_TRACK: "Back on track", BIG_RISE: "Big rise", STEADY_RISE: "Steady rise", RISE: "Rising", STABLE: "Steady",
};
export const PATTERN_ARROW: Record<Pattern, string> = { SUDDEN_DROP: "⇊", STEADY_DROP: "↓", SWINGING: "↕", DROP: "↘", FLAT: "→", BACK_ON_TRACK: "↺", BIG_RISE: "⇈", STEADY_RISE: "↑", RISE: "↗", STABLE: "·" };

export interface Point { at: number; v: number }
export interface PatternResult {
  pattern: Pattern;
  /** the latest real change: UP, DOWN, or null (none / too small) */
  direction: "UP" | "DOWN" | null;
  /** the change the pattern is about (in the measure's own unit) and over how many days */
  change: number;
  days: number;
  /** swinging: direction changes counted */
  swings: number;
  /** flat: weeks without progress */
  flatWeeks: number;
}

const signOf = (d: number, step: number) => (d >= step ? 1 : d <= -step ? -1 : 0);

/** Direction changes among the real moves of the last `window` results. */
export function directionChanges(values: number[], step: number, window = SWING_WINDOW): number {
  const v = values.slice(-window);
  const signs: number[] = [];
  for (let i = 1; i < v.length; i++) { const g = signOf(v[i] - v[i - 1], step); if (g) signs.push(g); }
  let n = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) n++;
  return n;
}

/**
 * The pattern of one measure (points in time order). `opts.active`: the student kept working on it (for "flat" of
 * a level that only moves on events, e.g. ReadRise); `opts.flatSince`: when it last changed (event measures).
 */
export function detectPattern(points: Point[], def: Pick<MeasureDef, "step" | "big" | "recentDays" | "flat">, now: number, opts: { active?: boolean; flatSince?: number | null } = {}): PatternResult {
  const none: PatternResult = { pattern: "STABLE", direction: null, change: 0, days: 0, swings: 0, flatWeeks: 0 };
  const pts = [...points].sort((a, b) => a.at - b.at);
  const last = pts[pts.length - 1];
  // flat for an event measure (no change since … while working)
  const flatEvent = () => {
    if (!def.flat || !opts.active || opts.flatSince === undefined || opts.flatSince === null) return null;
    const weeks = Math.floor((now - opts.flatSince) / WEEK);
    return weeks >= FLAT_WEEKS ? { ...none, pattern: "FLAT" as Pattern, flatWeeks: weeks, days: now - opts.flatSince } : null;
  };
  if (!last || now - last.at > def.recentDays * DAY) return flatEvent() ?? none;
  if (pts.length < 2) return flatEvent() ?? none;
  const v = pts.map((p) => p.v);
  const n = v.length;
  const d1 = v[n - 1] - v[n - 2];
  const s1 = signOf(d1, def.step);
  const days1 = pts[n - 1].at - pts[n - 2].at;
  const swings = directionChanges(v, def.step);
  const direction = s1 > 0 ? "UP" as const : s1 < 0 ? "DOWN" as const : null;
  const base = { direction, swings, flatWeeks: 0 };
  // 1. swinging (unstable): many direction changes win over the latest single move
  if (swings >= SWING_CHANGES) return { ...base, pattern: "SWINGING", change: d1, days: days1 };
  // 2. sudden big drop (the latest change)
  if (d1 <= -def.big) return { ...base, pattern: "SUDDEN_DROP", change: d1, days: days1 };
  // 3. a steady run of drops / rises: the last 2+ real moves in one direction, nothing the other way in between
  const run = (dir: 1 | -1) => {
    let i = n - 1, moves = 0;
    while (i > 0) { const g = signOf(v[i] - v[i - 1], def.step); if (g === -dir) break; if (g === dir) moves++; i--; }
    // i = the start of the run (the last result before a move the other way)
    return { moves, from: i, change: v[n - 1] - v[i], days: pts[n - 1].at - pts[i].at };
  };
  if (s1 < 0) {
    const r = run(-1);
    if (r.moves >= 2 && r.change <= -def.step) return { ...base, pattern: "STEADY_DROP", change: r.change, days: r.days };
    return { ...base, pattern: "DROP", change: d1, days: days1 };
  }
  if (s1 > 0) {
    // back on track: the move before was a drop, and this rise brings it back to where it was before that drop
    let j = n - 2;
    while (j > 0 && signOf(v[j] - v[j - 1], def.step) === 0) j--;
    if (j > 0 && signOf(v[j] - v[j - 1], def.step) < 0 && v[n - 1] >= v[j - 1]) return { ...base, pattern: "BACK_ON_TRACK", change: d1, days: days1 };
    const r = run(1);
    if (r.change >= def.big) return { ...base, pattern: "BIG_RISE", change: r.change, days: r.days };
    if (r.moves >= 2) return { ...base, pattern: "STEADY_RISE", change: r.change, days: r.days };
    return { ...base, pattern: "RISE", change: d1, days: days1 };
  }
  // 4. flat: FLAT_WEEKS+ weeks of results within one step of each other
  if (def.flat) {
    let fromIdx = -1; // the newest result at least FLAT_WEEKS weeks older than the latest
    for (let i = 0; i < n; i++) if (pts[i].at <= last.at - FLAT_WEEKS * WEEK) fromIdx = i;
    if (fromIdx >= 0) {
      const span = v.slice(fromIdx);
      if (span.length >= FLAT_MIN_RESULTS && Math.max(...span) - Math.min(...span) < def.step) {
        const weeks = Math.floor((now - pts[fromIdx].at) / WEEK);
        return { ...base, pattern: "FLAT", change: 0, days: now - pts[fromIdx].at, flatWeeks: weeks };
      }
    }
    const fe = flatEvent();
    if (fe) return fe;
  }
  return { ...base, pattern: "STABLE", change: 0, days: 0 };
}

// ------------------------------------------------------------------ severity

export type Severity = "URGENT" | "WATCH" | "GOOD";
export const SEVERITY_ORDER: Record<Severity, number> = { URGENT: 0, WATCH: 1, GOOD: 2 };
export const SEVERITY_NAME: Record<Severity, string> = { URGENT: "Urgent", WATCH: "Watch", GOOD: "Good news" };
export const SEVERITY_ICON: Record<Severity, string> = { URGENT: "🔴", WATCH: "🟠", GOOD: "🟢" };

export interface MeasureFinding { key: MeasureKey; points: Point[]; result: PatternResult }
export interface StudentContext {
  /** days since the last practice answer (null = never practised) */
  daysSincePractice: number | null;
  /** the student is new (less than NO_PRACTICE_URGENT_DAYS on the platform): no-practice does not count */
  isNew?: boolean;
  /** MAP Low (under the 21st percentile) or the Spring goal at risk / missed */
  mapRisk: boolean;
  /** the daily level check sees a sustained decline in recent answers */
  declining: boolean;
  /** invalid tests (30%+ rapid guesses) in the last INVALID_WINDOW_DAYS */
  invalidTests: number;
}
export interface Verdict { severity: Severity | null; rules: string[]; reason: string; signature: string }

const isDrop = (f: MeasureFinding) => DROPS.includes(f.result.pattern);

/** Urgent / Watch / Good (or null: nothing to show) with the rules that fired and the reason in plain words. */
export function judge(findings: MeasureFinding[], ctx: StudentContext, now: number): Verdict {
  const drops = findings.filter(isDrop);
  const recentDrops = drops.filter((f) => { const l = f.points[f.points.length - 1]; return l && now - l.at <= SAME_TIME_DAYS * DAY; });
  const falling = drops.length > 0 || ctx.declining;
  const rules: string[] = [];
  if (findings.some((f) => f.result.pattern === "SUDDEN_DROP")) rules.push("SUDDEN_DROP");
  if (recentDrops.length >= 2) rules.push("MULTI_DROP");
  const noPractice = !ctx.isNew && (ctx.daysSincePractice === null ? false : ctx.daysSincePractice >= NO_PRACTICE_URGENT_DAYS);
  if (noPractice && falling) rules.push("NO_PRACTICE_FALLING");
  if (ctx.mapRisk && falling) rules.push("MAP_RISK_DECLINING");
  if (ctx.invalidTests >= INVALID_REPEAT) rules.push("INVALID_REPEAT");
  let severity: Severity | null = null;
  if (rules.length) severity = "URGENT";
  else if (drops.length || findings.some((f) => f.result.pattern === "SWINGING" || f.result.pattern === "FLAT") || ctx.declining) {
    severity = "WATCH";
    for (const f of findings) if (isDrop(f)) rules.push("DROP"); else if (f.result.pattern === "SWINGING") rules.push("SWINGING"); else if (f.result.pattern === "FLAT") rules.push("FLAT");
    if (ctx.declining && !rules.length) rules.push("DECLINING");
  } else if (findings.some((f) => GOOD_PATTERNS.includes(f.result.pattern))) { severity = "GOOD"; rules.push("GOOD"); }
  const shown = severity === "GOOD" ? findings.filter((f) => GOOD_PATTERNS.includes(f.result.pattern)) : findings.filter((f) => isDrop(f) || f.result.pattern === "SWINGING" || f.result.pattern === "FLAT");
  const parts = shown.sort((a, b) => order(a) - order(b)).map((f) => measurePhrase(f.key, f.result));
  const extra: string[] = [];
  if (severity && severity !== "GOOD") {
    if (noPractice && falling) extra.push(`no practice for ${ctx.daysSincePractice} days`);
    if (ctx.mapRisk && falling) extra.push("MAP at risk");
    if (ctx.invalidTests >= INVALID_REPEAT) extra.push(`${ctx.invalidTests} invalid tests (rapid guessing) in ${INVALID_WINDOW_DAYS} days`);
    if (ctx.declining && !parts.length) extra.push("recent answers clearly weaker than before");
  }
  const reason = severity ? sentence([...parts, ...extra]) : "";
  const sig = [severity ?? "", ...shown.map((f) => `${f.key}.${f.result.pattern}`).sort(), ...rules.filter((r) => r !== "DROP" && r !== "SWINGING" && r !== "FLAT" && r !== "GOOD").sort()].join(",");
  return { severity, rules: [...new Set(rules)], reason, signature: shortHash(sig) };
}
const order = (f: MeasureFinding) => ["SUDDEN_DROP", "STEADY_DROP", "DROP", "SWINGING", "FLAT", "BIG_RISE", "BACK_ON_TRACK", "STEADY_RISE"].indexOf(f.result.pattern) * 100 + MEASURE_KEYS.indexOf(f.key);

// ------------------------------------------------------------------ plain words

const GROUP: Record<number, string> = { 0: "Approaching", 1: "Meeting", 2: "Exceeding" };
export const groupName = (v: number) => GROUP[v] ?? "—";
const minus = (x: number) => (x < 0 ? `−${Math.abs(x)}` : `+${x}`);

/** "3 weeks", "5 days" (empty when no time passed). */
export function spanText(ms: number): string {
  const days = Math.round(ms / DAY);
  if (days <= 0) return "";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"}`;
  const w = Math.round(days / 7);
  return `${w} week${w === 1 ? "" : "s"}`;
}

/** One measure's movement in words: "ReadRise level down 2 levels in 3 weeks", "skill average −18% in 3 weeks". */
export function measurePhrase(key: MeasureKey, r: PatternResult): string {
  const m = MEASURES[key];
  const span = spanText(r.days);
  const inSpan = span ? ` in ${span}` : "";
  if (r.pattern === "SWINGING") return `${m.say} swinging up and down (${r.swings} changes of direction in the last ${SWING_WINDOW} results)`;
  if (r.pattern === "FLAT") return `${m.say} flat for ${r.flatWeeks} week${r.flatWeeks === 1 ? "" : "s"}`;
  const amount = (() => {
    const c = Math.round(r.change);
    switch (m.unit) {
      case "rr": { const lv = Math.round(Math.abs(c) / 100); return `${c < 0 ? "down" : "up"} ${lv} level${lv === 1 ? "" : "s"}`; }
      case "group": { const lv = Math.abs(c); return `${c < 0 ? "down" : "up"} ${lv} group${lv === 1 ? "" : "s"}`; }
      case "pct": return `${minus(c)}%`;
      case "rit": return minus(c);
      case "wcpm": return `${minus(c)} words per minute`;
    }
  })();
  const back = r.pattern === "BACK_ON_TRACK" ? " (back on track)" : "";
  return `${m.say} ${amount}${inSpan}${back}`;
}

/** Joins phrases: "a and b", "a, b and c" — first letter capital. */
export function sentence(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (!p.length) return "";
  const s = p.length === 1 ? p[0] : `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

/** A short stable hash (the signature of a situation: handled items come back only when it changes). */
export function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
