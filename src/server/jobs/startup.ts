/**
 * 🚀 The one-time background jobs after an update (r68: ON by default again, safely). Two minutes after the start, ONE
 * after another through the light job runner (src/server/jobs/runner.ts: batches, memory gate, checkpoints, a lease per
 * school so two servers never run the same job):
 *
 *   1. ✏️ privatize-copies   teachers' edited copies made before the rule become private (src/server/questions/private-copies.ts)
 *   2. ⭐ skill-stars         every school never migrated gets its skill stars from the practice already there
 *   3. 🛠 fix-stuck           stuck questions are classified, repaired and published once per update (report: System check)
 *
 * A job another server is running, or one that paused for memory, is tried again later (every 15 minutes, for a day).
 * BACKGROUND_JOBS=off still switches all of this off.
 */
import type { Repo } from "../seeding/repo";
import { log } from "../monitoring/log";
import { runJobEverywhere, type JobDef, type RunOutcome } from "./runner";

/** ✏️ platform-wide (one pass over the Question table): its checkpoint is kept on the first school. */
export const PRIVATIZE_JOB: JobDef<string> = {
  name: "privatize-copies",
  version: "r68",
  async schools(repo) { return (await repo.findMany("School", {}, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: 1 })).map((x) => String(x.id)); },
  async step(repo, _schoolId, after) {
    const { privatizeBatch } = await import("../questions/private-copies");
    const r = await privatizeBatch(repo, after, 200);
    return { cursor: r.next, done: !r.next, progress: { privatized: r.privatized, checked: r.checked } };
  },
};

export const STARTUP_DELAY_MS = 120_000;
const RETRY_MS = 15 * 60_000;
/** busy elsewhere / paused for memory: tried again every 15 minutes for a day (a quiet moment always comes) */
const MAX_RETRIES = 96;

export const backgroundJobsOn = (env: Record<string, string | undefined> = process.env): boolean => (env.BACKGROUND_JOBS ?? "on").trim().toLowerCase() !== "off";

/** The startup jobs in order. */
export async function startupJobs(): Promise<JobDef<never>[]> {
  const [{ STARS_JOB }, { FIX_STUCK_JOB }] = await Promise.all([import("../skills/status-extras"), import("../admin/stuck-questions")]);
  return [PRIVATIZE_JOB, STARS_JOB, FIX_STUCK_JOB] as unknown as JobDef<never>[];
}

/** Runs the startup jobs once, one after another; returns what each school's run did. Never throws. */
export async function runStartupJobs(repo: Repo): Promise<RunOutcome[]> {
  const out: RunOutcome[] = [];
  for (const def of await startupJobs()) {
    try { out.push(...(await runJobEverywhere(repo, def))); }
    catch (e) { log("error", "jobs.startup_failed", { job: def.name, error: e }); }
  }
  return out;
}

const G = globalThis as unknown as { __startupJobs?: boolean };
/** Schedules the startup jobs (once per process): `delayMs` after the start, retried while busy elsewhere or paused. */
export function scheduleStartupJobs(getRepo: () => Promise<Repo>, delayMs = STARTUP_DELAY_MS): void {
  if (G.__startupJobs) return;
  G.__startupJobs = true;
  const attempt = (n: number) => {
    const t = setTimeout(() => {
      void (async () => {
        const outcomes = await runStartupJobs(await getRepo());
        const again = outcomes.filter((o) => o.reason === "busy" || o.reason === "paused" || o.reason === "failed");
        if (again.length && n < MAX_RETRIES) { log("info", "jobs.startup_retry_later", { left: again.length, attempt: n + 1 }); attempt(n + 1); }
      })().catch((e) => log("error", "jobs.startup_failed", { error: e }));
    }, n === 0 ? delayMs : RETRY_MS);
    (t as { unref?: () => void }).unref?.();
  };
  attempt(0);
}
