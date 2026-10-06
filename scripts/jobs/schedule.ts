/**
 * Job schedule (Phase 13). Times are Asia/Riyadh (UTC+3, no daylight saving).
 * Pure functions, tested in tests/deployment.test.ts.
 */
export interface JobSpec {
  name: string;
  /** npm script to run (package.json) */
  script: string;
  /** "daily HH:MM" or "weekly <Sun..Sat> HH:MM" in Riyadh time */
  at: string;
}

export const JOBS: JobSpec[] = [
  { name: "rollups", script: "jobs:rollups", at: "daily 02:15" }, // analytics, interventions, session purge
  { name: "security-digest", script: "jobs:security", at: "daily 06:30" }, // before the school day
  { name: "item-analysis", script: "jobs:items", at: "weekly Fri 03:00" }, // question quality + calibration
];

const RIYADH_OFFSET_MS = 3 * 3_600_000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseAt(at: string): { weekday: number | null; hour: number; minute: number } {
  const m = /^(daily|weekly (Sun|Mon|Tue|Wed|Thu|Fri|Sat)) ([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
  if (!m) throw new Error(`Invalid schedule "${at}" (use "daily HH:MM" or "weekly Fri HH:MM").`);
  return { weekday: m[2] ? DAYS.indexOf(m[2]) : null, hour: Number(m[3]), minute: Number(m[4]) };
}

/** Next run strictly after `now` (UTC instant). */
export function nextRun(at: string, now: Date): Date {
  const { weekday, hour, minute } = parseAt(at);
  const local = new Date(now.getTime() + RIYADH_OFFSET_MS); // shift so UTC getters read Riyadh wall time
  const cand = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute));
  let days = 0;
  if (weekday === null) days = cand <= local ? 1 : 0;
  else {
    days = (weekday - local.getUTCDay() + 7) % 7;
    if (days === 0 && cand <= local) days = 7;
  }
  return new Date(cand.getTime() + days * 86_400_000 - RIYADH_OFFSET_MS);
}
