/**
 * Growth over a reporting period (INTERNAL platform measures, never MAP/RIT).
 *
 *  Trend      average mastery (and ability θ) at each month end — the latest daily state on
 *             or before that date.
 *  Start/now  values at the period start and end → growth amount and percentage.
 *  Skill growth (paired)  each skill compared with ITSELF: mastery at the period start (or its
 *             first measurement, if first practised during the period) vs. now; needs ≥ 2
 *             measurements. Unlike the overall average, it is not pulled down when a student
 *             starts a new, not-yet-learned skill.
 *  Domain growth  mean paired skill growth per domain.
 */
import { mean, median, round1 } from "../../analytics/stats";
import { months, type Period } from "../../analytics/periods";
import type { Repo } from "../seeding/repo";
import { practiceLogs, replayDays, type DayState } from "./snapshots";

export interface SeriesPoint {
  label: string;
  mastery: number | null;
  theta: number | null;
}

export interface SkillGrowth {
  skillId: string;
  name: string;
  domain: string;
  start: number;
  now: number;
  growth: number;
}

export interface StudentGrowth {
  series: SeriesPoint[];
  start: number | null;
  current: number | null;
  growth: number | null;
  growthPct: number | null;
  skills: SkillGrowth[];
  domains: { domain: string; growth: number; skills: number }[];
}

const stateAt = (days: DayState[], at: number): DayState | null => {
  let found: DayState | null = null;
  for (const d of days) if (Date.parse(`${d.day}T00:00:00Z`) <= at) found = d;
  return found;
};

export function growthFromLogs(
  logs: { skillId: string; at: number; masteryAfter: number; newTheta: number }[],
  period: Period,
  skillInfo: Map<string, { name: string; domain: string }>,
): StudentGrowth {
  const days = replayDays(logs);
  const series = months(period).map((m) => {
    const s = stateAt(days, m.end.getTime());
    return { label: m.label, mastery: s ? round1(s.mastery) : null, theta: s ? Math.round(s.theta * 100) / 100 : null };
  });
  const startState = stateAt(days, period.from.getTime()) ?? days.find((d) => Date.parse(`${d.day}T00:00:00Z`) <= period.to.getTime()) ?? null;
  const endState = stateAt(days, period.to.getTime());
  const start = startState ? round1(startState.mastery) : null;
  const current = endState ? round1(endState.mastery) : null;

  // Baseline = mastery at the period start; for a skill first practised during the period,
  // its FIRST measurement (a skill is never "measured at 0"). Growth needs ≥ 2 measurements.
  const before = new Map<string, number>();
  const firstIn = new Map<string, number>();
  const after = new Map<string, number>();
  const countIn = new Map<string, number>();
  for (const l of [...logs].sort((a, b) => a.at - b.at)) {
    if (l.at < period.from.getTime()) before.set(l.skillId, l.masteryAfter);
    else if (l.at <= period.to.getTime()) {
      if (!firstIn.has(l.skillId)) firstIn.set(l.skillId, l.masteryAfter);
      countIn.set(l.skillId, (countIn.get(l.skillId) ?? 0) + 1);
    }
    if (l.at <= period.to.getTime()) after.set(l.skillId, l.masteryAfter);
  }
  const measurable = [...countIn.keys()].filter((id) => before.has(id) || (countIn.get(id) ?? 0) >= 2);
  const skills: SkillGrowth[] = measurable.map((id) => {
    const s = before.get(id) ?? firstIn.get(id)!;
    const n = after.get(id) ?? s;
    const info = skillInfo.get(id) ?? { name: "", domain: "" };
    return { skillId: id, name: info.name, domain: info.domain, start: Math.round(s), now: Math.round(n), growth: Math.round(n - s) };
  }).sort((a, b) => b.growth - a.growth);
  const byDomain = new Map<string, number[]>();
  for (const s of skills) (byDomain.get(s.domain) ?? byDomain.set(s.domain, []).get(s.domain)!).push(s.growth);
  return {
    series, start, current,
    growth: start !== null && current !== null ? round1(current - start) : null,
    growthPct: start !== null && current !== null && start > 0 ? round1(((current - start) / start) * 100) : null,
    skills,
    domains: [...byDomain].map(([domain, g]) => ({ domain, growth: round1(mean(g))!, skills: g.length })),
  };
}

async function skillInfoMap(repo: Repo, logs: Map<string, { skillId: string }[]>) {
  const ids = [...new Set([...logs.values()].flat().map((l) => l.skillId))];
  const rows = ids.length ? await repo.findMany("Skill", { id: { in: ids } }) : [];
  return new Map(rows.map((r) => [String(r.id), { name: String(r.name), domain: String(r.domain) }]));
}

export async function studentGrowth(repo: Repo, studentId: string, period: Period): Promise<StudentGrowth> {
  const logs = await practiceLogs(repo, [studentId], period.to);
  return growthFromLogs(logs.get(studentId) ?? [], period, await skillInfoMap(repo, logs));
}

export interface GroupGrowth {
  students: number;
  withData: number;
  series: { label: string; mastery: number | null }[];
  meanGrowth: number | null;
  medianGrowth: number | null;
  skills: { skillId: string; name: string; meanGrowth: number; students: number }[];
}

/** Class/grade/school growth: averages of the students' own growth (each student counted once). */
/**
 * A student's growth for summaries: the mean PAIRED skill growth (each skill compared with
 * its own earlier value). The change in overall average mastery (StudentGrowth.growth) is
 * not used for summaries: it falls whenever a new skill is started at a low level, so a
 * student who improved on every skill could show "decline". Null when no skill has two
 * measurements in the period.
 */
export function pairedGrowth(g: StudentGrowth): number | null {
  return g.skills.length ? round1(mean(g.skills.map((s) => s.growth))) : null;
}

export async function groupGrowth(repo: Repo, studentIds: string[], period: Period): Promise<GroupGrowth> {
  const logs = await practiceLogs(repo, studentIds, period.to);
  const info = await skillInfoMap(repo, logs);
  const per = [...logs.values()].map((l) => growthFromLogs(l, period, info));
  const labels = months(period).map((m) => m.label);
  const skillAgg = new Map<string, number[]>();
  for (const g of per) for (const s of g.skills) (skillAgg.get(s.skillId) ?? skillAgg.set(s.skillId, []).get(s.skillId)!).push(s.growth);
  // class figures use each student's paired skill growth (see pairedGrowth)
  const growths = per.map(pairedGrowth).filter((x): x is number => x !== null);
  return {
    students: studentIds.length,
    withData: per.filter((g) => g.current !== null).length,
    series: labels.map((label, i) => ({ label, mastery: round1(mean(per.map((g) => g.series[i].mastery).filter((x): x is number => x !== null))) })),
    meanGrowth: round1(mean(growths)),
    medianGrowth: round1(median(growths)),
    skills: [...skillAgg].map(([id, g]) => ({ skillId: id, name: info.get(id)?.name ?? "", meanGrowth: round1(mean(g))!, students: g.length })).sort((a, b) => b.meanGrowth - a.meanGrowth),
  };
}
