/**
 * 🏫 The school's AI dashboard data: trends (weekly snapshots), growth predictions and risk by grade, learning
 * outcomes, intervention effectiveness, and how well the platform's own models work (continuous learning).
 */
import type { Repo, Row } from "../seeding/repo";
import { interventionImpact } from "../insights/interventions";
import { recommendationStats } from "../insights/recommendation-log";
import { riskModel } from "./risk";
import { actionWeights } from "../insights/learning-weights";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();

export interface SchoolAi {
  trend: { week: string; theta: number; mastered: number; students: number }[];
  grades: { grade: number; students: number; onTrack: number; withGoal: number; avgPredicted: number | null; avgGoal: number | null; high: number; medium: number }[];
  outcomes: { mastered: number; weeklyChecks: number; weeklyAvgChange: number | null; practiced14: number; students: number };
  interventions: Awaited<ReturnType<typeof interventionImpact>>;
  advice: Awaited<ReturnType<typeof recommendationStats>>;
  models: { risk: { source: string; metrics: Record<string, unknown> | null }; actions: Record<string, number>; actionStats: Record<string, unknown> | null };
}

export async function schoolAi(repo: Repo, schoolId: string, now = new Date()): Promise<SchoolAi> {
  const students = await repo.findMany("Student", { schoolId }, { select: ["id", "gradeId"] });
  const ids = students.map((x) => s(x.id));
  const grades = new Map((await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] })).map((g) => [s(g.id), Number(g.level)]));
  const [snaps, profiles, mastered, weekly, interventions, advice, risk, actions, aw] = await Promise.all([
    ids.length ? repo.findMany("AbilitySnapshot", { studentId: { in: ids }, scope: "PROFILE", takenOn: { gte: new Date(now.getTime() - 70 * 86_400_000) } }, { select: ["takenOn", "theta", "mastery"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("StudentProfile", { studentId: { in: ids } }, { select: ["studentId", "predictedReading", "goalReading", "goalChance", "riskScore", "practiceDays14"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.count("StudentSkillMastery", { studentId: { in: ids }, isMastered: true }) : Promise.resolve(0),
    ids.length ? repo.findMany("WeeklyCheck", { studentId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, { select: ["ritBefore", "ritAfter", "completedAt"] }) : Promise.resolve([] as Row[]),
    interventionImpact(repo, schoolId), recommendationStats(repo, ids, now), riskModel(repo, schoolId), actionWeights(repo, schoolId),
    repo.findMany("PredictionModel", { schoolId, kind: "ACTION_WEIGHTS" }, { select: ["metrics"] }),
  ]);
  const byWeek = new Map<string, { t: number; m: number; n: number }>();
  for (const x of snaps) { const k = new Date(time(x.takenOn)).toISOString().slice(0, 10); const e = byWeek.get(k) ?? { t: 0, m: 0, n: 0 }; e.t += Number(x.theta); e.m += Number(x.mastery ?? 0); e.n++; byWeek.set(k, e); }
  const trend = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, e]) => ({ week, theta: Math.round((e.t / e.n) * 100) / 100, mastered: Math.round((e.m / e.n) * 10) / 10, students: e.n }));
  const gradeRows = new Map<number, SchoolAi["grades"][number]>();
  for (const st of students) {
    const g = grades.get(s(st.gradeId)) ?? 0;
    const r = gradeRows.get(g) ?? { grade: g, students: 0, onTrack: 0, withGoal: 0, avgPredicted: 0, avgGoal: 0, high: 0, medium: 0 };
    r.students++;
    const p = profiles.find((x) => s(x.studentId) === s(st.id));
    if (p && p.goalChance !== null && p.goalChance !== undefined) { r.withGoal++; if (Number(p.goalChance) >= 50) r.onTrack++; r.avgPredicted! += Number(p.predictedReading ?? 0); r.avgGoal! += Number(p.goalReading ?? 0); }
    const rs = Number(p?.riskScore ?? -1); if (rs >= 65) r.high++; else if (rs >= 40) r.medium++;
    gradeRows.set(g, r);
  }
  for (const r of gradeRows.values()) { r.avgPredicted = r.withGoal ? Math.round(r.avgPredicted! / r.withGoal) : null; r.avgGoal = r.withGoal ? Math.round(r.avgGoal! / r.withGoal) : null; }
  const done = weekly.filter((x) => x.completedAt && x.ritAfter !== null && x.ritBefore !== null && x.ritAfter !== undefined);
  const awm = aw[0] ? ((typeof aw[0].metrics === "string" ? JSON.parse(aw[0].metrics) : aw[0].metrics) as Record<string, unknown>) : null;
  return {
    trend, grades: [...gradeRows.values()].sort((a, b) => a.grade - b.grade),
    outcomes: { mastered, weeklyChecks: done.length, weeklyAvgChange: done.length ? Math.round((done.reduce((t, x) => t + Number(x.ritAfter) - Number(x.ritBefore), 0) / done.length) * 10) / 10 : null, practiced14: profiles.filter((p) => Number(p.practiceDays14 ?? 0) > 0).length, students: ids.length },
    interventions, advice, models: { risk: { source: risk.source, metrics: risk.metrics }, actions: { ...actions }, actionStats: awm },
  };
}
