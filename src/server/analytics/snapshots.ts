/**
 * Daily growth snapshots (AbilitySnapshot, scope "GLOBAL").
 * Rebuilt from the adaptive decision log, which already records every mastery change
 * with a timestamp, so growth history exists from the first day of practice; the
 * nightly job simply re-runs this for recent days. Idempotent (upsert per student/day).
 * Only PRACTICE decisions count (masteryAfter present); placement checks measure a
 * different thing and never change mastery.
 */
import type { Repo, Row } from "../seeding/repo";

const DAY = 86_400_000;
const t = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).getTime();
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface DayState {
  day: string;
  mastery: number; // average mastery over skills practised so far
  theta: number; // average skill ability over skills practised so far
  skills: number;
}

/** Pure: replay one student's practice decisions into per-day states (activity days only). */
export function replayDays(logs: { skillId: string; at: number; masteryAfter: number; newTheta: number }[]): DayState[] {
  const sorted = [...logs].sort((a, b) => a.at - b.at);
  const mastery = new Map<string, number>();
  const theta = new Map<string, number>();
  const out: DayState[] = [];
  let i = 0;
  while (i < sorted.length) {
    const key = dayKey(sorted[i].at);
    while (i < sorted.length && dayKey(sorted[i].at) === key) {
      mastery.set(sorted[i].skillId, sorted[i].masteryAfter);
      theta.set(sorted[i].skillId, sorted[i].newTheta);
      i++;
    }
    const ms = [...mastery.values()];
    const ts = [...theta.values()];
    out.push({ day: key, mastery: ms.reduce((a, b) => a + b, 0) / ms.length, theta: ts.reduce((a, b) => a + b, 0) / ts.length, skills: ms.length });
  }
  return out;
}

export async function practiceLogs(repo: Repo, studentIds: string[], to?: Date): Promise<Map<string, { skillId: string; at: number; masteryAfter: number; newTheta: number }[]>> {
  const out = new Map<string, { skillId: string; at: number; masteryAfter: number; newTheta: number }[]>();
  if (!studentIds.length) return out;
  const logs: Row[] = await repo.findMany("AdaptiveDecisionLog", { studentId: { in: studentIds } });
  for (const l of logs) {
    if (l.masteryAfter === null || l.masteryAfter === undefined || l.attemptId === null || l.attemptId === undefined) continue;
    if (to && t(l.createdAt) > to.getTime()) continue;
    const list = out.get(String(l.studentId)) ?? out.set(String(l.studentId), []).get(String(l.studentId))!;
    list.push({ skillId: String(l.skillId), at: t(l.createdAt), masteryAfter: Number(l.masteryAfter), newTheta: Number(l.newTheta) });
  }
  return out;
}

/** Writes GLOBAL snapshots for activity days in [from, to]. Returns rows written. */
export async function buildSnapshots(repo: Repo, studentIds: string[], from: Date, to: Date): Promise<number> {
  const byStudent = await practiceLogs(repo, studentIds, to);
  let written = 0;
  for (const [studentId, logs] of byStudent) {
    for (const d of replayDays(logs)) {
      const ms = Date.parse(`${d.day}T00:00:00Z`);
      if (ms < from.getTime() - DAY || ms > to.getTime()) continue;
      await repo.upsert("AbilitySnapshot", { studentId, scope: "GLOBAL", takenOn: new Date(ms) },
        { theta: d.theta, mastery: d.mastery }, { theta: d.theta, mastery: d.mastery });
      written++;
    }
  }
  return written;
}
