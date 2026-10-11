/**
 * 🎯 The ONE place that decides a student's level from ALL their data (used by the Assign window, the Levels page
 * and the start of every adaptive set), the most direct and recent evidence first:
 *   1. a level the teacher chose in the last 30 days
 *   2. their level in this section (Concept Vocabulary / Analyze Craft / Respond), from their own adaptive work
 *   3. their platform results: ONE ability (θ) from all their recent answers (last 42 days, rapid guesses left out,
 *      the item format's guessing floor, recent weeks counting more: ./level-evidence.ts); accuracy only without it
 *   4. the Diagnostic Test — only while valid (under 30% rapid guesses, under 10 weeks old)
 *   5. MAP Reading: Lexile against the grade's Lexile bands
 *   6. MAP: RIT percentile (Below < 41st · On 41st–60th · Above > 60th)
 *   7. a level saved earlier
 *   8. nothing at all → On Level (shown as “no data yet”)
 *
 * 🔊 Fluency is a SECOND AXIS (comprehension evidence × oral reading fluency, as in common reading-placement models):
 * the median of the last 3 fluency checks (last 12 months; national percentile, or one computed from WCPM with the
 * student's grade and the check's season) adjusts the comprehension level found above by at most one band — and only
 * with 2+ checks (Update 39B: one noisy Fluency Coach score used to flip levels; a single check is only noted):
 *   both strong (fluency at the 25th percentile or above)   → the level as found
 *   comprehension On Level but fluency under the 25th       → noted "fluency below"; Below Level when the
 *                                                            comprehension evidence is borderline
 *   comprehension Above Level but fluency under the 25th    → On Level (noted)
 *   both weak                                                → Below Level
 * A level chosen by the teacher or reached in the section's own work is not changed (only noted). `why` lists the
 * sources used, for teachers.
 *
 * ⚖️ Stability (Update 39B): the overall level shown is the one the daily job CONFIRMED (StudentLevelState,
 * ./level-evidence.ts): a new level needs the θ boundary crossed by a margin, 12+ answers since the last change and
 * two evaluations in a row (or 7+ days). Until then the confirmed level is shown with a note on what is pending.
 */
import type { Repo } from "../seeding/repo";
import { lexileBands, levelForLexile } from "./lexile";
import { ladderSettings } from "./ladder-settings";
import { levelsOf, mapSummaries, practiceStats, type Level } from "../insights/student-data";
import { fluencySeason, wcpmPercentile } from "../fluency/norms";
import { diagnosticValid, fluencyAdjustsLevel, fluencySummary, levelForTheta, levelName, levelThetaOf, levelThetas, LEVEL_MIN_ANSWERS, THETA_ABOVE, THETA_BELOW, THETA_BORDERLINE, type FluencyPoint, type LevelTheta } from "./level-evidence";
import type { Row } from "../seeding/repo";

export type Evidence = "TEACHER" | "CATEGORY" | "PLATFORM" | "PLACEMENT" | "LEXILE" | "MAP" | "SAVED" | "NO_DATA";
export const EVIDENCE_NAME: Record<Evidence, string> = { TEACHER: "Set by the teacher", CATEGORY: "Their work in this section", PLATFORM: "Platform results (last 6 weeks)", PLACEMENT: "Diagnostic Test", LEXILE: "MAP Lexile", MAP: "MAP score", SAVED: "Saved level", NO_DATA: "No data yet" };
export const EVIDENCE_SHORT: Record<Evidence, string> = { TEACHER: "teacher", CATEGORY: "own work", PLATFORM: "platform", PLACEMENT: "Diagnostic", LEXILE: "Lexile", MAP: "MAP", SAVED: "saved", NO_DATA: "no data" };
export interface FluencyEvidence { percentile: number | null; wcpm: number; at: string; below: boolean }
export interface EvidenceLevel { level: Level; from: Evidence; reason: string; current: Level | null; currentSource: string | null;
  /** teacher-readable: the sources used and how fluency weighed in */
  why: string;
  fluency: FluencyEvidence | null }
/** fluency under this percentile counts as weak (the norms' "below" edge) */
export const FLUENCY_WEAK_PERCENTILE = 25;
/** comprehension is borderline On Level near the Below edge: θ under this, accuracy under 60%, MAP ≤ 45th, Diagnostic < 70%,
 *  Lexile in the lowest quarter of the On band */
export { THETA_BORDERLINE };
/** accuracy points the level boundary must be crossed by (hysteresis, Update 39B) */
export const ACCURACY_MARGIN = 5;
export const ACCURACY_BORDERLINE = 60, MAP_BORDERLINE = 45, DIAGNOSTIC_BORDERLINE = 70;
const ord = (n: number) => { const t = n % 100; return `${n}${t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`; };

/** Combines the comprehension level with fluency (pure). */
export function withFluency(level: Level, from: Evidence, borderline: boolean, fluency: FluencyEvidence | null): { level: Level; note: string | null } {
  if (!fluency || fluency.percentile === null) return { level, note: null };
  const p = `fluency ${ord(fluency.percentile)} percentile (${fluency.wcpm} WCPM)`;
  if (!fluency.below) return { level, note: `${p}: strong enough` };
  if (from === "TEACHER" || from === "CATEGORY" || from === "NO_DATA" || from === "SAVED") return { level, note: `${p}: fluency below` };
  if (level === "BELOW") return { level, note: `${p}: both comprehension and fluency weak` };
  if (level === "ABOVE") return { level: "ON", note: `${p}: fluency below, so On Level rather than Above` };
  return borderline ? { level: "BELOW", note: `${p}: fluency below and comprehension borderline, so Below Level` } : { level, note: `${p}: fluency below` };
}
const TEACHER_DAYS = 30;
/** ability (θ) boundaries of the overall level (0 = grade level; recalibrated in Update 39B with the guessing floor) */
export { THETA_ABOVE, THETA_BELOW };
const s = (v: unknown) => String(v ?? "");

export interface EvidenceOpts { category?: "CV" | "ACS" | "RTR" | null; subject?: "READING" | "LANGUAGE"; useTeacher?: boolean }

/**
 * What the evidence says NOW, before the stability rule (used by the daily job; `states` gives the current confirmed
 * level so the θ boundary is crossed with the margin).
 */
export async function rawEvidenceLevels(repo: Repo, schoolId: string | null, ids: string[], grade: number, opts: EvidenceOpts = {}, now = new Date(), pre: { thetas?: Map<string, LevelTheta>; states?: Map<string, Row> } = {}): Promise<Map<string, EvidenceLevel>> {
  const out = new Map<string, EvidenceLevel>();
  if (!ids.length) return out;
  const subject = opts.subject ?? "READING";
  const [levels, practice, rules, saved, reading, flu, diag, thetas] = await Promise.all([levelsOf(repo, ids), practiceStats(repo, ids, now), ladderSettings(repo, schoolId), repo.findMany("StudentLevel", { studentId: { in: ids } }), repo.findMany("StudentReadingLexile", { studentId: { in: ids } }),
    repo.findMany("FluencyCheck", { studentId: { in: ids }, checkedAt: { gte: new Date(now.getTime() - 365 * 86_400_000) } }, { select: ["studentId", "wcpm", "percentile", "checkedAt", "source"] }),
    repo.findMany("DiagnosticScore", { studentId: { in: ids } }, { select: ["studentId", "pct", "completedAt", "rapid", "total", "level"] }),
    pre.thetas ? Promise.resolve(pre.thetas) : levelThetas(repo, ids, now)]);
  const at = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  const fluPoints = new Map<string, FluencyPoint[]>();
  for (const f of flu) {
    const when = new Date(at(f.checkedAt));
    const p = f.percentile !== null && f.percentile !== undefined ? Number(f.percentile) : wcpmPercentile(grade, Number(f.wcpm), fluencySeason(when));
    const l = fluPoints.get(s(f.studentId)) ?? []; l.push({ percentile: p, wcpm: Number(f.wcpm), at: when.getTime(), source: s(f.source) }); fluPoints.set(s(f.studentId), l);
  }
  const diagOf = new Map<string, Row>();
  for (const x of [...diag].sort((a, b) => at(a.completedAt) - at(b.completedAt))) diagOf.set(s(x.studentId), x);
  const maps = await mapSummaries(repo, ids, subject, new Map(ids.map((id) => [id, grade])));
  const band = (await lexileBands(repo, schoolId))[grade];
  for (const id of ids) {
    const lv = levels.get(id)!, p = practice.get(id), m = maps.get(id), th = thetas.get(id);
    const base = { current: lv.level, currentSource: lv.source };
    const row = saved.find((x) => s(x.studentId) === id);
    const savedAt = row ? new Date(s(row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt)).getTime() : 0;
    const fs = fluencySummary(fluPoints.get(id) ?? []);
    const fl: FluencyEvidence | null = fs ? { percentile: fs.percentile, wcpm: fs.wcpm, at: fs.at, below: fs.percentile !== null && fs.percentile < FLUENCY_WEAK_PERCENTILE } : null;
    const adjusts = fluencyAdjustsLevel(fs);
    const put = (level: Level, from: Evidence, reason: string, borderline = false) => {
      const f = adjusts ? withFluency(level, from, borderline, fl) : { level, note: fl ? `one fluency check (${fl.percentile}th percentile): not used until a second check confirms it` : null };
      const changed = f.level !== level;
      const fluLabel = fs && fs.checks > 1 ? `Fluency (median of ${fs.checks} checks, latest ${fl!.at})` : `Fluency check ${fl?.at}`;
      const why = `${EVIDENCE_NAME[from]}: ${reason}${f.note ? ` ${fluLabel}: ${f.note}.` : " No fluency check yet."}`;
      out.set(id, { ...base, level: f.level, from, reason: changed || (adjusts && fl?.below && f.note) ? `${reason} ${f.note!.charAt(0).toUpperCase()}${f.note!.slice(1)}.` : reason, why, fluency: fl });
    };
    if (opts.useTeacher !== false && row && s(row.source) === "TEACHER" && now.getTime() - savedAt < TEACHER_DAYS * 86_400_000) { put(s(row.level) as Level, "TEACHER", "Chosen by the teacher."); continue; }
    const cat = opts.category ? lv.categories[opts.category] : undefined;
    if (cat) { put(cat, "CATEGORY", `Reached ${cat.toLowerCase()} level in their own work in this section.`); continue; }
    // adaptive practice keeps every student near 72% correct, so the level comes from the DIFFICULTY they succeed at (θ), not accuracy
    if (th && th.effN >= LEVEL_MIN_ANSWERS) {
      const st = pre.states?.get(id);
      const lt = levelThetaOf(th);
      // while a sustained decline is detected, the move DOWN needs only the plain boundary (the decline test is the
      // confirmation the margin stands for); moves up keep the margin
      const RANK = { BELOW: 0, ON: 1, ABOVE: 2 } as const;
      const withMargin = levelForTheta(lt, st ? (s(st.level) as Level) : null), plain = levelForTheta(lt, null);
      const lvl = th.declining && RANK[plain] < RANK[withMargin] ? plain : withMargin;
      const sg = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
      const trend = th.declining ? ` Falling: ${th.recent ? sg(th.recent.theta) : "?"} in the last 2 weeks vs ${th.prior ? sg(th.prior.theta) : "?"} before${lt < th.theta ? ` — the level uses the recent ${sg(lt)}` : ""}.` : "";
      put(lvl, "PLATFORM", `Ability ${sg(th.theta)} ± ${th.se.toFixed(1)} on ${Math.round(th.effN)} answers (last 6 weeks, recent weeks count more; rapid guesses left out; 0 = grade level).${trend}`, lt < THETA_BORDERLINE);
      continue;
    }
    if (p && p.recentAnswers >= 10 && p.recentAccuracy !== null) {
      // accuracy only without an ability (rare): 80% / 50%, crossed by ±5 points relative to the confirmed level
      const cur = pre.states?.get(id) ? (s(pre.states.get(id)!.level) as Level) : null, m5 = cur ? ACCURACY_MARGIN : 0;
      const acc = p.recentAccuracy, up = rules.upPct + (cur === "ABOVE" ? -m5 : m5), down = 50 - (cur === "BELOW" ? -m5 : m5);
      put(acc >= up ? "ABOVE" : acc < down ? "BELOW" : "ON", "PLATFORM", `${acc}% correct on ${p.recentAnswers} answers (last 30 days).`, acc < ACCURACY_BORDERLINE); continue;
    }
    const dg = diagOf.get(id);
    const dv = diagnosticValid(dg ? { rapid: Number(dg.rapid ?? 0), total: Number(dg.total ?? 0), at: at(dg.completedAt) } : null, now);
    if (lv.level && lv.source === "PLACEMENT" && (!dg || dv.valid)) { const dp = dg ? Number(dg.pct) : undefined; put(lv.level, "PLACEMENT", dp !== undefined ? `From the Diagnostic Test (${Math.round(dp)}%).` : "From the Diagnostic Test.", dp !== undefined && dp < DIAGNOSTIC_BORDERLINE); continue; }
    // the reading Lexile moved by ReadMaster articles is newer than MAP's; else MAP's Lexile
    const rm = reading.find((x) => s(x.studentId) === id && s(x.source) === "READMASTER");
    const lex = rm ? Number(rm.lexile) : m?.lexile ?? null;
    const lexLevel = subject === "READING" && band ? levelForLexile(band, lex) : null;
    if (lexLevel) { put(lexLevel, "LEXILE", `${rm ? "ReadMaster reading" : "MAP"} Lexile ${lex}L (On Level ${band.onMin}–${band.onMax}L).`, lex !== null && lex < band.onMin + (band.onMax - band.onMin) / 4); continue; }
    if (m?.band && m.latest) { put(m.band, "MAP", `MAP ${m.latest.term}: RIT ${m.latest.rit}${m.latest.percentile !== null ? `, ${m.latest.percentile}th percentile` : ""}.`, m.latest.percentile !== null && m.latest.percentile <= MAP_BORDERLINE); continue; }
    if (lv.level && !(lv.source === "PLACEMENT" && dg && !dv.valid)) { put(lv.level, "SAVED", "Their saved level."); continue; }
    put("ON", "NO_DATA", dg && !dv.valid ? `No valid results yet (Diagnostic ${dv.why}): starts at On Level.` : "No results yet: starts at On Level.");
  }
  return out;
}

/**
 * The students' levels as the platform shows and uses them: the evidence (rawEvidenceLevels), with the overall level
 * held at the one the daily job confirmed (StudentLevelState) until a change is confirmed — see the header.
 */
export async function evidenceLevels(repo: Repo, schoolId: string | null, ids: string[], grade: number, opts: EvidenceOpts = {}, now = new Date()): Promise<Map<string, EvidenceLevel>> {
  if (!ids.length) return new Map();
  const states = opts.category ? [] : await repo.findMany("StudentLevelState", { studentId: { in: ids } });
  const stateOf = new Map(states.map((r) => [s(r.studentId), r]));
  // a state confirmed in the last 3 days stands for the student's θ (no need to recompute it here)
  const fresh = (r: Row | undefined) => Boolean(r && now.getTime() - new Date(s(r.evaluatedAt instanceof Date ? r.evaluatedAt.toISOString() : r.evaluatedAt)).getTime() < 3 * 86_400_000);
  const need = ids.filter((id) => !fresh(stateOf.get(id)));
  const thetas = need.length ? await levelThetas(repo, need, now) : new Map<string, LevelTheta>();
  for (const id of ids) {
    const r = stateOf.get(id);
    if (!r || thetas.has(id) || !fresh(r) || r.theta === null || r.theta === undefined) continue;
    const se = Number(r.thetaSE ?? 0.5), n = Number(r.effN ?? 0);
    const est = (v: unknown) => (v === null || v === undefined ? null : { theta: Number(v), se: 0.5, effN: n / 2 });
    thetas.set(id, { theta: Number(r.theta), se, effN: n, answers: n, recent: est(r.thetaRecent), prior: est(r.thetaPrior), declining: Boolean(r.declining), drift: r.thetaRecent !== null && r.thetaRecent !== undefined && r.thetaPrior !== null && r.thetaPrior !== undefined ? Number(r.thetaRecent) - Number(r.thetaPrior) : null, lastAt: 0 });
  }
  const raw = await rawEvidenceLevels(repo, schoolId, ids, grade, opts, now, { thetas, states: stateOf });
  if (opts.category) return raw;
  for (const id of ids) {
    const e = raw.get(id), st = stateOf.get(id);
    if (!e || !st || e.from === "TEACHER" || e.from === "CATEGORY") continue;
    const confirmed = s(st.level) as Level;
    if (confirmed === e.level) continue;
    const since = new Date(s(st.since instanceof Date ? st.since.toISOString() : st.since)).toISOString().slice(0, 10);
    const pending = st.pending && s(st.pending) === e.level ? ` (${Number(st.pendingCount ?? 0)}/2 evaluations)` : "";
    out(e, confirmed, since, pending);
  }
  return raw;
  function out(e: EvidenceLevel, confirmed: Level, since: string, pending: string) {
    const note = `${levelName(confirmed)} since ${since}; the newest evidence points to ${levelName(e.level)} — it changes once that is confirmed${pending}.`;
    e.reason = `${note} ${e.reason}`;
    e.why = `${note} ${e.why}`;
    e.level = confirmed;
  }
}
