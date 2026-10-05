/**
 * Job runner for the "jobs" container (Phase 13): runs each job in JOBS at its time,
 * one at a time, as a separate process (a crash or memory leak in one job cannot
 * affect the others or the web app).
 *
 * Monitoring hooks (optional, environment):
 *   HEARTBEAT_URL_<JOB>   pinged after a successful run, e.g. a Healthchecks.io URL;
 *                         the service alerts you if a job stops running ("dead man's switch")
 *   ALERT_WEBHOOK_URL     receives a JSON message when a job fails (Slack, Teams, …)
 *   RUN_ON_START=<job>    run that job once immediately (useful after deploys)
 */
import { spawn } from "node:child_process";
import { log } from "../../src/server/monitoring/log";
import { JOBS, nextRun, type JobSpec } from "./schedule";

const envKey = (name: string) => `HEARTBEAT_URL_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;

async function notify(url: string | undefined, body: unknown): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    log("warn", "notify.failed", { error: e });
  }
}

function run(job: JobSpec): Promise<number> {
  return new Promise((resolve) => {
    const started = Date.now();
    log("info", "job.start", { job: job.name });
    const child = spawn("npm", ["run", "--silent", job.script], { stdio: "inherit", env: process.env });
    child.on("exit", async (code) => {
      const ms = Date.now() - started;
      if (code === 0) {
        log("info", "job.done", { job: job.name, ms });
        await notify(process.env[envKey(job.name)], { job: job.name, ok: true, ms });
      } else {
        log("error", "job.failed", { job: job.name, code, ms });
        await notify(process.env.ALERT_WEBHOOK_URL, { text: `Al-Anjal ELA: job "${job.name}" failed (exit ${code}). Check the jobs container logs.` });
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  let stopping = false;
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { stopping = true; log("info", "scheduler.stop", { signal: sig }); process.exit(0); });
  const first = JOBS.find((j) => j.name === process.env.RUN_ON_START);
  if (first) await run(first);
  log("info", "scheduler.start", { jobs: JOBS.map((j) => `${j.name} @ ${j.at} (Riyadh)`) });
  while (!stopping) {
    const now = new Date();
    const [job, at] = JOBS.map((j) => [j, nextRun(j.at, now)] as const).sort((a, b) => a[1].getTime() - b[1].getTime())[0];
    log("info", "scheduler.next", { job: job.name, at: at.toISOString() });
    // sleep in chunks of at most 1 hour so clock changes on the host are picked up
    while (Date.now() < at.getTime()) await new Promise((r) => setTimeout(r, Math.min(at.getTime() - Date.now(), 3_600_000)));
    await run(job);
  }
}

main().catch((e) => {
  log("error", "scheduler.crash", { error: e });
  process.exit(1);
});
