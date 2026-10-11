/**
 * 🧭 Support tiers (RTI / MTSS) — the rules, as PURE functions (no database).
 *
 * The idea follows the common three-tier response-to-intervention model: most students (≈80%) do well with core
 * teaching (Tier 1), some (≈15%) need small-group support on a skill (Tier 2), a few (≈5%) need intensive, frequent
 * support (Tier 3). Progress is checked more often the higher the tier. All numbers below are the school's starting
 * values and are kept together here so they are easy to read and change.
 *
 * A CHECK (Weekly Check, reteach re-check, text-set progress check) is read as an ability on the grade scale
 * (θ, 0 = grade level, from its answers with the item format's guessing floor — Weekly Checks are aimed at the
 * student's own level, so their % correct is not comparable between students); rapid guesses are left out, and a
 * check with 30%+ rapid guesses is INVALID (never used; the teacher is asked to re-test). Without answers to read,
 * its % correct is used. A check is VERY LOW (θ ≤ −1.5 or under 40%), LOW (θ ≤ −0.6 or under 60%), STRONG
 * (80%+ or θ ≥ −0.3: at grade level) or OK.
 *
 * TIER 3 (intensive) when ANY of:
 *   - the latest MAP Reading percentile (this school year) is under the 10th
 *   - the fluency percentile (median of the last checks; one Fluency Coach score alone does not count) is < 10th
 *     AND the comprehension evidence is low as well
 *   - two checks in a row are VERY LOW (or one VERY LOW check of 10+ items)
 *   - two finished interventions in a row brought no gain
 * TIER 2 (targeted) when ANY of:
 *   - the early-warning risk is ≥ 65 (only after 3 weeks and 30+ answers on the platform: before that it measures
 *     missing data, not reading) AND an academic source agrees (MAP ≤ 40th, a low check, fluency < 40th, the
 *     confirmed platform level Below, or a decline) — risk alone (practice habits, guessing) is only noted
 *   - the latest MAP Reading percentile is 10th–25th
 *   - the fluency percentile is < 25th
 *   - a VALID Diagnostic Test (under 30% rapid guesses, under 10 weeks old, not contradicted by 2 newer checks)
 *     placed the student Below Level AND an academic source agrees (as for the risk) — one test alone is noted
 *   - two checks in a row are LOW (or one LOW check of 10+ items)
 *   - a sustained decline on the platform has taken the student's confirmed level to Below
 * otherwise TIER 1 (core). With NO current-year evidence at all the student is "Not yet screened" (Tier 1).
 * A tier that rests only on MAP is PROVISIONAL ("from Fall MAP") until the first platform checks confirm it.
 *
 * Stability (Update 39B — 30.5% of students reversed tiers twice in 6 weeks): a student stays at least 14 days in
 * a tier; more support comes sooner only when two different sources agree. Less support needs exit evidence — two
 * checks in a row STRONG (80%+ or at grade level; or both not low and together — precision-weighted — at grade
 * level), or a risk under 40 for 4+ weeks with fluency at the 25th
 * percentile or above — and goes one tier at a time. Two strong checks taken after the MAP test / the Diagnostic
 * outweigh that older result.
 *
 * Monitoring: Tier 1 is checked with the school's three yearly benchmarks (0 = no extra checks), Tier 2 every 14
 * days, Tier 3 every 7 days. Tier 3 with no gain after two interventions is flagged "refer for further evaluation".
 */

export type Tier = 1 | 2 | 3;

export const TIER_RULES = {
  /** Tier 3 */
  T3_MAP_PERCENTILE: 10,
  T3_FLUENCY_PERCENTILE: 10,
  /** % correct of a check without readable answers (criterion: grade-level items) */
  T3_CHECK_PCT: 40,
  T3_FAILED_INTERVENTIONS: 2,
  /** Tier 2 */
  T2_RISK: 65,
  T2_MAP_PERCENTILE: 25,
  /** a risk score or one Diagnostic needs an academic source pointing the same way: MAP at or under this percentile… */
  CORROBORATE_MAP_PERCENTILE: 40,
  /** …or fluency (2+ checks) under this percentile (or a low check, platform level Below, a decline) */
  CORROBORATE_FLUENCY_PERCENTILE: 40,
  T2_FLUENCY_PERCENTILE: 25,
  T2_CHECK_PCT: 60,
  /** a check's ability (θ, 0 = grade level): low / very low / at grade level */
  CHECK_LOW_THETA: -0.6,
  CHECK_VERY_LOW_THETA: -1.5,
  CHECK_EXIT_THETA: -0.3,
  /** one check alone may move a tier only with this many (valid) items; else two checks in a row */
  MIN_ITEMS_ALONE: 10,
  /** exit (moving down) */
  EXIT_CHECK_PCT: 80,
  EXIT_CHECKS_IN_A_ROW: 2,
  EXIT_RISK: 40,
  EXIT_RISK_WEEKS: 4,
  EXIT_FLUENCY_PERCENTILE: 25,
  /** minimum days in a tier before it changes (unless two sources agree on more support) */
  MIN_DWELL_DAYS: 14,
  /** the early-warning risk counts for tiers only after this much platform history */
  RISK_MIN_DAYS: 21,
  RISK_MIN_ANSWERS: 30,
  /** MAP older than this is not current-year evidence */
  MAP_CURRENT_DAYS: 300,
  /** a Diagnostic older than this no longer counts (≈ 10 school weeks) */
  DIAGNOSTIC_VALID_DAYS: 70,
  /** comprehension counts as low under these */
  LOW_COMPREHENSION_PCT: 60,
  LOW_MASTERY: 50,
  /** an intervention "worked" for a student with a mastery gain of at least this */
  INTERVENTION_GAIN: 5,
  /** …judged only when the student gave this many careful (not rapid-guess) answers on the skill during it: a
   *  student who guessed through an intervention did not "fail to respond" to it (Update 39B, referral decisions) */
  INTERVENTION_MIN_ANSWERS: 8,
} as const;

/** Days between progress checks for each tier (Tier 1: 0 = the three yearly benchmarks). */
export const MONITOR_EVERY_DAYS: Record<Tier, number> = { 1: 0, 2: 14, 3: 7 };
/** The expected share of students in each tier (the usual RTI pyramid). */
export const EXPECTED_SHARE: Record<Tier, number> = { 1: 80, 2: 15, 3: 5 };
export const TIER_NAME: Record<Tier, string> = { 1: "Tier 1 · Core", 2: "Tier 2 · Targeted", 3: "Tier 3 · Intensive" };
export const REFER_TEXT = "Refer for further evaluation";
export const NOT_SCREENED_TEXT = "Not yet screened";

const DAY = 86_400_000;

/** a completed check: a Weekly Check, a reteach re-check, or a text-set progress check (src/server/progress-checks) */
export interface CheckPoint {
  at: Date; pct: number; kind: "WEEKLY" | "RECHECK" | "PROGRESS";
  /** valid (not rapid) items answered; ability from them (θ, 0 = grade level) and its standard error */
  items?: number; theta?: number | null; se?: number | null;
  /** 30%+ rapid guesses: not used for any decision */
  invalid?: boolean; rapid?: number;
}
export interface TierEvidenceInput {
  current: { tier: Tier; since: Date } | null;
  /** valid = under 30% rapid guesses (a stale or contradicted result is dropped by the rules) */
  diagnostic: { pct: number; level: "BELOW" | "ON" | "ABOVE"; at: Date; valid?: boolean; why?: string | null } | null;
  /** term = e.g. "Fall 2026" (shown with the label: "Fall MAP") */
  map: { percentile: number | null; at: Date; rit?: number | null; term?: string | null } | null;
  /** completed checks (Weekly Checks, re-check sets and text-set progress checks), any order */
  checks: CheckPoint[];
  /** practice on the skills worked on in the last 30 days */
  practice: { avgMastery: number | null; skills: number; weakSkill: { skillId: string; name?: string; mastery: number } | null };
  risk: number | null;
  /** risk history (daily snapshots), any order */
  riskHistory: { at: Date; score: number }[];
  /** usable = 2+ checks (median) or one entered by the teacher; checks = how many */
  fluency: { percentile: number | null; wcpm: number; at: Date; comprehension?: number | null; usable?: boolean; checks?: number } | null;
  /** finished interventions the student was part of */
  interventions: { endedAt: Date; skillId: string; gain: number; /** careful (not rapid) answers on the skill during it; under INTERVENTION_MIN_ANSWERS = not judged */ validAnswers?: number }[];
  /** platform history (risk counts only after RISK_MIN_DAYS and RISK_MIN_ANSWERS); omitted = enough */
  platform?: { days: number; answers: number } | null;
  /** the confirmed overall level (StudentLevelState) and the decline check */
  level?: { level: "BELOW" | "ON" | "ABOVE"; source: string; declining: boolean; theta: number | null; recentTheta?: number | null; priorTheta?: number | null } | null;
}

export interface TierDecision {
  tier: Tier;
  /** teacher-readable English */
  reason: string;
  focusSkillId: string | null;
  monitorEveryDays: number;
  refer: boolean;
  /** true when the rules point elsewhere but the stability rules keep the tier for now */
  held: boolean;
  /** rule codes that fired */
  triggers: string[];
  evidence: Record<string, unknown>;
  /** the tier rests only on MAP (no platform check yet): provisional */
  provisional?: boolean;
}

const pct = (n: number) => `${Math.round(n)}%`;
const ord = (n: number) => { const v = Math.round(n), t = v % 100; return `${v}${t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][v % 10] ?? "th"}`; };
const sgn = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;

export type CheckSignal = "VERY_LOW" | "LOW" | "OK" | "STRONG";
/** How one (valid) check reads (pure). */
export function checkSignal(c: CheckPoint): CheckSignal {
  const R = TIER_RULES;
  if (c.pct >= R.EXIT_CHECK_PCT) return "STRONG";
  if (c.theta !== null && c.theta !== undefined) {
    if (c.theta <= R.CHECK_VERY_LOW_THETA) return "VERY_LOW";
    if (c.theta <= R.CHECK_LOW_THETA) return "LOW";
    return c.theta >= R.CHECK_EXIT_THETA ? "STRONG" : "OK";
  }
  return c.pct < R.T3_CHECK_PCT ? "VERY_LOW" : c.pct < R.T2_CHECK_PCT ? "LOW" : "OK";
}
const isLow = (x: CheckSignal) => x === "LOW" || x === "VERY_LOW";
/** "8 items: 63%, ability −0.4 ± 0.6" — what the teacher sees about one check */
export function checkText(c: CheckPoint): string {
  const n = c.items ?? null;
  return `${pct(c.pct)}${n !== null ? ` of ${n} item${n === 1 ? "" : "s"}` : ""}${c.theta !== null && c.theta !== undefined ? `, ability ${sgn(c.theta)}${c.se ? ` ± ${c.se.toFixed(1)}` : ""}` : ""}`;
}
/** Combined confidence of the last two checks: precision-weighted ability and its standard error. */
export function pooledChecks(cs: CheckPoint[]): { theta: number; se: number; items: number } | null {
  const xs = cs.filter((c) => c.theta !== null && c.theta !== undefined && c.se);
  if (!xs.length) return null;
  const w = xs.map((c) => 1 / (c.se! * c.se!)), W = w.reduce((a, b) => a + b, 0);
  return { theta: xs.reduce((t, c, i) => t + w[i] * c.theta!, 0) / W, se: Math.sqrt(1 / W), items: xs.reduce((t, c) => t + (c.items ?? 0), 0) };
}

/** Comprehension evidence counts as low (used with fluency for Tier 3). */
export function comprehensionLow(e: TierEvidenceInput): boolean {
  const R = TIER_RULES;
  return (e.diagnostic?.level === "BELOW" && e.diagnostic.valid !== false)
    || (e.map?.percentile !== null && e.map?.percentile !== undefined && e.map.percentile <= R.T2_MAP_PERCENTILE)
    || checksPointLow(e.checks)
    || (e.practice.avgMastery !== null && e.practice.skills > 0 && e.practice.avgMastery < R.LOW_MASTERY)
    || (e.fluency?.comprehension !== null && e.fluency?.comprehension !== undefined && e.fluency.comprehension < R.LOW_COMPREHENSION_PCT);
}

const sortedChecks = (c: CheckPoint[]) => [...c].sort((a, b) => a.at.getTime() - b.at.getTime());
/**
 * The recent checks point LOW (Update 39B — one 8-item check is too noisy to corroborate anything on its own): the
 * last two valid checks together (precision-weighted ability ≤ CHECK_LOW_THETA, or both low by % correct), or one
 * long check (MIN_ITEMS_ALONE+ items) that is low.
 */
export function checksPointLow(list: CheckPoint[]): boolean {
  const cs = sortedChecks(list.filter((c) => !c.invalid));
  const last = cs.at(-1), prev = cs.at(-2);
  if (!last) return false;
  if (isLow(checkSignal(last)) && (last.items ?? 0) >= TIER_RULES.MIN_ITEMS_ALONE) return true;
  if (!prev) return false;
  const p = pooledChecks([prev, last]);
  if (p && [prev, last].every((c) => c.theta !== null && c.theta !== undefined)) return p.theta <= TIER_RULES.CHECK_LOW_THETA;
  return isLow(checkSignal(prev)) && isLow(checkSignal(last));
}

/** Interventions in a row (most recent first) that brought no gain. */
export function failedInterventionsInARow(list: TierEvidenceInput["interventions"]): number {
  let n = 0;
  for (const x of [...list].sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime())) {
    if (x.validAnswers !== undefined && x.validAnswers < TIER_RULES.INTERVENTION_MIN_ANSWERS) continue; // not judged (no careful work)
    if (x.gain >= TIER_RULES.INTERVENTION_GAIN) break;
    n++;
  }
  return n;
}

/** Risk under the exit line for the whole of the last 4 weeks (with snapshots covering that time). */
export function lowRiskForWeeks(history: TierEvidenceInput["riskHistory"], now: Date, weeks: number = TIER_RULES.EXIT_RISK_WEEKS): boolean {
  const from = now.getTime() - weeks * 7 * DAY;
  const h = history.filter((x) => x.at.getTime() >= from - 3 * DAY);
  if (!h.length) return false;
  const oldest = Math.min(...h.map((x) => x.at.getTime()));
  return oldest <= from + 3 * DAY && h.every((x) => x.score < TIER_RULES.EXIT_RISK);
}

/** "Fall MAP" / "Winter MAP" … from the term name (or just "MAP"). */
export function mapLabel(term: string | null | undefined): string {
  const m = String(term ?? "").match(/fall|winter|spring|summer/i);
  return m ? `${m[0].charAt(0).toUpperCase()}${m[0].slice(1).toLowerCase()} MAP` : "MAP";
}

/** Decides a student's tier from their evidence. Pure. */
export function decideTier(e: TierEvidenceInput, now: Date = new Date()): TierDecision {
  const R = TIER_RULES;
  const all = sortedChecks(e.checks);
  const invalidChecks = all.filter((c) => c.invalid);
  const checks = all.filter((c) => !c.invalid);
  const last = checks.at(-1) ?? null, prev = checks.at(-2) ?? null;
  const lastTwo = last && prev ? [prev, last] : null;
  const sig = (c: CheckPoint | null) => (c ? checkSignal(c) : null);
  const sl = sig(last), sp = sig(prev);
  const pooled = lastTwo ? pooledChecks(lastTwo) : last ? pooledChecks([last]) : null;
  // exit evidence from checks: both STRONG, or both not low and TOGETHER at grade level (the precision-weighted
  // ability of the two checks ≥ CHECK_EXIT_THETA — two 8-item checks pooled are far less noisy than either alone)
  const pooledExit = Boolean(lastTwo && sl && sp && !isLow(sl) && !isLow(sp) && pooled && lastTwo.every((c) => c.theta !== null && c.theta !== undefined) && pooled.theta >= R.CHECK_EXIT_THETA);
  const strongRun = Boolean(lastTwo && ((sl === "STRONG" && sp === "STRONG") || pooledExit));
  const conf = pooled ? ` (${lastTwo ? "last 2 checks" : "1 check"}, ${pooled.items} items: ability ${sgn(pooled.theta)} ± ${pooled.se.toFixed(1)})` : "";
  // recent strong checks outweigh an older MAP / Diagnostic result
  const supersedes = (at: Date | undefined) => Boolean(strongRun && at && lastTwo!.every((c) => c.at.getTime() > at.getTime()));
  const mapCurrent = Boolean(e.map && now.getTime() - e.map.at.getTime() <= R.MAP_CURRENT_DAYS * DAY);
  const mapP = e.map && mapCurrent && e.map.percentile !== null && !supersedes(e.map.at) ? e.map.percentile : null;
  const mapName = `${mapLabel(e.map?.term)}${e.map ? ` (${e.map.at.toISOString().slice(0, 10)})` : ""}`;
  // the Diagnostic counts while valid: not rapid-guessed, under 10 weeks old, not contradicted by 2 newer checks
  const diagNewer = e.diagnostic ? checks.filter((c) => c.at.getTime() > e.diagnostic!.at.getTime() && !isLow(checkSignal(c))).length : 0;
  const diagDrop = !e.diagnostic ? null
    : e.diagnostic.valid === false ? (e.diagnostic.why ?? "invalid: too many rapid guesses — re-test")
    : now.getTime() - e.diagnostic.at.getTime() > R.DIAGNOSTIC_VALID_DAYS * DAY ? `older than ${Math.round(R.DIAGNOSTIC_VALID_DAYS / 7)} weeks`
    : diagNewer >= 2 ? `${diagNewer} newer checks disagree` : supersedes(e.diagnostic.at) ? "outweighed by 2 strong newer checks" : null;
  const diagBelow = e.diagnostic?.level === "BELOW" && diagDrop === null;
  const fluUsable = Boolean(e.fluency && e.fluency.usable !== false);
  const fluP = fluUsable ? e.fluency?.percentile ?? null : null;
  const compLow = comprehensionLow({ ...e, map: mapP === null ? null : e.map, diagnostic: diagBelow ? e.diagnostic : null });
  const failed = failedInterventionsInARow(e.interventions);
  const riskCounts = !e.platform || (e.platform.days >= R.RISK_MIN_DAYS && e.platform.answers >= R.RISK_MIN_ANSWERS);
  const lowAlone = (c: CheckPoint | null) => Boolean(c && (c.items ?? 0) >= R.MIN_ITEMS_ALONE);
  const checksVeryLow = Boolean((sl === "VERY_LOW" && sp === "VERY_LOW") || (sl === "VERY_LOW" && lowAlone(last)));
  const checksLow = !checksVeryLow && Boolean((sl && sp && isLow(sl) && isLow(sp)) || (sl && isLow(sl) && lowAlone(last)));
  const declineBelow = Boolean(e.level?.declining && e.level.level === "BELOW");
  // Update 39B: an early-warning risk (engagement + prediction) or ONE Diagnostic is not reading evidence on its own:
  // each moves a tier only when an academic source points the same way (MAP ≤ 40th, a low check, fluency under the
  // 40th from 2+ checks, the confirmed platform level Below, or a sustained decline). Otherwise it is only noted.
  const concern: string[] = [];
  if (mapP !== null && mapP <= R.CORROBORATE_MAP_PERCENTILE) concern.push(`${mapLabel(e.map?.term)} ${ord(mapP)} percentile`);
  if (checksPointLow(checks)) concern.push(lastTwo && pooled ? `the last 2 checks low (ability ${sgn(pooled.theta)} ± ${pooled.se.toFixed(1)})` : `low checks (last ${checkText(last!)})`);
  if (fluP !== null && fluP < R.CORROBORATE_FLUENCY_PERCENTILE) concern.push(`fluency ${ord(fluP)} percentile`);
  if (e.level?.level === "BELOW" && e.level.source === "PLATFORM") concern.push("platform level Below");
  if (e.level?.declining) concern.push("a sustained decline");
  const riskHigh = e.risk !== null && e.risk >= R.T2_RISK && riskCounts;

  const t3: string[] = [], t2: string[] = [], codes: string[] = [];
  const kinds3 = new Set<string>(), kinds2 = new Set<string>();
  const add = (tier: 2 | 3, kind: string, code: string, text: string) => { (tier === 3 ? t3 : t2).push(text); codes.push(code); (tier === 3 ? kinds3 : kinds2).add(kind); };
  if (mapP !== null && mapP < R.T3_MAP_PERCENTILE) add(3, "MAP", "T3_MAP", `${mapName}: Reading at the ${ord(mapP)} percentile (under the ${R.T3_MAP_PERCENTILE}th)`);
  if (fluP !== null && fluP < R.T3_FLUENCY_PERCENTILE && compLow) add(3, "FLUENCY", "T3_FLUENCY", `fluency at the ${ord(fluP)} percentile${(e.fluency?.checks ?? 1) > 1 ? ` (median of ${e.fluency!.checks} checks)` : ""} with low comprehension`);
  if (checksVeryLow) add(3, "CHECKS", "T3_CHECKS", lastTwo && sp === "VERY_LOW" ? `two checks in a row very low (${checkText(prev!)}; ${checkText(last!)})${conf}` : `a long check very low (${checkText(last!)})`);
  if (failed >= R.T3_FAILED_INTERVENTIONS) add(3, "INTERVENTIONS", "T3_NO_GAIN", `no gain after ${failed} interventions`);
  if (riskHigh && concern.length) add(2, "RISK", "T2_RISK", `early-warning risk ${e.risk} (${R.T2_RISK}+) with ${concern.join(", ")}`);
  if (mapP !== null && mapP <= R.T2_MAP_PERCENTILE && mapP >= R.T3_MAP_PERCENTILE) add(2, "MAP", "T2_MAP", `${mapName}: Reading at the ${ord(mapP)} percentile`);
  if (fluP !== null && fluP < R.T2_FLUENCY_PERCENTILE && !codes.includes("T3_FLUENCY")) add(2, "FLUENCY", "T2_FLUENCY", `fluency at the ${ord(fluP)} percentile (under the ${R.T2_FLUENCY_PERCENTILE}th${(e.fluency?.checks ?? 1) > 1 ? `, median of ${e.fluency!.checks} checks` : ""})`);
  if (diagBelow && concern.length) add(2, "DIAGNOSTIC", "T2_DIAGNOSTIC", `Diagnostic Test Below Level (${pct(e.diagnostic!.pct)}, ${e.diagnostic!.at.toISOString().slice(0, 10)}) with ${concern.join(", ")}`);
  if (checksLow) add(2, "CHECKS", "T2_CHECK", lastTwo && sp && isLow(sp) ? `two checks in a row below grade level (${checkText(prev!)}; ${checkText(last!)})${conf}` : `a long check below grade level (${checkText(last!)})`);
  if (declineBelow) add(2, "DECLINE", "T2_DECLINE", `a sustained decline on the platform (ability ${e.level!.priorTheta !== null && e.level!.priorTheta !== undefined ? sgn(e.level!.priorTheta) : "?"} → ${e.level!.recentTheta !== null && e.level!.recentTheta !== undefined ? sgn(e.level!.recentTheta) : "?"}) has taken the level to Below`);

  const screened = riskHigh || mapCurrent || Boolean(e.diagnostic && diagDrop === null) || checks.length > 0 || fluUsable || Boolean(e.level && e.level.source === "PLATFORM") || (riskCounts && Boolean(e.platform)) || e.interventions.length > 0;
  const rulesTier: Tier = t3.length ? 3 : t2.length ? 2 : 1;
  let tier = rulesTier, held = false, holdWhy = "";
  const current = e.current?.tier ?? null;
  const dwell = e.current ? (now.getTime() - e.current.since.getTime()) / DAY : Infinity;
  const exitByChecks = strongRun;
  const exitByRisk = e.risk !== null && e.risk < R.EXIT_RISK && lowRiskForWeeks(e.riskHistory, now) && (fluP === null || fluP >= R.EXIT_FLUENCY_PERCENTILE);
  if (current !== null && rulesTier > current) {
    // more support: at once when two different sources agree, else after the minimum time in the current tier
    const agree = new Set([...kinds3, ...(rulesTier === 2 ? kinds2 : [])]).size;
    if (agree < 2 && dwell < R.MIN_DWELL_DAYS) { tier = current; held = true; holdWhy = `the evidence points to Tier ${rulesTier} (${[...t3, ...t2].join("; ")}), but one source is not enough to change within ${R.MIN_DWELL_DAYS} days`; }
  } else if (current !== null && rulesTier < current) {
    if (!(exitByChecks || exitByRisk)) { tier = current; held = true; holdWhy = `exit evidence needed: ${R.EXIT_CHECKS_IN_A_ROW} checks in a row at ${R.EXIT_CHECK_PCT}%+ or at grade level (last: ${last ? checkText(last) : "none yet"}), or risk under ${R.EXIT_RISK} for ${R.EXIT_RISK_WEEKS}+ weeks`; }
    else if (dwell < R.MIN_DWELL_DAYS) { tier = current; held = true; holdWhy = `the exit evidence is there; tiers change at most every ${R.MIN_DWELL_DAYS} days`; }
    else tier = (current - 1) as Tier; // one tier at a time
  }
  if (held) codes.push("HOLD");
  const provisional = tier >= 2 && !held && [...kinds3, ...kinds2].every((k) => k === "MAP") && checks.length === 0;
  if (provisional) codes.push("PROVISIONAL");

  const refer = tier === 3 && failed >= R.T3_FAILED_INTERVENTIONS;
  const focus = tier >= 2 ? e.practice.weakSkill?.skillId ?? null : null;
  let reason: string;
  if (!screened && current === null || (!screened && current === 1)) { reason = `${NOT_SCREENED_TEXT}: no current-year evidence yet (MAP, Diagnostic, checks or fluency). Tier 1 until the first results arrive.`; codes.push("NOT_SCREENED"); tier = 1; held = false; }
  else if (held) reason = `Stays in Tier ${tier} for now: ${holdWhy}.`;
  else if (tier === 3) reason = `${provisional ? `Provisional (from ${mapLabel(e.map?.term)}, until the first platform checks confirm it) · ` : ""}Tier 3: ${t3.join("; ")}.`;
  else if (tier === 2) reason = `${provisional ? `Provisional (from ${mapLabel(e.map?.term)}, until the first platform checks confirm it) · ` : ""}Tier 2: ${(t2.length ? t2 : t3).join("; ")}.`;
  else if (current !== null && current > 1) reason = `Back to Tier ${tier}: ${exitByChecks ? `${R.EXIT_CHECKS_IN_A_ROW} checks in a row at ${R.EXIT_CHECK_PCT}%+ or at grade level (${checkText(prev!)}; ${checkText(last!)})${conf}` : `risk under ${R.EXIT_RISK} for ${R.EXIT_RISK_WEEKS}+ weeks`}.`;
  else reason = checks.length || e.map || e.diagnostic || e.fluency ? `Tier 1: on track with core teaching${last ? ` (last check ${checkText(last)})` : ""}.` : "Tier 1: no warning signs yet (little data so far).";
  if (tier === 2 && current === 3 && !held && rulesTier === 1) reason = `Down to Tier 2 (one tier at a time): ${exitByChecks ? `${R.EXIT_CHECKS_IN_A_ROW} checks in a row at ${R.EXIT_CHECK_PCT}%+ or at grade level (${checkText(prev!)}; ${checkText(last!)})${conf}` : `risk under ${R.EXIT_RISK} for ${R.EXIT_RISK_WEEKS}+ weeks`}.`;
  if (invalidChecks.length && invalidChecks.at(-1)!.at.getTime() > (last?.at.getTime() ?? 0)) reason += ` The latest check was not used: ${invalidChecks.at(-1)!.rapid ?? "many"} rapid guesses — re-test.`;
  if (e.diagnostic && diagDrop && e.diagnostic.level === "BELOW") reason += ` Diagnostic Below not used (${diagDrop}).`;
  if (diagBelow && !concern.length) reason += ` Diagnostic Below (${pct(e.diagnostic!.pct)}) noted: one test alone does not set a tier — the first checks confirm or overrule it.`;
  if (riskHigh && !concern.length) reason += ` Early-warning risk ${e.risk} noted (practice habits): not a reading tier signal on its own — see the alerts.`;
  if (e.fluency && !fluUsable && e.fluency.percentile !== null && e.fluency.percentile < R.T2_FLUENCY_PERCENTILE) reason += ` One fluency score (${ord(e.fluency.percentile)} percentile) is noted, not used until a second check confirms it.`;
  if (tier === 1 && !codes.includes("NOT_SCREENED") && e.level?.level === "BELOW" && e.level.source === "PLATFORM") reason += ` Their platform level is Below${e.level.theta !== null && e.level.theta !== undefined ? ` (ability ${sgn(e.level.theta)})` : ""}, but no second source supports Tier 2 yet — watch the next checks.`;
  if (refer) reason += ` ${REFER_TEXT}: Tier 3 with no gain after ${failed} interventions.`;
  if (focus && e.practice.weakSkill) reason += ` Focus: ${e.practice.weakSkill.name ?? "weakest current skill"} (mastery ${Math.round(e.practice.weakSkill.mastery)}).`;

  return {
    tier, reason, focusSkillId: focus, monitorEveryDays: MONITOR_EVERY_DAYS[tier], refer, held, triggers: codes, provisional,
    evidence: {
      rulesTier, map: e.map ? { percentile: e.map.percentile, at: e.map.at.toISOString().slice(0, 10), term: e.map.term ?? null, current: mapCurrent, outweighed: e.map.percentile !== null && mapCurrent && mapP === null } : null,
      diagnostic: e.diagnostic ? { pct: e.diagnostic.pct, level: e.diagnostic.level, at: e.diagnostic.at.toISOString().slice(0, 10), used: diagDrop === null, dropped: diagDrop } : null,
      checks: all.slice(-4).map((c) => ({ at: c.at.toISOString().slice(0, 10), pct: Math.round(c.pct), kind: c.kind, items: c.items ?? null, theta: c.theta ?? null, se: c.se ?? null, invalid: Boolean(c.invalid), signal: c.invalid ? "INVALID" : checkSignal(c) })),
      confidence: pooled ? { theta: Math.round(pooled.theta * 100) / 100, se: Math.round(pooled.se * 100) / 100, items: pooled.items } : null,
      fluency: e.fluency ? { percentile: e.fluency.percentile, wcpm: e.fluency.wcpm, at: e.fluency.at.toISOString().slice(0, 10), checks: e.fluency.checks ?? 1, used: fluUsable } : null,
      risk: e.risk, riskUsed: riskCounts, avgMastery: e.practice.avgMastery, failedInterventions: failed, comprehensionLow: compLow,
      level: e.level ?? null, dwellDays: Number.isFinite(dwell) ? Math.round(dwell) : null, sources: { t3: [...kinds3], t2: [...kinds2] },
    },
  };
}

/** The date of the next progress check: the last check (or the tier start) + the tier's cadence; null for Tier 1. */
export function nextCheckAt(tier: Tier, since: Date, lastCheck: Date | null): Date | null {
  const every = MONITOR_EVERY_DAYS[tier];
  if (!every) return null;
  const from = lastCheck && lastCheck.getTime() > since.getTime() ? lastCheck : since;
  return new Date(from.getTime() + every * DAY);
}
