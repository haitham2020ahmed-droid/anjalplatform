/**
 * 🧠 The Student Profile: ONE place for where each student is, rebuilt from all their data.
 *
 *   level            Below / On / Above and its source (the platform's single level rule: evidence-level.ts)
 *   MAP              latest Reading and Language RIT; the Weekly Check estimate (Reading)
 *   prediction       the RIT expected at the next MAP term, a range, and the chance of reaching the goal
 *   misconceptions   the student's most frequent wrong-answer patterns (last 30 days)
 *   weakest area     the weakest NWEA instructional area
 *
 * The prediction (Spring RIT and the chance of the Spring goal) comes from the student's OWN evidence:
 *   points   Fall MAP, then the in-year estimates: MAP Winter (full weight) and the latest Weekly Check (half weight)
 *   pace     the growth observed since Fall (RIT per week, a weighted line through the points), blended with the
 *            expected pace (NWEA projected growth, else typical growth for the grade) — the more in-year evidence
 *            and the longer it spans, the more the observed pace counts
 *   Spring   the level now (the points carried to the latest one at that pace) + pace × weeks left to Spring
 *            + a practice nudge (days practised in the last 14: −1.5 at none … +1.5 at 10+)
 *   chance   normal probability that Spring ≥ the goal (Fall RIT + NWEA projected growth); spread 4 RIT with good
 *            in-year evidence, up to 5.5 with only a Fall score
 */
import type { Repo, Row } from "../seeding/repo";
import { evidenceLevels } from "../curriculum-map/evidence-level";
import { mapSummaries, type MapSummary } from "./student-data";
import { detectMisconceptions } from "./misconception-tags";
import { pathContext, planFromContext } from "../graph/learning-path";
import { diagnose, rootGaps, struggling } from "../graph/knowledge-graph";
import { riyadhDay } from "../analytics/practice";
import { groupBy, perWeek, weightedSkillTheta } from "../predict/risk";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** typical Fall → Spring growth (RIT) for grades 4–6 when NWEA's projection was not imported */
const TYPICAL_GROWTH: Record<number, number> = { 3: 9, 4: 8, 5: 7, 6: 6, 7: 5, 8: 4 };
/** weeks from the Fall test to the Spring test (Sept → May) */
export const FALL_TO_SPRING_WEEKS = 32;

export interface Prediction { term: string; rit: number; range: number; goal: number | null; chance: number | null; why: string }
export interface PredictOptions { /** when the Weekly Check estimate was made (ms); default: now */ weeklyAt?: number | null; now?: number }

/** Standard normal CDF. */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Practice nudge (RIT) from the days practised in the last 14: none −1.5, 5 days 0, 10+ days +1.5. Pure. */
export const practiceNudge = (days14: number) => Math.max(-1.5, Math.min(1.5, (days14 - 5) * 0.3));

/** The Spring RIT expected from the student's own evidence and the chance of the Spring goal (pure: profile + tests). */
export function predictNext(m: MapSummary | undefined, grade: number, weeklyEstimate: number | null, practiceDays14: number, opts: PredictOptions = {}): Prediction | null {
  if (!m?.latest) return null;
  const season = String(m.latest.season);
  if (season !== "FALL" && season !== "WINTER") return null; // after Spring the next term is a new school year
  const now = opts.now ?? Date.now();
  const fallRit = m.fall?.rit ?? m.latest.rit;
  const fallAt = m.fall?.date ?? m.latest.date;
  const weekOf = (at: number) => Math.max(0, Math.min(FALL_TO_SPRING_WEEKS, (at - fallAt) / WEEK));
  const yearGrowth = m.springTarget !== null && m.fall ? m.springTarget - m.fall.rit : TYPICAL_GROWTH[grade] ?? 6;
  const expRate = yearGrowth / FALL_TO_SPRING_WEEKS;
  // the evidence: Fall, then in-year points (MAP Winter counts fully; an 8-question Weekly Check half)
  const pts: { rit: number; week: number; w: number; label: string }[] = [{ rit: fallRit, week: 0, w: 1, label: `MAP ${m.fall?.term ?? m.latest.term} ${fallRit}` }];
  if (season === "WINTER" && m.fall) pts.push({ rit: m.latest.rit, week: weekOf(m.latest.date), w: 1, label: `MAP ${m.latest.term} ${m.latest.rit}` });
  if (weeklyEstimate !== null) pts.push({ rit: weeklyEstimate, week: weekOf(opts.weeklyAt ?? now), w: 0.5, label: `Weekly Check ${weeklyEstimate}` });
  const inYear = pts.slice(1);
  const lastWeek = Math.max(...pts.map((p) => p.week));
  // observed pace: weighted least-squares slope through the points
  let rate = expRate, trust = 0;
  if (inYear.length && lastWeek >= 3) {
    const W = pts.reduce((t, p) => t + p.w, 0), mw = pts.reduce((t, p) => t + p.w * p.week, 0) / W, mr = pts.reduce((t, p) => t + p.w * p.rit, 0) / W;
    const sxx = pts.reduce((t, p) => t + p.w * (p.week - mw) ** 2, 0), sxy = pts.reduce((t, p) => t + p.w * (p.week - mw) * (p.rit - mr), 0);
    const slope = sxx > 0 ? sxy / sxx : expRate;
    trust = Math.min(1, lastWeek / 16) * Math.min(1, inYear.reduce((t, p) => t + p.w, 0));
    rate = Math.max(-0.25, Math.min(0.8, trust * slope + (1 - trust) * expRate));
  }
  // the level now: every point carried to the latest one at that pace (weighted)
  const W = pts.reduce((t, p) => t + p.w, 0);
  const level = pts.reduce((t, p) => t + p.w * (p.rit + rate * (lastWeek - p.week)), 0) / W;
  const toSpring = rate * (FALL_TO_SPRING_WEEKS - lastWeek);
  const nudge = practiceNudge(practiceDays14);
  const spring = level + toSpring + nudge;
  const sd = 4 + 1.5 * (1 - trust);
  const goal = m.springTarget;
  const chance = goal !== null ? Math.max(1, Math.min(99, Math.round(100 * phi((spring - goal) / sd)))) : null;
  const parts = [inYear.length ? `${pts.map((p) => p.label).join(" → ")}: ${rate >= 0 ? "+" : ""}${rate.toFixed(2)} RIT a week` : `MAP ${m.latest.term} RIT ${m.latest.rit}`, `+${toSpring.toFixed(1)} expected growth to Spring`];
  if (Math.abs(nudge) >= 0.05) parts.push(`${nudge > 0 ? "+" : ""}${nudge.toFixed(1)} practice (${practiceDays14} of 14 days)`);
  return { term: "Spring", rit: Math.round(spring), range: 5, goal, chance, why: parts.join(" · ") };
}

/** Rebuilds the profiles of a school's students (or only the given ones). Returns how many were saved. */
export async function buildProfiles(repo: Repo, schoolId: string, now = new Date(), only?: string[]): Promise<number> {
  const students = only ? await repo.findMany("Student", { id: { in: only }, schoolId }, { select: ["id", "gradeId"] }) : await repo.findMany("Student", { schoolId }, { select: ["id", "gradeId"] });
  if (!students.length) return 0;
  const grades = new Map((await repo.findMany("Grade", { id: { in: [...new Set(students.map((x) => s(x.gradeId)))] } }, { select: ["id", "level"] })).map((g) => [s(g.id), Number(g.level)]));
  const { areaFromName } = await import("../map/nwea-area");
  let saved = 0;
  const pathCache = new Map<string, unknown>(); // grade-level loads (graph, units, questions, weights) shared by every student
  const since30 = new Date(now.getTime() - 30 * DAY), since14 = now.getTime() - 14 * DAY;
  // the daily rollup is used only when it is fresh (its newest day at most 2 days old), else the raw answers
  const newest = (await repo.findMany("StudentDailyActivity", {}, { select: ["day"], orderBy: [{ field: "day", dir: "desc" }], take: 1 }).catch(() => [] as Row[]))[0];
  const rollupFresh = !!newest && time(newest.day) >= new Date(riyadhDay(now)).getTime() - 2 * DAY;
  for (let i = 0; i < students.length; i += 300) {
    const chunk = students.slice(i, i + 300);
    const ids = chunk.map((x) => s(x.id));
    const gradeOf = new Map(chunk.map((x) => [s(x.id), grades.get(s(x.gradeId)) ?? 0]));
    const [reading, language, weekly, active, abil] = await Promise.all([
      mapSummaries(repo, ids, "READING", gradeOf), mapSummaries(repo, ids, "LANGUAGE", gradeOf),
      repo.findMany("WeeklyCheck", { studentId: { in: ids }, completedAt: { gte: new Date(now.getTime() - 120 * DAY) } }, { select: ["studentId", "ritAfter", "completedAt", "week"] }),
      rollupFresh ? repo.findMany("StudentDailyActivity", { studentId: { in: ids }, day: { gte: new Date(riyadhDay(since14)) } }, { select: ["studentId", "day"] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
      repo.findMany("StudentAbility", { studentId: { in: ids } }, { select: ["studentId", "scope", "theta", "responses"] }),
    ]);
    const detected = await detectMisconceptions(repo, ids, since30);
    const weekBy = groupBy(weekly), abBy = groupBy(abil);
    // the level: the platform's one rule, per grade
    const levels = new Map<string, { level: string; from: string }>();
    for (const g of new Set(gradeOf.values())) {
      const inGrade = ids.filter((id) => gradeOf.get(id) === g);
      for (const [id, e] of await evidenceLevels(repo, schoolId, inGrade, g, { subject: "READING" }, now)) levels.set(id, { level: e.level, from: e.from });
    }
    // practice days (Riyadh school days): from the daily rollup when fresh, else from the answers of the last 14 days
    const days = new Map<string, Set<string>>();
    const addDay = (id: string, d: string) => { const set = days.get(id) ?? new Set(); set.add(d); days.set(id, set); };
    if (rollupFresh) { for (const r of active) addDay(s(r.studentId), new Date(time(r.day)).toISOString().slice(0, 10)); }
    else {
      const rows = await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(since14) } }, { select: ["studentId", "createdAt"] });
      for (const r of rows) addDay(s(r.studentId), riyadhDay(time(r.createdAt)));
    }
    for (const id of ids) {
      const rd = reading.get(id), lg = language.get(id);
      const wk = (weekBy.get(id) ?? []).filter((w) => w.completedAt && w.ritAfter !== null && w.ritAfter !== undefined).sort((a, b) => s(b.week).localeCompare(s(a.week)))[0];
      const est = wk && rd?.latest && time(wk.completedAt) > rd.latest.date ? Number(wk.ritAfter) : null;
      const pDays = days.get(id)?.size ?? 0;
      const pred = predictNext(rd, gradeOf.get(id) ?? 0, est, pDays, { weeklyAt: est !== null ? time(wk!.completedAt) : null, now: now.getTime() });
      const predL = predictNext(lg, gradeOf.get(id) ?? 0, null, pDays, { now: now.getTime() });
      // corrected for chance (a code only shows when an option carries it): src/server/insights/misconception-tags.ts
      const mis = (detected.get(id) ?? []).map((x) => ({ code: x.code, count: x.count, lift: x.lift }));
      const goals = [...(rd?.goals ?? []), ...(lg?.goals ?? [])].sort((a, b) => a.rit - b.rit);
      const weakest = goals.map((g) => areaFromName(g.name.split(":")[0]) ?? areaFromName(g.name)).find((k) => k && k !== "WRITING") ?? null;
      const lv = levels.get(id);
      const data = {
        schoolId, level: lv?.from === "NO_DATA" ? "UNKNOWN" : lv?.level ?? "UNKNOWN", levelSource: lv?.from ?? "NONE", levelAt: now,
        readingRit: rd?.latest?.rit ?? null, languageRit: lg?.latest?.rit ?? null, estReadingRit: est, estLanguageRit: null, lexile: rd?.lexile ?? null,
        theta: weightedSkillTheta(abBy.get(id) ?? []), practiceDays14: pDays,
        predictedTerm: pred?.term ?? predL?.term ?? null, predictedReading: pred?.rit ?? null, predictedLanguage: predL?.rit ?? null, predictedRange: pred?.range ?? predL?.range ?? null,
        goalReading: pred?.goal ?? null, goalChance: pred?.chance ?? null, misconceptions: { list: mis, why: pred?.why ?? null }, weakestArea: weakest,
      };
      // 🕸️ knowledge graph + 🧭 path: mastered / developing skills, root gaps, the next steps, the trajectory
      const intelligence = await profileIntelligence(repo, id, now, pathCache).catch(() => null);
      await repo.upsert("StudentProfile", { studentId: id }, { studentId: id, ...data, intelligence }, { ...data, intelligence });
      saved++;
    }
  }
  return saved;
}

export interface ProfileView { intelligence: ProfileIntelligence | null; level: string; levelSource: string; readingRit: number | null; languageRit: number | null; estReadingRit: number | null; lexile: number | null; predictedTerm: string | null; predictedReading: number | null; predictedLanguage: number | null; goalReading: number | null; goalChance: number | null; predictionWhy: string | null; misconceptions: { code: string; count: number }[]; weakestArea: string | null; practiceDays14: number; updatedAt: string | null }

/** Profiles of these students (null for a student whose profile was not built yet). */
export async function profilesOf(repo: Repo, ids: string[]): Promise<Map<string, ProfileView>> {
  if (!ids.length) return new Map();
  const rows = await repo.findMany("StudentProfile", { studentId: { in: ids } });
  return new Map(rows.map((r) => {
    const mis = (typeof r.misconceptions === "string" ? JSON.parse(r.misconceptions) : r.misconceptions ?? {}) as { list?: { code: string; count: number }[]; why?: string | null };
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return [s(r.studentId), {
      intelligence: (typeof r.intelligence === "string" ? JSON.parse(r.intelligence) : r.intelligence ?? null) as ProfileIntelligence | null,
      level: s(r.level), levelSource: s(r.levelSource), readingRit: n(r.readingRit), languageRit: n(r.languageRit), estReadingRit: n(r.estReadingRit), lexile: n(r.lexile),
      predictedTerm: r.predictedTerm ? s(r.predictedTerm) : null, predictedReading: n(r.predictedReading), predictedLanguage: n(r.predictedLanguage), goalReading: n(r.goalReading), goalChance: n(r.goalChance),
      predictionWhy: mis.why ?? null, misconceptions: Array.isArray(mis.list) ? mis.list : [], weakestArea: r.weakestArea ? s(r.weakestArea) : null, practiceDays14: Number(r.practiceDays14 ?? 0),
      updatedAt: r.updatedAt ? new Date(time(r.updatedAt)).toISOString() : null,
    }];
  }));
}

export interface ProfileIntelligence {
  mastered: { skillId: string; name: string }[];
  developing: { skillId: string; name: string; mastery: number }[];
  missingPrerequisites: { skillId: string; name: string; mastery: number; blocks: string[] }[];
  /** why the student struggles: the skill itself, a weak prerequisite, or one never checked */
  diagnoses: { skillId: string; skillName: string; verdict: string; causes: { name: string; why: string }[]; explanation: string }[];
  path: { skillId: string; name: string; action: string; level: number; why: string[] }[];
  skipped: { name: string; why: string }[];
  trajectory: { week: string; theta: number; mastered: number }[];
  growthPerWeek: number | null; // mastery points per week (last 14 days)
  thetaTrend: number | null;    // ability change per week over the trajectory
}

const monday = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };

/** The intelligence part of one profile; also saves this week's point of the trajectory (AbilitySnapshot "PROFILE"). */
export async function profileIntelligence(repo: Repo, studentId: string, now = new Date(), cache?: Map<string, unknown>): Promise<ProfileIntelligence | null> {
  const c = await pathContext(repo, studentId, now, cache);
  if (!c) return null;
  const plan = planFromContext(c, 5);
  const nodes = [...c.graph.nodes.values()];
  const st = (id: string) => c.states.get(id);
  const mastered = nodes.filter((n) => st(n.id)?.isMastered).map((n) => ({ skillId: n.id, name: n.name }));
  const developing = nodes.filter((n) => { const x = st(n.id); return x && x.attempts > 0 && !x.isMastered; }).map((n) => ({ skillId: n.id, name: n.name, mastery: Math.round(st(n.id)!.mastery) })).sort((a, b) => a.mastery - b.mastery);
  const gaps = rootGaps(c.graph, c.states).slice(0, 5).map((gp) => ({ skillId: gp.skillId, name: gp.name, mastery: gp.mastery, blocks: gp.blocks.map((b) => b.name) }));
  // this week's point: average ability on practised skills and skills mastered
  const th = [...c.states.values()].filter((x) => x.theta !== null && x.attempts >= 3).map((x) => x.theta!);
  const theta = th.length ? Math.round((th.reduce((a, b) => a + b, 0) / th.length) * 100) / 100 : 0;
  const week = monday(now);
  await repo.upsert("AbilitySnapshot", { studentId, scope: "PROFILE", takenOn: week }, { theta, mastery: mastered.length }, { theta, mastery: mastered.length }).catch(() => null);
  const snaps = (await repo.findMany("AbilitySnapshot", { studentId, scope: "PROFILE" }, { orderBy: [{ field: "takenOn", dir: "desc" }], take: 8 })).reverse();
  const trajectory = snaps.map((x) => ({ week: new Date(x.takenOn instanceof Date ? x.takenOn.toISOString() : String(x.takenOn)).toISOString().slice(0, 10), theta: Number(x.theta), mastered: Number(x.mastery ?? 0) }));
  const thetaTrend = trajectory.length >= 2 ? Math.round(((trajectory[trajectory.length - 1].theta - trajectory[0].theta) / (trajectory.length - 1)) * 100) / 100 : null;
  const gain = [...c.velocity.values()].reduce((a, v) => a + v.gain, 0);
  // per week over the days the student was active in the 14-day window (not always two weeks)
  const first = c.velocity.size ? (await repo.findMany("AdaptiveDecisionLog", { studentId, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } }, { select: ["createdAt"], orderBy: [{ field: "createdAt", dir: "asc" }], take: 1 }).catch(() => [] as Row[]))[0] : undefined;
  return {
    mastered, developing: developing.slice(0, 12), missingPrerequisites: gaps,
    diagnoses: nodes.filter((n) => { const x = st(n.id); return x && struggling(x); }).map((n) => diagnose(c.graph, c.states, n.id)).filter((d) => d.verdict !== "NOT_STRUGGLING").slice(0, 4).map((d) => ({ skillId: d.skillId, skillName: d.skillName, verdict: d.verdict, causes: d.causes.map((x) => ({ name: x.name, why: x.why })), explanation: d.explanation })),
    path: plan.steps.map((x) => ({ skillId: x.skillId, name: x.name, action: x.action, level: x.level, why: x.why })),
    skipped: plan.skipped.slice(0, 6).map((x) => ({ name: x.name, why: x.why })),
    trajectory, growthPerWeek: c.velocity.size ? perWeek(gain, first ? time(first.createdAt) : null, now.getTime()) : null, thetaTrend,
  };
}
