/**
 * 🚨 Predictive learning analytics: the early warning.
 *
 * For every student, from their own data on the platform:
 *   practice days (last 14 and the 14 before: is practice declining?) · mastery gained per week · ability (θ) ·
 *   the chance of the MAP goal (src/server/insights/student-profile.ts) · weak foundations (knowledge graph) ·
 *   rapid guessing · the latest Weekly Check change · whether the last intervention helped · MAP data at all.
 * → risk = probability of NOT reaching the MAP goal (logistic model), with the reasons that push it up and the
 *   actions that answer each reason. The model starts from expert weights and, once enough students have a MAP
 *   outcome, the school's own data re-fits them (trainRiskModel); the learned model is used only when it predicts
 *   better than the expert one on students it has not seen.
 */
import type { Repo, Row } from "../seeding/repo";
import { riyadhDay } from "../analytics/practice";
import { seasonOf } from "../map/rit";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();

export const FEATURES = ["lowPractice", "decliningPractice", "slowGrowth", "lowAbility", "lowGoalChance", "weakFoundations", "guessing", "weeklyDrop", "interventionFailed", "noMap"] as const;
export type FeatureKey = (typeof FEATURES)[number];
export type FeatureVector = Record<FeatureKey, number>;
export interface RiskWeights { bias: number; w: Record<FeatureKey, number> }

export const EXPERT_WEIGHTS: RiskWeights = {
  bias: -0.2, // about half of students nationally meet their NWEA growth projection → a typical student starts near 45%
  w: { lowPractice: 0.6, decliningPractice: 0.4, slowGrowth: 0.35, lowAbility: 0.8, lowGoalChance: 1.1, weakFoundations: 0.3, guessing: 0.6, weeklyDrop: 0.3, interventionFailed: 0.4, noMap: 0.2 },
};

export interface RawSignals { days14: number; daysPrev14: number; growthPerWeek: number | null; theta: number | null; goalChance: number | null; rootGaps: number; rapidRate: number; weeklyChange: number | null; interventionFailed: boolean; hasMap: boolean; weakSkill: string | null }

/** Raw signals → standardised features (positive = more risk). Pure. */
export function featuresOf(r: RawSignals): FeatureVector {
  return {
    // Good signals are capped so one strong habit cannot push the risk to ~0% (keeps probabilities honest).
    lowPractice: Math.max(-1, (6 - r.days14) / 4),
    decliningPractice: Math.max(0, r.daysPrev14 - r.days14) / 4,
    slowGrowth: r.growthPerWeek === null ? 0.5 : Math.max(-1, (5 - r.growthPerWeek) / 5),
    lowAbility: r.theta === null ? 0 : Math.max(-1.5, Math.min(2.5, -r.theta)),
    lowGoalChance: r.goalChance === null ? 0 : Math.max(-1.5, (50 - r.goalChance) / 25),
    weakFoundations: Math.min(4, r.rootGaps),
    guessing: Math.min(1, r.rapidRate) * 4,
    // a 5-question check is noisy: one check can never dominate the score
    weeklyDrop: r.weeklyChange === null ? 0 : Math.max(-1, Math.min(2, -r.weeklyChange / 3)),
    interventionFailed: r.interventionFailed ? 1 : 0,
    noMap: r.hasMap ? 0 : 1,
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export function riskProbability(x: FeatureVector, m: RiskWeights = EXPERT_WEIGHTS): number {
  return sigmoid(m.bias + FEATURES.reduce((a, k) => a + m.w[k] * x[k], 0));
}

export interface RiskReason { key: FeatureKey; text: string; action: string; weight: number }

/** The reasons that push the risk up, strongest first, each with its action. Pure. */
export function riskReasons(r: RawSignals, x: FeatureVector, m: RiskWeights = EXPERT_WEIGHTS): RiskReason[] {
  const text: Record<FeatureKey, () => string> = {
    lowPractice: () => `practised on only ${r.days14} of the last 14 days`,
    decliningPractice: () => `practice is declining (${r.daysPrev14} → ${r.days14} days)`,
    slowGrowth: () => (r.growthPerWeek === null ? "no recent progress data" : `slow progress (+${r.growthPerWeek} mastery points a week)`),
    lowAbility: () => `works below grade level (ability ${r.theta?.toFixed(1)})`,
    lowGoalChance: () => `only a ${r.goalChance}% chance of the MAP goal at the current pace`,
    weakFoundations: () => `${r.rootGaps} weak foundation skill${r.rootGaps > 1 ? "s" : ""}${r.weakSkill ? ` (${r.weakSkill})` : ""}`,
    guessing: () => `answers too fast (${Math.round(r.rapidRate * 100)}% rapid guesses)`,
    weeklyDrop: () => `the last Weekly Check went down ${Math.abs(r.weeklyChange ?? 0)} RIT`,
    interventionFailed: () => "the last intervention did not raise mastery",
    noMap: () => "no MAP score yet",
  };
  const action: Record<FeatureKey, string> = {
    lowPractice: "Agree a short daily routine (10 minutes, 5 days) and assign the My Next Step skill.",
    decliningPractice: "Check in with the student and the family this week; set a weekly goal.",
    slowGrowth: "Look at the skills with little progress: teach the foundation first (Knowledge Graph).",
    lowAbility: "Practise at their level first (Below Level sets), then step up.",
    lowGoalChance: "Send a MAP plan on the weakest instructional area and check it weekly.",
    weakFoundations: `Put the student in a small group on ${r.weakSkill ?? "the weak foundation"} (Intervention Groups).`,
    guessing: "Talk about careful reading; turn on read-aloud; praise careful answers.",
    weeklyDrop: "Re-check the area that dropped with a short reteach and a new Weekly Check.",
    interventionFailed: "Try a different intervention: another skill underneath, or a different activity.",
    noMap: "Enter or import the student's MAP scores so the prediction can use them.",
  };
  return FEATURES.map((k) => ({ key: k, weight: m.w[k] * x[k], text: text[k](), action: action[k] }))
    .filter((c) => c.weight >= 0.25 && !(c.key === "noMap" && c.weight < 0.3)).sort((a, b) => b.weight - a.weight);
}

/** Groups rows by one key once (avoids a per-student .filter over the whole array). */
export function groupBy(rows: Row[], key = "studentId"): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) { const k = s(r[key]); const list = m.get(k); if (list) list.push(r); else m.set(k, [r]); }
  return m;
}

/** Ability over skills, weighted by the responses behind each skill θ (null under 10 responses). Pure. */
export function weightedSkillTheta(rows: Row[]): number | null {
  const ab = rows.filter((x) => s(x.scope).startsWith("SKILL:") && x.theta !== null && x.theta !== undefined);
  const wsum = ab.reduce((t, x) => t + Math.max(1, Number(x.responses ?? 1)), 0);
  if (wsum < 10) return null;
  return Math.round((ab.reduce((t, x) => t + Math.max(1, Number(x.responses ?? 1)) * Number(x.theta), 0) / wsum) * 100) / 100;
}

/**
 * Mastery points per week from the gain in the last 14 days, over the days the student has actually been active in
 * that window (a student who started 3 days ago is not divided by two weeks). At least one day. Pure.
 */
export function perWeek(gain: number, firstActivityAt: number | null, now: number): number {
  const days = firstActivityAt === null ? 14 : Math.max(1, Math.min(14, (now - firstActivityAt) / DAY));
  return Math.round((gain / (days / 7)) * 10) / 10;
}

/** The finished interventions of these schools (read once per daily run and passed to rawSignals). */
export async function doneInterventions(repo: Repo, schoolIds: string[]): Promise<Row[]> {
  return schoolIds.length ? repo.findMany("Intervention", { status: "DONE", schoolId: { in: schoolIds } }, { select: ["studentIds", "baseline", "result", "evaluatedAt"] }) : [];
}

/** The latest finished intervention of each student (one pass over the interventions). */
function latestDoneByStudent(done: Row[]): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const r of done) {
    const ids = (typeof r.studentIds === "string" ? JSON.parse(r.studentIds) : r.studentIds ?? []) as string[];
    for (const id of ids) { const cur = out.get(id); if (!cur || time(r.evaluatedAt) > time(cur.evaluatedAt)) out.set(id, r); }
  }
  return out;
}

/** The signals of these students, read in a fixed number of queries. `pre.done`: finished interventions already read. */
export async function rawSignals(repo: Repo, studentIds: string[], now = new Date(), pre?: { done?: Row[] }): Promise<Map<string, RawSignals>> {
  const out = new Map<string, RawSignals>();
  if (!studentIds.length) return out;
  const since28 = new Date(now.getTime() - 28 * DAY), since14 = now.getTime() - 14 * DAY;
  const [att, logs, abil, prof, weekly, map] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, createdAt: { gte: since28 } }, { select: ["studentId", "createdAt", "rapidGuess"] }),
    repo.findMany("AdaptiveDecisionLog", { studentId: { in: studentIds }, createdAt: { gte: new Date(since14) } }, { select: ["studentId", "createdAt", "masteryBefore", "masteryAfter"] }),
    repo.findMany("StudentAbility", { studentId: { in: studentIds } }, { select: ["studentId", "scope", "theta", "responses"] }),
    repo.findMany("StudentProfile", { studentId: { in: studentIds } }, { select: ["studentId", "goalChance", "intelligence", "readingRit", "languageRit"] }),
    repo.findMany("WeeklyCheck", { studentId: { in: studentIds }, completedAt: { gte: new Date(now.getTime() - 120 * DAY) } }, { select: ["studentId", "week", "ritBefore", "ritAfter", "completedAt"] }),
    repo.findMany("MapResult", { studentId: { in: studentIds }, goalName: null }, { select: ["studentId"] }),
  ]);
  let done = pre?.done;
  if (!done) {
    const schools = [...new Set((await repo.findMany("Student", { id: { in: studentIds } }, { select: ["schoolId"] })).map((x) => s(x.schoolId)))];
    done = await doneInterventions(repo, schools);
  }
  const hasMap = new Set(map.map((m) => s(m.studentId)));
  const attBy = groupBy(att), logBy = groupBy(logs), abBy = groupBy(abil), weekBy = groupBy(weekly);
  const profBy = new Map(prof.map((p) => [s(p.studentId), p]));
  const lastDone = latestDoneByStudent(done);
  const iv = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v ?? {}) as Record<string, number>;
  for (const id of studentIds) {
    const a = attBy.get(id) ?? [];
    // practice days are school days in Riyadh, not UTC dates
    const days = (from: number, to: number) => new Set(a.filter((x) => time(x.createdAt) >= from && time(x.createdAt) < to).map((x) => riyadhDay(time(x.createdAt)))).size;
    const mineLogs = logBy.get(id) ?? [];
    const gain = mineLogs.filter((l) => l.masteryBefore !== null && l.masteryBefore !== undefined && l.masteryAfter !== null && l.masteryAfter !== undefined).reduce((t, l) => t + Number(l.masteryAfter) - Number(l.masteryBefore), 0);
    const firstAt = mineLogs.length ? Math.min(...mineLogs.map((l) => time(l.createdAt)).filter((x) => !Number.isNaN(x))) : null;
    const theta = weightedSkillTheta(abBy.get(id) ?? []);
    const p = profBy.get(id);
    const intel = (p ? (typeof p.intelligence === "string" ? JSON.parse(p.intelligence) : p.intelligence) : null) as { missingPrerequisites?: { name: string }[] } | null;
    const wk = (weekBy.get(id) ?? []).filter((w) => w.completedAt && w.ritAfter !== null && w.ritAfter !== undefined && w.ritBefore !== null && w.ritBefore !== undefined).sort((x, y) => s(y.week).localeCompare(s(x.week)))[0];
    const mine = lastDone.get(id);
    out.set(id, {
      days14: days(since14, now.getTime() + 1), daysPrev14: days(since28.getTime(), since14),
      growthPerWeek: mineLogs.length ? perWeek(gain, firstAt !== null && Number.isFinite(firstAt) ? firstAt : null, now.getTime()) : null, theta,
      goalChance: p?.goalChance === null || p?.goalChance === undefined ? null : Number(p.goalChance),
      rootGaps: intel?.missingPrerequisites?.length ?? 0, weakSkill: intel?.missingPrerequisites?.[0]?.name ?? null,
      rapidRate: a.length ? a.filter((x) => x.rapidGuess).length / a.length : 0,
      weeklyChange: wk ? Number(wk.ritAfter) - Number(wk.ritBefore) : null,
      interventionFailed: mine ? Number(iv(mine.result)[id] ?? 0) - Number(iv(mine.baseline)[id] ?? 0) <= 0 : false,
      hasMap: hasMap.has(id),
    });
  }
  return out;
}

/** The school's risk model: the learned one when it beats the expert one, else the expert weights. */
export async function riskModel(repo: Repo, schoolId: string): Promise<{ weights: RiskWeights; source: "EXPERT" | "LEARNED"; metrics: Record<string, unknown> | null }> {
  const row = (await repo.findMany("PredictionModel", { schoolId, kind: "RISK" }))[0];
  const m = row ? ((typeof row.metrics === "string" ? JSON.parse(row.metrics) : row.metrics) as Record<string, number>) : null;
  if (row && m && m.useLearned) return { weights: (typeof row.weights === "string" ? JSON.parse(row.weights) : row.weights) as RiskWeights, source: "LEARNED", metrics: m };
  return { weights: EXPERT_WEIGHTS, source: "EXPERT", metrics: m };
}

export interface StudentRisk { studentId: string; score: number; level: "HIGH" | "MEDIUM" | "LOW"; reasons: RiskReason[]; signals: RawSignals }
export const levelOf = (score: number): StudentRisk["level"] => (score >= 65 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW");

/** Risk of these students now (no writing). */
export async function risksOf(repo: Repo, schoolId: string, studentIds: string[], now = new Date()): Promise<StudentRisk[]> {
  const [sig, model] = await Promise.all([rawSignals(repo, studentIds, now), riskModel(repo, schoolId)]);
  return studentIds.map((id) => {
    const r = sig.get(id)!; const x = featuresOf(r);
    const score = Math.round(100 * riskProbability(x, model.weights));
    return { studentId: id, score, level: levelOf(score), reasons: riskReasons(r, x, model.weights).slice(0, 4), signals: r };
  });
}

/** Daily: every student's risk → profile (score + reasons) and a dated snapshot (to learn from). Returns how many. */
export async function computeRisks(repo: Repo, schoolId: string, now = new Date()): Promise<{ students: number; high: number }> {
  const ids = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => s(x.id));
  const [model, done] = await Promise.all([riskModel(repo, schoolId), doneInterventions(repo, [schoolId])]);
  const day = new Date(riyadhDay(now)); // the school day in Riyadh (one snapshot per student per day)
  let high = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const sig = await rawSignals(repo, chunk, now, { done });
    for (const id of chunk) {
      const r = sig.get(id)!; const x = featuresOf(r);
      const score = Math.round(100 * riskProbability(x, model.weights));
      if (score >= 65) high++;
      const reasons = riskReasons(r, x, model.weights).slice(0, 4);
      await repo.updateMany("StudentProfile", { studentId: id }, { riskScore: score, riskReasons: reasons });
      await repo.upsert("RiskSnapshot", { studentId: id, takenOn: day }, { schoolId, score, features: x, model: model.source }, { score, features: x, model: model.source });
    }
  }
  return { students: ids.length, high };
}

// ------------------------------------------------------------------ learning from outcomes

/** Area under the ROC curve (probability a random positive scores above a random negative). Pure. */
export function auc(scores: number[], labels: boolean[]): number {
  const pos = scores.filter((_, i) => labels[i]), neg = scores.filter((_, i) => !labels[i]);
  if (!pos.length || !neg.length) return 0.5;
  let w = 0;
  for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0;
  return w / (pos.length * neg.length);
}

/** Logistic regression with an L2 pull toward the expert weights (small schools keep sensible weights). Pure. */
export function fitLogistic(X: FeatureVector[], y: boolean[], prior: RiskWeights = EXPERT_WEIGHTS, lambda = 0.05, iters = 600, lr = 0.1): RiskWeights {
  const m: RiskWeights = { bias: prior.bias, w: { ...prior.w } };
  const n = X.length;
  for (let it = 0; it < iters; it++) {
    const g: Record<string, number> = Object.fromEntries(FEATURES.map((k) => [k, 0]));
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const err = riskProbability(X[i], m) - (y[i] ? 1 : 0);
      gb += err; for (const k of FEATURES) g[k] += err * X[i][k];
    }
    m.bias -= lr * (gb / n);
    for (const k of FEATURES) m.w[k] -= lr * (g[k] / n + lambda * (m.w[k] - prior.w[k]));
  }
  return m;
}

/** Mean squared error of probabilities (lower = better calibrated). Pure. */
export function brier(scores: number[], labels: boolean[]): number {
  if (!scores.length) return 0;
  return scores.reduce((a, p, i) => a + (p - (labels[i] ? 1 : 0)) ** 2, 0) / scores.length;
}

export interface TrainResult { n: number; positives: number; aucExpert: number | null; aucLearned: number | null; brierExpert: number | null; brierLearned: number | null; useLearned: boolean }

/** Stable 0–99 bucket of a student (the train / test split is by student, never by row). Pure. */
export function studentBucket(studentId: string): number {
  let h = 2166136261;
  for (let i = 0; i < studentId.length; i++) { h ^= studentId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100;
}
export const inTrainSet = (studentId: string) => studentBucket(studentId) < 70;

export const TRAIN_WINDOW_DAYS = 400;
export const MAX_EXAMPLES = 20_000;
const SCHOOL_YEAR_DAYS = 330; // a projection only targets the Spring of its own school year

export interface TrainingExample { studentId: string; x: FeatureVector; missed: boolean }

/**
 * The examples the risk model learns from: ONE per student and Spring MAP outcome — the latest snapshot taken at least
 * 14 days before that Spring test, labelled by whether the student missed the projection of the latest Fall/Winter
 * MAP row (with NWEA projected growth) of the same school year taken before the snapshot (or NWEA's "met" flag).
 */
export async function trainingExamples(repo: Repo, schoolId: string, now = new Date()): Promise<TrainingExample[]> {
  const from = now.getTime() - TRAIN_WINDOW_DAYS * DAY;
  const ids = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => s(x.id));
  const out: TrainingExample[] = [];
  for (let i = 0; i < ids.length && out.length < MAX_EXAMPLES; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const maps = (await repo.findMany("MapResult", { studentId: { in: chunk }, goalName: null, testDate: { gte: new Date(from - SCHOOL_YEAR_DAYS * DAY) } }, { select: ["studentId", "subject", "testDate", "termName", "rit", "projectedGrowth", "metProjectedGrowth"] }))
      .filter((m) => /read/i.test(s(m.subject)));
    const byStudent = groupBy(maps);
    // the Spring outcomes inside the window, per student
    const outcomes = new Map<string, Row[]>();
    for (const [id, list] of byStudent) {
      const springs = list.filter((m) => seasonOf(m.termName, m.testDate) === "SPRING" && time(m.testDate) >= from + 14 * DAY && time(m.testDate) <= now.getTime());
      if (springs.length) outcomes.set(id, springs);
    }
    if (!outcomes.size) continue;
    // light read first (no features): which snapshot belongs to which outcome
    const snaps = await repo.findMany("RiskSnapshot", { schoolId, studentId: { in: [...outcomes.keys()] }, takenOn: { gte: new Date(from) } }, { select: ["studentId", "takenOn"], orderBy: [{ field: "takenOn", dir: "desc" }], take: outcomes.size * TRAIN_WINDOW_DAYS });
    const snapBy = groupBy(snaps);
    const picked: { studentId: string; takenOn: number; missed: boolean }[] = [];
    for (const [id, springs] of outcomes) {
      const list = byStudent.get(id) ?? [];
      const mySnaps = (snapBy.get(id) ?? []).map((x) => time(x.takenOn));
      for (const sp of springs) {
        const at = time(sp.testDate);
        const sn = mySnaps.filter((t) => t <= at - 14 * DAY && t > at - SCHOOL_YEAR_DAYS * DAY).sort((a, b) => b - a)[0];
        if (sn === undefined) continue;
        const base = list
          .filter((m) => m.projectedGrowth !== null && m.projectedGrowth !== undefined && time(m.testDate) <= sn && at - time(m.testDate) <= SCHOOL_YEAR_DAYS * DAY && seasonOf(m.termName, m.testDate) !== "SPRING")
          .sort((a, b) => time(b.testDate) - time(a.testDate))[0];
        if (!base) continue; // no projection of this school year before the snapshot: the outcome says nothing
        const met = s(sp.metProjectedGrowth).trim();
        const missed = met ? /^n/i.test(met) : Number(sp.rit) < Number(base.rit) + Number(base.projectedGrowth);
        picked.push({ studentId: id, takenOn: sn, missed });
      }
    }
    if (!picked.length) continue;
    const dates = [...new Set(picked.map((p) => new Date(p.takenOn).toISOString().slice(0, 10)))].map((d) => new Date(d));
    const rows = await repo.findMany("RiskSnapshot", { schoolId, studentId: { in: [...new Set(picked.map((p) => p.studentId))] }, takenOn: { in: dates } }, { select: ["studentId", "takenOn", "features"] });
    const feat = new Map(rows.map((r) => [`${s(r.studentId)}|${time(r.takenOn)}`, r.features]));
    for (const p of picked) {
      const f = feat.get(`${p.studentId}|${p.takenOn}`);
      if (!f) continue;
      out.push({ studentId: p.studentId, x: (typeof f === "string" ? JSON.parse(f) : f) as FeatureVector, missed: p.missed });
      if (out.length >= MAX_EXAMPLES) break;
    }
  }
  return out;
}

/**
 * Re-fits the risk model from the school's history (trainingExamples: one example per student and MAP outcome).
 * 70% of the STUDENTS to fit, the other 30% to test (a student is never on both sides); the learned weights are used
 * only if they rank students better (AUC) — or rank as well with better-calibrated probabilities (Brier) — than the
 * expert ones on the held-out students.
 */
export async function trainRiskModel(repo: Repo, schoolId: string, now = new Date()): Promise<TrainResult> {
  const ex = await trainingExamples(repo, schoolId, now);
  const X = ex.map((e) => e.x), y = ex.map((e) => e.missed);
  const res: TrainResult = { n: X.length, positives: y.filter(Boolean).length, aucExpert: null, aucLearned: null, brierExpert: null, brierLearned: null, useLearned: false };
  if (X.length >= 50 && res.positives >= 5 && res.positives <= X.length - 5) {
    const tr = ex.map((_, i) => i).filter((i) => inTrainSet(ex[i].studentId)), te = ex.map((_, i) => i).filter((i) => !inTrainSet(ex[i].studentId));
    if (tr.length && te.length) {
      const learned = fitLogistic(tr.map((i) => X[i]), tr.map((i) => y[i]));
      res.aucExpert = Math.round(auc(te.map((i) => riskProbability(X[i])), te.map((i) => y[i])) * 1000) / 1000;
      res.aucLearned = Math.round(auc(te.map((i) => riskProbability(X[i], learned)), te.map((i) => y[i])) * 1000) / 1000;
      res.brierExpert = Math.round(brier(te.map((i) => riskProbability(X[i])), te.map((i) => y[i])) * 1000) / 1000;
      res.brierLearned = Math.round(brier(te.map((i) => riskProbability(X[i], learned)), te.map((i) => y[i])) * 1000) / 1000;
      // Learned weights win if they rank clearly better, or rank about as well and give more honest probabilities.
      res.useLearned = res.aucLearned > res.aucExpert + 0.01 || (res.aucLearned >= res.aucExpert - 0.01 && res.brierLearned < res.brierExpert - 0.005);
    }
    const all = fitLogistic(X, y); // final weights from every example
    await repo.upsert("PredictionModel", { schoolId, kind: "RISK" }, { weights: all, metrics: { ...res, trainedOn: now.toISOString() }, n: X.length, trainedAt: now }, { weights: all, metrics: { ...res, trainedOn: now.toISOString() }, n: X.length, trainedAt: now });
  }
  return res;
}

/** Forecasts from the student's own pace: weeks to master each developing skill, weeks to the MAP goal. Pure. */
export function forecast(developing: { name: string; mastery: number }[], growthPerWeek: number | null, prediction: { rit: number | null; goal: number | null; current: number | null; weeksToTerm: number }): { skills: { name: string; weeks: number | null }[]; weeksToGoal: number | null; ritPerWeek: number | null } {
  const perSkill = growthPerWeek && growthPerWeek > 0 ? growthPerWeek / Math.max(1, Math.min(3, developing.length)) : null;
  const skills = developing.slice(0, 6).map((d) => ({ name: d.name, weeks: perSkill ? Math.max(1, Math.ceil((75 - d.mastery) / perSkill)) : null }));
  const ritPerWeek = prediction.rit !== null && prediction.current !== null && prediction.weeksToTerm > 0 ? (prediction.rit - prediction.current) / prediction.weeksToTerm : null;
  const weeksToGoal = prediction.goal !== null && prediction.current !== null && ritPerWeek && ritPerWeek > 0 ? Math.max(0, Math.ceil((prediction.goal - prediction.current) / ritPerWeek)) : null;
  return { skills, weeksToGoal, ritPerWeek: ritPerWeek === null ? null : Math.round(ritPerWeek * 100) / 100 };
}

export type { Row };
