/**
 * 🚀 ReadRise placement (LevelSet-like): an adaptive test of passages, 3 questions each.
 *
 *  Round 6 (owner, after the school's real Achieve3000 data — a Grade 7 class pre-test average of 281L, range
 *  BR220L…820L — while ReadRise started every Grade 7 student at 1050, so weak readers ended far too high):
 *   - every test starts LOW: at 300 (the lowest version) and climbs; the grade no longer decides the start
 *     (placementStartLevel). Exception: a MAP Lexile from the last 6 months starts at the nearest passage level.
 *   - like LevelSet: up to 13 passages (39 questions), at least 12 (round 7; was 8); three reversals end it.
 *   - below 300: passages at 200, 100, 0 and −200 ("BR200") when the content has them (placement-extra.json); the
 *     result can be below 300 (a level failed twice at the lowest passage → one step lower), never below RR_FLOOR.
 *     A student failing the lowest passage level twice, or passing the highest one twice, has nothing left to show:
 *     the test ends there.
 *  Before round 6:
 *  Start   latest MAP Lexile (clamped 300–1600 → nearest version level), else the grade's default level.
 *  Step    3/3 → +200 · 2/3 → +100 · 1/3 → −100 · 0/3 → −200 (clamped 300–1600); from 1200 up a 2/3 is not a pass and stays at the same level
 *          for another passage (4 Nov 2026). After the first reversal
 *          (the direction changes) every move is ±100. A passage is never shown twice.
 *  Stop    after 8 passages, or after two reversals once at least 5 passages were read.
 *  Result  the highest level read with a PASS (passBar below) that is not above a level failed twice; rounded to
 *          10. The pass bar is 2 of 3 below 1200, 3 of 3 from 1200 up (passBar, below) — a weak reader cannot
 *          "luck" past 1200 into a result that reads as advanced on a single lucky guess.
 *          MAP check: when a MAP Lexile exists and the result differs from it by more than 250, the result is the
 *          average of both (the reason says so).
 *  Then    RRStudent { level = startLevel = result, source PLACEMENT } and an RRLevelChange "Placement".
 *  Retake  once per term, when a teacher (of the student) or a school admin allows it (teacherResetPlacement). The
 *          level stays until the new test finishes.
 *  Checks  owner r69: THREE times a year (windows.ts): the first placement is the start of the year; in the middle
 *          and end windows a placed student may take it again ("Check your reading level"). A check sets the level
 *          (source PLACEMENT) but keeps the year's start (startLevel / placedAt), so growth runs start → middle → end;
 *          every finished test stores its period (RRPlacement.period).
 *          Round 4 (owner): a check starts from the student's CURRENT ReadRise level (not the MAP / grade start) and
 *          never shows a passage the student saw in an earlier placement test (testPool); when none is left at the
 *          target level, the nearest unseen passage is used (placementPlan).
 *  Rapid   round 4 (owner, the Diagnostic rule): every passage's answer time is recorded (the server's clock, and the
 *          page's when it sends one — the smaller wins). A passage answered faster than its minimum reading time
 *          (passageMinMs: at least 15 s, or a third of the passage's expected reading time when longer) does not
 *          count (no move, no result); 2+ such passages make the test "Not valid — retake": it is closed with no
 *          result (result null), the level is NOT changed, and the student can take it again at once.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { RR_FLOOR, RR_MAX, RR_MIN, formatLevel } from "./level";
import { loadPlacementPassages, type PlacementPassage } from "./content-loader";
import { MAP_BAND, RETAKE_REASON, assertStaffForStudent, ensureRRStudent, recentMapLexile, recordLevelChange, s, toDate } from "./engine";
import { firstAnswerThresholdMs } from "./accuracy";
import { dueCheck, loadReadRiseWindows, periodOf, RR_PERIOD_NAME, type RRPeriod } from "./windows";
import { alertMapGap } from "./accuracy";
import { runAfterResponse } from "../lib/after-response";
import { ADMIN_RESET_TAG } from "./placement-reset";
import { meetsRange } from "./benchmarks";

export { setLevelByTeacher } from "./engine";

// Round 6: LevelSet-like length — up to 13 passages (39 questions), 3 reversals end it (was 8 / 5 / 2).
// Round 7 (owner, live test: a test stopped after 8 passages / 24 questions): at least 12 passages (36 questions), at
// most 13 (39); about 20–30 minutes. The content has 6 passages at each level 300–1600 and 4 at −200/0/100/200, and
// the plan takes the nearest free level when a level runs out, so 13 passages are always there (never a repeat).
export const PLACEMENT = { maxPassages: 13, minPassages: 12, reversals: 3, mapGap: 250 } as const;
/** The fewest passages the content must have before the test is offered at all. */
export const PLACEMENT_MIN_POOL = 5;
/** Round 6: the test's start without a recent MAP Lexile — the lowest version (the test climbs from there). */
export const PLACEMENT_START = RR_MIN;
/**
 * 🐛 fix (audit finding, Oct 2026): a 4-option multiple-choice question has real guessing odds, so the ordinary pass
 * bar (2 of 3 correct) let a student "pass" the TOP level on a lucky guess — and since nothing could out-level the
 * old ceiling (1400), that single lucky pass became their final result, with no way to tell a genuinely advanced
 * reader from a guess. Two things now address this together: the scale itself gained two harder rungs (1500, 1600 —
 * see level.ts), giving a strong reader real headroom; and near whatever the TOP of the scale is a pass now requires
 * a clean 3 of 3 — a student who only gets 2 of 3 up there counts as a (soft) fail, which can trigger the normal
 * two-reversal ceiling-finding logic below instead of locking in immediately.
 * 🐛 fix (2nd audit finding, Oct 2026): TOP_TIER was 1500, so the same lucky-guess problem the paragraph above
 * describes was still wide open for levels 1100–1400 — a school reported a student well below grade level
 * (a struggling Grade 11 reader) reaching a final placement of 1400 purely by stringing together a few 2-of-3
 * passes (each one has real odds on a 4-option question) before the test ever reversed. Lowered to 1200 so the
 * harder 3-of-3 bar covers the whole upper quarter of the scale (1200–1600), not just its last two rungs — a
 * weak reader can no longer "luck" past 1200 into a result that reads as advanced. Levels at/below 1100 keep the
 * ordinary 2-of-3 bar (unchanged; covered by existing tests), since that part of the scale has plenty of room
 * left for the normal reversal logic to catch a one-off guess before it could ever become the final result.
 */
const TOP_TIER = 1200;
const passBar = (level: number) => (level >= TOP_TIER ? 3 : 2);
export interface PlacementStep {
  level: number; passageId: string; answers: string[]; correct: number;
  /** 📏 round 8: the passage's level on the Achieve3000 scale when it was answered (none in older tests: the level) */
  lexile?: number;
  /** round 4: how long the passage + its questions took (ms), when it was recorded */
  ms?: number;
  /** round 4: answered faster than the passage's minimum reading time — the step does not count */
  rapid?: boolean;
  /** when it was answered (ISO) — the server's clock for the next passage's time */
  at?: string;
}
/** round 4: this many rapid passages make the test "Not valid — retake" (the level is not changed) */
export const PLACEMENT_RAPID_INVALID = 2;
/** round 4: the shortest time a passage and its 3 questions can be read in */
export const PLACEMENT_MIN_MS = 15_000;
const wordsOf = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
/** The minimum reading time of a placement passage (ms): 15 s, or a third of its expected reading time when longer. */
export const passageMinMs = (text: string): number => Math.max(PLACEMENT_MIN_MS, firstAnswerThresholdMs(wordsOf(text)));
/** The text shown for a placement test that was not valid. */
export const PLACEMENT_INVALID_TEXT = "Not valid — retake";

/**
 * 🛡️ Round 10 (owner, 11 Nov 2026 — a Grade 5 reader with MAP 105L was placed at 1600L; another at 1600L with no
 * MAP; Achieve3000's LevelSet as the model): the test is now hard to "game".
 *  - GRADE CAP: like LevelSet's grade-band Locator, the test moves only up to the grade's "Meets" top + 150
 *    (gradeCapLevel); a student who answers 3 of 3 TWICE at the cap earns a higher cap (+200), again and again —
 *    a strong reader still reaches the top, a lucky one does not.
 *  - NO EARLY END AT THE TOP: passing the highest level twice no longer ends the test before PLACEMENT.minPassages.
 *  - NOT VALID (retake at once, the level unchanged): the whole test in under PLACEMENT_MIN_TOTAL_MS, the same
 *    letter for most answers, or the longest option picked almost every time (placementPattern).
 *  - MAP ANCHOR: the result stays within MAP_BAND of a MAP Lexile from the last 6 months (anchorToMap); with no MAP,
 *    within the grade cap (the articles then move a strong reader up).
 */
export { MAP_BAND };
/** the grade cap is this far above the grade's "Meets" top (Achieve3000 scale) */
export const GRADE_CAP_ABOVE = 150;
/** each time the student passes the cap twice (3 of 3), the cap rises this much */
export const CAP_RAISE = 200;
/** a whole test faster than this is not valid */
export const PLACEMENT_MIN_TOTAL_MS = 10 * 60_000;
/** not valid: one letter for this share of the answers (needs PATTERN_MIN_ANSWERS answers) */
export const PATTERN_SAME_LETTER = 0.6;
/** not valid: the uniquely longest option picked this often (needs PATTERN_MIN_LONGEST such questions) */
export const PATTERN_LONGEST = 0.75;
export const PATTERN_MIN_ANSWERS = 18, PATTERN_MIN_LONGEST = 12;

/** 🛡️ round 10: the grade cap as an Achieve3000 level (null: grade unknown). */
export const gradeCapAchieve = (grade: number | null): number | null => (grade === null ? null : meetsRange(grade).max + GRADE_CAP_ABOVE);

/** A result / measure on the scale: RR_FLOOR…RR_MAX (round 6: below 300 is real). */
const clampP = (l: number) => Math.min(RR_MAX, Math.max(RR_FLOOR, l));
/** The level of the passage nearest to a measure (ties: the lower one); the lowest version when there are none. */
export function nearestPassageLevel(x: number, passages: readonly PlacementPassage[]): number {
  const levels = [...new Set(passages.map((p) => p.level))].sort((a, b) => a - b);
  if (!levels.length) return Math.min(RR_MAX, Math.max(RR_MIN, Math.round(x / 100) * 100));
  return levels.reduce((best, l) => (Math.abs(l - x) < Math.abs(best - x) ? l : best), levels[0]);
}
const BIG: Record<number, number> = { 3: 200, 2: 100, 1: -100, 0: -200 };

// ------------------------------------------------------------------ the algorithm (pure)

/** 🛡️ round 10: the test's ceiling — the grade cap, raised by CAP_RAISE each time 3 of 3 was scored twice at or above it. */
export function effectiveCap(cap: number | null, counted: readonly PlacementStep[], top: number, start: number): number {
  if (cap === null || !Number.isFinite(cap)) return top;
  let c = Math.min(top, Math.max(cap, start));
  while (c < top && counted.filter((x) => x.level >= c && x.correct >= 3).length >= 2) c = Math.min(top, c + CAP_RAISE);
  return c;
}

export interface PlacementPlan { done: boolean; nextLevel: number | null; passage: PlacementPassage | null; reversals: number }

/** Where the test goes next from the steps so far (deterministic: the same steps always give the same passage). */
export function placementPlan(startLevel: number, steps: PlacementStep[], passages: PlacementPassage[], opts: { cap?: number | null } = {}): PlacementPlan {
  // round 6: the test moves inside the levels the content has (−200 … 1600 with the extra passages, else 300 … 1600)
  const levels = passages.map((p) => p.level);
  const lo = levels.length ? Math.min(...levels) : RR_MIN, top = levels.length ? Math.max(...levels) : RR_MAX;
  // round 4: a rapid passage does not count (no move); its passage is still never shown again
  const counted = steps.filter((x) => !x.rapid);
  // 🛡️ round 10: the grade cap (a passage level), raised by CAP_RAISE each time the student scores 3 of 3 twice at it
  const hi = effectiveCap(opts.cap ?? null, counted, top, Math.max(lo, startLevel));
  const clampT = (l: number) => Math.min(hi, Math.max(lo, l));
  let level = clampT(startLevel), lastSign = 0, reversals = 0;
  for (const st of counted) {
    // 🐛 fix (owner, 4 Nov 2026): from TOP_TIER up a 2 of 3 is NOT a pass (passBar), so it must not move the test UP
    // either (it used to: +100/+200, pushing a weak reader higher before the result logic caught it). It now stays
    // at the same level for another passage (a second 2 of 3 there = failed twice = the ceiling); not a reversal.
    const soft = st.correct >= 2 && st.correct < passBar(st.level);
    const big = soft ? 0 : BIG[Math.max(0, Math.min(3, st.correct))];
    const sign = Math.sign(big);
    if (sign !== 0) {
      if (lastSign && sign !== lastSign) reversals++;
      lastSign = sign;
    }
    level = clampT(st.level + (reversals > 0 ? sign * 100 : big));
  }
  // round 6: failed twice at the lowest passage level, or passed twice at the highest: nothing left to measure
  const failsAt = (l: number) => counted.filter((x) => x.level === l && x.correct < passBar(x.level)).length;
  const passesAt = (l: number) => counted.filter((x) => x.level === l && x.correct >= passBar(x.level)).length;
  // 🛡️ round 10: passing the top twice ends the test only once the minimum number of passages has been read
  const edge = levels.length > 0 && (failsAt(lo) >= 2 || (hi >= top && passesAt(hi) >= 2 && counted.length >= PLACEMENT.minPassages));
  if (edge || counted.length >= PLACEMENT.maxPassages || (reversals >= PLACEMENT.reversals && counted.length >= PLACEMENT.minPassages)) return { done: true, nextLevel: null, passage: null, reversals };
  const used = new Set(steps.map((x) => x.passageId));
  const free = passages.filter((p) => !used.has(p.id));
  if (!free.length) return { done: true, nextLevel: null, passage: null, reversals };
  // the target level; else the nearest level that still has a passage (ties: the direction of travel)
  const pick = [...free].sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || (lastSign >= 0 ? b.level - a.level : a.level - b.level) || a.id.localeCompare(b.id))[0];
  return { done: false, nextLevel: pick.level, passage: pick, reversals };
}

/** Round 7: the answer model used to refine the result — a 4-option question (1 in 4 guessing chance); the chance of a
 *  right answer falls from ~100% to the guessing floor over a few hundred Lexile around the reader's level. */
export const PLACEMENT_MODEL = { guess: 0.25, scale: 120, window: 100 } as const;
/** 📏 Round 8: a step's difficulty on the Achieve3000 scale (the passage's measured lexile; older steps: the level). */
export const lexileOf = (st: Pick<PlacementStep, "level" | "lexile">): number => (st.lexile !== undefined && st.lexile !== null && Number.isFinite(Number(st.lexile)) ? Number(st.lexile) : st.level);
/** 📏 Round 8: a passage LEVEL (label) on the Achieve3000 scale — the average measured lexile of the steps read there. */
function levelOnScale(steps: readonly PlacementStep[], level: number): number {
  const at = steps.filter((x) => x.level === level);
  return at.length ? at.reduce((n, x) => n + lexileOf(x), 0) / at.length : level;
}
/** 📏 Round 8: the passage level (label) whose passages measure nearest an Achieve3000 level (a MAP Lexile, a student level). */
export function passageLevelFor(achieve: number, passages: readonly PlacementPassage[]): number {
  if (!passages.length) return nearestPassageLevel(achieve, passages);
  const by = new Map<number, number[]>();
  for (const p of passages) (by.get(p.level) ?? by.set(p.level, []).get(p.level)!).push(p.lexile ?? p.level);
  let best = passages[0].level, bestD = Infinity;
  for (const [l, xs] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    const d = Math.abs(xs.reduce((n, x) => n + x, 0) / xs.length - achieve);
    if (d < bestD) { best = l; bestD = d; }
  }
  return best;
}
/** The level (RR_FLOOR…RR_MAX, step 10) that best explains every counted answer (maximum likelihood). */
export function placementEstimate(all: PlacementStep[]): number | null {
  const steps = all.filter((x) => !x.rapid);
  if (!steps.length) return null;
  let best = -Infinity, at = 0;
  for (let x = RR_FLOOR; x <= RR_MAX; x += 10) {
    let ll = 0;
    for (const st of steps) {
      const c = Math.max(0, Math.min(3, st.correct));
      const p = PLACEMENT_MODEL.guess + (1 - PLACEMENT_MODEL.guess) / (1 + Math.exp((lexileOf(st) - x) / PLACEMENT_MODEL.scale));
      ll += c * Math.log(p) + (3 - c) * Math.log(1 - p);
    }
    if (ll > best + 1e-9) { best = ll; at = x; }
  }
  return at;
}

/**
 * The placement result from the steps (before the MAP check). Round 6: it can be below 300 — when no level was
 * passed, one step (100) under the lowest level read, never below RR_FLOOR.
 * Round 7 (owner: statistical check, tests/round7-placement-sim.test.ts): the rule result R (the highest level passed,
 * not above a level failed twice) was biased: up to +50L below 1200 (a 2-of-3 pass is often luck) and about −120L
 * from 1200 up (the 3-of-3 bar). Now: (1) when the lowest level failed above R is in the 3-of-3 tier, R becomes the
 * midpoint between them; (2) when some level was passed, the result is the level that best explains ALL the answers
 * (placementEstimate), kept within 100 of R. Nothing passed: R as before.
 */
export function placementResult(all: PlacementStep[], startLevel: number): number {
  const steps = all.filter((x) => !x.rapid); // round 4: a rapid passage does not count
  if (!steps.length) return clampP(Math.round(startLevel / 10) * 10);
  const by = new Map<number, { pass: number; fail: number }>();
  for (const st of steps) {
    const e = by.get(st.level) ?? { pass: 0, fail: 0 };
    if (st.correct >= passBar(st.level)) e.pass++; else e.fail++;
    by.set(st.level, e);
  }
  const failedTwice = [...by.entries()].filter(([, e]) => e.fail >= 2).map(([l]) => l);
  const ceiling = failedTwice.length ? Math.min(...failedTwice) : Infinity;
  const ok = [...by.entries()].filter(([l, e]) => e.pass >= 1 && (l < ceiling || (l === ceiling && e.pass > e.fail))).map(([l]) => l);
  // 📏 round 8: the rule works on the passage levels (labels) and is then read on the Achieve3000 scale (levelOnScale)
  const scale = (l: number) => levelOnScale(steps, l);
  if (!ok.length) return clampP(Math.round((scale(Math.min(...steps.map((x) => x.level))) - 100) / 10) * 10);
  const high = Math.max(...ok);
  const failedAbove = [...by.entries()].filter(([l, e]) => l > high && e.fail >= 1).map(([l]) => l);
  const lowFail = failedAbove.length ? Math.min(...failedAbove) : null;
  const rule = lowFail !== null && lowFail >= TOP_TIER ? (scale(high) + scale(lowFail)) / 2 : scale(high);
  const est = placementEstimate(steps) ?? rule;
  const r = Math.min(rule + PLACEMENT_MODEL.window, Math.max(rule - PLACEMENT_MODEL.window, est));
  return clampP(Math.round(r / 10) * 10);
}

/** The MAP check: averages with the MAP Lexile when they are more than 250 apart. */
export function blendWithMap(result: number, mapLexile: number | null): { level: number; note: string | null } {
  if (mapLexile === null) return { level: result, note: null };
  const m = clampP(mapLexile);
  if (Math.abs(result - m) <= PLACEMENT.mapGap) return { level: result, note: null };
  const level = Math.round((result + m) / 2 / 10) * 10;
  return { level, note: `the test result ${formatLevel(result)} was more than ${PLACEMENT.mapGap} from the MAP Lexile ${formatLevel(mapLexile)}, so both were averaged` };
}

/**
 * 🛡️ Round 10: the result is kept within MAP_BAND of a recent MAP Lexile (MAP is the school's official measure);
 * with no MAP, at most the grade cap (gradeCapAchieve) — strong first tries then move a strong reader up.
 */
export function anchorToMap(result: number, mapLexile: number | null, grade: number | null): { level: number; note: string | null } {
  if (mapLexile !== null && Number.isFinite(mapLexile)) {
    const m = clampP(mapLexile);
    const level = Math.round(Math.min(m + MAP_BAND, Math.max(m - MAP_BAND, result)) / 10) * 10;
    if (level === result) return { level, note: null };
    return { level, note: `the test result ${formatLevel(result)} was more than ${MAP_BAND} from the MAP Lexile ${formatLevel(mapLexile)}, so the level was kept within ${MAP_BAND} of MAP` };
  }
  const cap = gradeCapAchieve(grade);
  if (cap !== null && result > cap) return { level: Math.round(cap / 10) * 10, note: `no recent MAP Lexile: the first level is at most ${formatLevel(cap)} for Grade ${grade}; strong articles move it up` };
  return { level: result, note: null };
}

/** 🛡️ Round 10: why a finished test is not valid (too fast, one letter, the longest option every time), else null. */
export function placementPattern(steps: readonly PlacementStep[], passages: readonly PlacementPassage[], startedAt: Date, now: Date): string | null {
  const counted = steps.filter((x) => !x.rapid);
  if (counted.length >= PLACEMENT.minPassages && now.getTime() - startedAt.getTime() < PLACEMENT_MIN_TOTAL_MS) return `the whole test took under ${Math.round(PLACEMENT_MIN_TOTAL_MS / 60_000)} minutes`;
  // a pattern counts only when it goes well beyond what the answer key itself would give (a reader who knows every
  // answer follows the key — never "Not valid" for that)
  const byId = new Map(passages.map((p) => [p.id, p]));
  const answers: string[] = [], keys: string[] = [];
  let longQ = 0, longPicked = 0, longKey = 0;
  for (const st of steps) {
    const p = byId.get(st.passageId);
    st.answers.forEach((a, i) => {
      const ans = String(a ?? "").toUpperCase();
      answers.push(ans);
      const q = p?.questions[i];
      if (!q) return;
      keys.push(q.answer);
      const lens = q.options.map((o) => o.length);
      const max = Math.max(...lens);
      if (lens.filter((x) => x === max).length !== 1) return;
      longQ++;
      const longest = "ABCD"[lens.indexOf(max)];
      if (longest === ans) longPicked++;
      if (longest === q.answer) longKey++;
    });
  }
  if (answers.length >= PATTERN_MIN_ANSWERS) {
    for (const l of ["A", "B", "C", "D"]) {
      const mine = answers.filter((a) => a === l).length / answers.length;
      const key = keys.length ? keys.filter((a) => a === l).length / keys.length : 0.25;
      if (mine >= PATTERN_SAME_LETTER && mine - key >= 0.3) return `${Math.round(100 * mine)}% of the answers were "${l}"`;
    }
  }
  if (longQ >= PATTERN_MIN_LONGEST && longPicked / longQ >= PATTERN_LONGEST && (longPicked - longKey) / longQ >= 0.3) return `the longest answer was picked ${longPicked} times out of ${longQ}`;
  return null;
}

/** 🛡️ Round 10: the test's grade cap as a PASSAGE level (null: grade unknown). */
export async function placementCap(repo: Repo, studentId: string, passages: readonly PlacementPassage[]): Promise<number | null> {
  const cap = gradeCapAchieve(await gradeOfStudent(repo, studentId));
  return cap === null ? null : passageLevelFor(cap, passages);
}

/**
 * 🎯 Round 6: where a placement test (first test, retake, admin reset) starts — a MAP Lexile from the last 6 months
 * at the nearest passage level; else PLACEMENT_START (300, the lowest version: the test climbs). The grade's default
 * (level.ts defaultLevel) is no longer used: it started a Grade 7 reader at 1050.
 */
export async function placementStartLevel(repo: Repo, studentId: string, passages: readonly PlacementPassage[] = loadPlacementPassages(), now = new Date()): Promise<{ level: number; source: "MAP" | "LOW" }> {
  const map = await recentMapLexile(repo, studentId, now);
  // round 8: the passage level whose passages measure nearest the MAP Lexile (both on the Achieve3000 / Lexile scale)
  if (map !== null) return { level: passageLevelFor(map, passages), source: "MAP" };
  const start = passages.length ? nearestPassageLevel(PLACEMENT_START, passages) : PLACEMENT_START;
  return { level: start, source: "LOW" };
}

// ------------------------------------------------------------------ state

const stepsOf = (p: Row): PlacementStep[] => {
  const v = typeof p.steps === "string" ? (() => { try { return JSON.parse(p.steps as string) as unknown; } catch { return []; } })() : p.steps;
  return Array.isArray(v) ? (v as PlacementStep[]) : [];
};
/** a finished test with a result (a "Not valid" test is closed with result null) */
const validDone = (r: Row) => !!r.completedAt && r.result !== null && r.result !== undefined;

/**
 * 🎯 Round 4: the passages a test may use — every passage minus the ones the student saw in any OTHER placement test
 * (the same set for the whole test: earlier tests never change). When too few unseen passages are left for a test
 * (under PLACEMENT.minPassages), all the passages are used rather than no test.
 */
export async function testPool(repo: Repo, p: Row, passages: PlacementPassage[]): Promise<PlacementPassage[]> {
  const others = (await repo.findMany("RRPlacement", { studentId: s(p.studentId) }, { select: ["id", "steps"] })).filter((r) => s(r.id) !== s(p.id));
  if (!others.length) return passages;
  const seen = new Set(others.flatMap((r) => stepsOf(r).map((x) => s(x.passageId))));
  const unseen = passages.filter((x) => !seen.has(x.id));
  return unseen.length >= PLACEMENT.minPassages ? unseen : passages;
}

export interface PlacementStatus {
  open: Row | null; last: Row | null; canStart: boolean;
  /** a teacher allowed a retake after the last test */
  retake: boolean;
  /** the reading check that is open now (middle / end of year), else null */
  due: RRPeriod | null;
  /** round 4: the latest test was "Not valid" (too many fast answers): the student takes it again */
  invalid?: boolean;
}

export async function placementStatus(repo: Repo, studentId: string, now = new Date()): Promise<PlacementStatus> {
  const rows = (await repo.findMany("RRPlacement", { studentId })).sort((a, b) => toDate(b.startedAt).getTime() - toDate(a.startedAt).getTime());
  const open = rows.find((r) => !r.completedAt) ?? null;
  // round 4: a "Not valid" test (closed with no result) is not a placement: it never sets "last" or a check as done
  const last = rows.find(validDone) ?? null;
  const latest = rows.find((r) => r.completedAt) ?? null;
  const invalid = !!latest && !validDone(latest);
  if (open) return { open, last, canStart: false, retake: false, due: null };
  if (!last) return { open, last, canStart: true, retake: false, due: null, invalid };
  const done = toDate(last.completedAt).getTime();
  const allowed = (await repo.findMany("RRLevelChange", { studentId })).some((c) => s(c.reason).startsWith(RETAKE_REASON) && toDate(c.createdAt).getTime() > done);
  // 🗓️ the middle / end of year reading check (windows.ts): open while its window is and it is not done yet
  const due = allowed ? null : dueCheck(await loadReadRiseWindows(repo, s(last.schoolId), now), now, rows.filter(validDone).map((r) => toDate(r.completedAt)));
  return { open, last, canStart: allowed || due !== null, retake: allowed, due, invalid };
}

function student(actor: Actor): string {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students take the placement.");
  return actor.studentId;
}

export interface PlacementView {
  state: "NOT_AVAILABLE" | "READY" | "IN_PROGRESS" | "DONE";
  placementId: string | null; stepNumber: number; maxSteps: number;
  passage: { id: string; title: string; text: string; questions: { stem: string; options: string[] }[] } | null;
  result: number | null; retake: boolean;
  /** owner r69: the middle / end of year reading check that is open (null: the first placement or a retake) */
  check?: RRPeriod | null;
  /** round 4: the last test was "Not valid" (too many fast answers) — take it again */
  invalid?: boolean;
  /** round 6: the student's grade (1–12) for the grade band of the result (benchmarks.ts), null when unknown */
  grade?: number | null;
}

async function gradeOfStudent(repo: Repo, studentId: string): Promise<number | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: s(st.gradeId) }) : null;
  const n = g ? Number(g.level) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

/** What the student's placement page shows. Passages are injectable (tests). */
export async function placementView(repo: Repo, actor: Actor, passages: PlacementPassage[] = loadPlacementPassages(), now = new Date()): Promise<PlacementView> {
  const studentId = student(actor);
  const st = await placementStatus(repo, studentId, now);
  const base = { placementId: null, stepNumber: 0, maxSteps: PLACEMENT.maxPassages, passage: null, result: st.last ? Number(st.last.result) : null, retake: Boolean(st.last), check: st.due, invalid: Boolean(st.invalid), grade: await gradeOfStudent(repo, studentId) };
  if (st.open) {
    const steps = stepsOf(st.open);
    const pool = await testPool(repo, st.open, passages);
    const plan = placementPlan(Number(st.open.startLevel), steps, pool, { cap: await placementCap(repo, studentId, pool) });
    if (!plan.passage) {
      // the passages ran out (or the file changed) after some answers: finish with what we have
      if (plan.done && steps.length) {
        const fin = await finishPlacement(repo, st.open, now, passages);
        if (fin.invalid) return { ...base, state: "READY", invalid: true };
        afterPlacement(repo, studentId, now);
        return { ...base, state: "DONE", result: fin.level, retake: false };
      }
      return { ...base, state: "NOT_AVAILABLE", placementId: s(st.open.id) };
    }
    const p = plan.passage;
    return { ...base, invalid: false, state: "IN_PROGRESS", placementId: s(st.open.id), stepNumber: steps.length + 1, passage: { id: p.id, title: p.title, text: p.text, questions: p.questions.map((q) => ({ stem: q.stem, options: q.options })) } };
  }
  if (passages.length < PLACEMENT_MIN_POOL) return { ...base, state: "NOT_AVAILABLE" };
  return { ...base, state: st.canStart ? "READY" : "DONE" };
}

/** Starts (or returns the open) placement. */
export async function startPlacement(repo: Repo, actor: Actor, now = new Date()): Promise<string> {
  const studentId = student(actor);
  const st = await placementStatus(repo, studentId, now);
  if (st.open) return s(st.open.id);
  if (!st.canStart) throw new ValidationError("You already have a ReadRise Level. Your teacher can let you take the placement again.");
  // round 4: a middle / end of year check starts from the CURRENT ReadRise level (at the nearest passage level — round
  // 6: a level below 300 starts at the nearest low passage). Round 6: the first test, a retake and an admin reset
  // start LOW (300) or at a MAP Lexile from the last 6 months (placementStartLevel), never at the grade's default.
  const passages = loadPlacementPassages();
  const startLevel = st.due
    ? passageLevelFor(Number((await ensureRRStudent(repo, studentId, now)).level), passages)
    : (await placementStartLevel(repo, studentId, passages, now)).level;
  const row = await repo.create("RRPlacement", { studentId, schoolId: actor.schoolId, startLevel, steps: [], startedAt: now, period: st.due });
  return s(row.id);
}

export interface PlacementAnswer {
  done: boolean; correct: number; result: number | null; note: string | null;
  /** round 4: 2+ passages answered too fast — the test is "Not valid — retake" and the level did not change */
  invalid?: boolean;
  /** round 4: this passage was answered too fast to count */
  rapid?: boolean;
}

/** Scores one passage (3 answers A–D) and moves on; finishes the test when the rules say so. */
export async function answerPlacement(repo: Repo, actor: Actor, placementId: string, passageId: string, answers: string[], passages: PlacementPassage[] = loadPlacementPassages(), now = new Date(), timing: { ms?: number | null } = {}): Promise<PlacementAnswer> {
  const studentId = student(actor);
  const res = await repo.transaction(async (tx): Promise<PlacementAnswer> => {
    const p = await tx.findUnique("RRPlacement", { id: placementId });
    if (!p || p.studentId !== studentId) throw new ForbiddenError("Placement not found.");
    if (p.completedAt) throw new ValidationError("This placement is finished.");
    const steps = stepsOf(p);
    const pool = await testPool(tx, p, passages);
    const cap = await placementCap(tx, studentId, pool);
    const plan = placementPlan(Number(p.startLevel), steps, pool, { cap });
    if (!plan.passage || plan.passage.id !== passageId) throw new ValidationError("This passage is no longer the current one. Reload the page.");
    const clean = answers.map((a) => String(a ?? "").trim().toUpperCase());
    if (clean.length !== 3 || clean.some((a) => !/^[ABCD]$/.test(a))) throw new ValidationError("Answer all 3 questions.");
    const correct = plan.passage.questions.filter((q, i) => q.answer === clean[i]).length;
    // ⏱ round 4: the passage's time — the server's (since the last answer, else the test's start) and the page's
    // when it sent one; the smaller wins (a page can never claim more time than the server saw)
    const prevAt = steps.length && steps[steps.length - 1].at ? toDate(steps[steps.length - 1].at).getTime() : toDate(p.startedAt).getTime();
    const serverMs = Number.isFinite(prevAt) ? Math.max(0, now.getTime() - prevAt) : null;
    const pageMs = timing?.ms === null || timing?.ms === undefined || !Number.isFinite(Number(timing.ms)) ? null : Math.max(0, Number(timing.ms));
    const ms = serverMs === null ? pageMs : pageMs === null ? serverMs : Math.min(serverMs, pageMs);
    const rapid = ms !== null && ms < passageMinMs(plan.passage.text);
    const next: PlacementStep[] = [...steps, { level: plan.passage.level, ...(plan.passage.lexile !== undefined ? { lexile: plan.passage.lexile } : {}), passageId, answers: clean, correct, ...(ms !== null ? { ms: Math.round(ms) } : {}), rapid, at: now.toISOString() }];
    // 🚫 2+ rapid passages: "Not valid — retake" (the Diagnostic rule) — closed with NO result, the level unchanged
    if (next.filter((x) => x.rapid).length >= PLACEMENT_RAPID_INVALID) {
      await tx.updateMany("RRPlacement", { id: placementId }, { steps: next, completedAt: now, result: null });
      return { done: true, correct, result: null, note: PLACEMENT_INVALID_TEXT, invalid: true, rapid };
    }
    await tx.updateMany("RRPlacement", { id: placementId }, { steps: next });
    const after = placementPlan(Number(p.startLevel), next, pool, { cap });
    if (!after.done) return { done: false, correct, result: null, note: null, rapid };
    const fin = await finishPlacement(tx, { ...p, steps: next }, now, passages);
    if (fin.invalid) return { done: true, correct, result: null, note: `${PLACEMENT_INVALID_TEXT}: ${fin.note}`, invalid: true, rapid };
    return { done: true, correct, result: fin.level, note: fin.note, rapid };
  });
  if (res.done && !res.invalid) afterPlacement(repo, studentId, now);
  return res;
}

async function finishPlacement(repo: Repo, p: Row, now: Date, passages: readonly PlacementPassage[] = loadPlacementPassages()): Promise<{ level: number; note: string | null; invalid?: boolean }> {
  const steps = stepsOf(p);
  const studentId = s(p.studentId);
  // 🛡️ round 10: a test answered too fast or by a pattern is "Not valid": closed with no result, retaken at once
  const why = placementPattern(steps, passages, toDate(p.startedAt), now);
  if (why) {
    await repo.updateMany("RRPlacement", { id: p.id }, { steps, completedAt: now, result: null });
    return { level: NaN, note: why, invalid: true };
  }
  const raw = placementResult(steps, Number(p.startLevel));
  // round 6: only a MAP Lexile from the last 6 months is compared (an old one says little about the reader now)
  // 🛡️ round 10: kept within MAP_BAND of MAP (was: averaged when 250+ apart); no MAP → at most the grade cap
  const { level, note } = anchorToMap(raw, await recentMapLexile(repo, studentId, now), await gradeOfStudent(repo, studentId));
  const [windows, earlier] = await Promise.all([
    loadReadRiseWindows(repo, s(p.schoolId), now),
    repo.findMany("RRPlacement", { studentId, completedAt: { not: null }, result: { not: null } }, { select: ["id", "completedAt"] }),
  ]);
  const period = periodOf(windows, now);
  // 🔄 an admin reset (placement-reset.ts) after the last finished test: the old result was wrong, so the new one
  // replaces the year's start level too (a fresh start, not a "check")
  const prevDone = Math.max(0, ...earlier.filter((r) => s(r.id) !== s(p.id)).map((r) => toDate(r.completedAt).getTime()));
  const adminReset = (await repo.findMany("RRLevelChange", { studentId }, { select: ["reason", "createdAt"] })).some((c) => s(c.reason).includes(ADMIN_RESET_TAG) && toDate(c.createdAt).getTime() > prevDone);
  // 🗓️ a middle / end of year check keeps the year's start (growth start → middle → end); the first test (or a
  // retake at the start of the year) sets the start
  const recheck = !adminReset && earlier.some((r) => s(r.id) !== s(p.id)) && period !== "BOY";
  await repo.updateMany("RRPlacement", { id: p.id }, { result: level, completedAt: now, period });
  const rr = await ensureRRStudent(repo, studentId, now);
  await repo.updateMany("RRStudent", { studentId }, recheck ? { level, source: "PLACEMENT" } : { level, startLevel: level, source: "PLACEMENT", placedAt: now });
  const what = recheck ? `Placement (${RR_PERIOD_NAME[period].toLowerCase()} reading check)` : "Placement";
  await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: Number(rr.level), to: level, reason: `${what}: ${steps.length} passages, result ${formatLevel(level)}${note ? ` (${note})` : ""}`, now });
  return { level, note };
}

/** ⚖️ ReadRise vs MAP after a finished placement: one alert for the teacher when they are far apart (after the response). */
function afterPlacement(repo: Repo, studentId: string, now: Date): void {
  runAfterResponse("readrise.map_gap", () => alertMapGap(repo, studentId, now).catch(() => false), { key: `readrise.map_gap|${studentId}` });
}

/**
 * 👩‍🏫 Lets a student take the placement again — once per term (for the teacher pages). A test the student started
 * and did not finish is restarted instead (any time). A student never placed can take the test at any time.
 */
export async function teacherResetPlacement(repo: Repo, actor: Actor, studentId: string, reason = "", now = new Date()): Promise<{ allowedAt: Date; restarted?: boolean }> {
  const st = await assertStaffForStudent(repo, actor, studentId);
  const status = await placementStatus(repo, studentId, now);
  // a test started and not finished: the teacher restarts it from the first passage (the answers so far are cleared;
  // the row stays, no level is set)
  if (status.open) {
    await repo.updateMany("RRPlacement", { id: s(status.open.id) }, { steps: [], startedAt: now });
    return { allowedAt: now, restarted: true };
  }
  if (!status.last) throw new ValidationError("The student has not taken the placement yet.");
  if (status.retake) throw new ValidationError("A retake is already allowed.");
  if (status.due) throw new ValidationError(`The ${RR_PERIOD_NAME[status.due].toLowerCase()} reading check is open: the student can take the placement now (a retake is already allowed).`);
  // this term (the current academic year's term that contains today), else the last 120 days
  const year = (await repo.findMany("AcademicYear", { schoolId: s(st.schoolId), isCurrent: true }))[0];
  const terms = year ? await repo.findMany("Term", { academicYearId: s(year.id) }) : [];
  const term = terms.find((t) => toDate(t.startDate).getTime() <= now.getTime() && toDate(t.endDate).getTime() >= now.getTime());
  const from = term ? toDate(term.startDate).getTime() : now.getTime() - 120 * 86_400_000;
  // an admin reset (placement-reset.ts) never uses up the teacher's retake of the term
  const used = (await repo.findMany("RRLevelChange", { studentId })).some((c) => s(c.reason).startsWith(RETAKE_REASON) && !s(c.reason).includes(ADMIN_RESET_TAG) && toDate(c.createdAt).getTime() >= from);
  if (used) throw new ValidationError("A placement retake was already allowed this term.");
  const rr = await ensureRRStudent(repo, studentId, now);
  await recordLevelChange(repo, { studentId, schoolId: s(st.schoolId), from: Number(rr.level), to: Number(rr.level), reason: `${RETAKE_REASON} by a teacher${reason.trim() ? `: ${reason.trim()}` : ""}`, now });
  return { allowedAt: now };
}
