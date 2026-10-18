/**
 * Runs once when the Next.js server starts (not during `next build`).
 * Validates every setting so a misconfigured server refuses to start, with a list of
 * what is wrong, instead of failing later on the first request that needs a value.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnv } = await import("./lib/env");
    loadEnv();
    // one log line a minute while the server uses more than 400 MB (what grew before a crash)
    const { startMemoryLog } = await import("./server/monitoring/memory");
    startMemoryLog();
    // r68: expired cache entries are removed every minute and parsed content files are released when idle, so the
    // memory comes back after a class (src/server/cache/idle.ts)
    const { startCacheSweeper } = await import("./server/cache/idle");
    startCacheSweeper();
    // One-time background jobs after an update — ON by default again (r68), safely: 2 minutes after the start, ONE
    // after another, in small batches with a memory gate and checkpoints, through the light job runner
    // (src/server/jobs/runner.ts): privatizeCopiesInBackground → migrateStarsInBackground →
    // fixStuckQuestionsInBackground (instrumentation-node.ts). BACKGROUND_JOBS=off switches them off.
    const { backgroundJobsOn } = await import("./server/jobs/startup");
    if (backgroundJobsOn()) {
      const m = await import("./instrumentation-node");
      m.startBackgroundJobs();
    }
  }
}

/**
 * Server errors of any request go to the school's error log (Admin → Errors), message and path only.
 * The Node-only code lives in instrumentation-node.ts and is imported inside a NEXT_RUNTIME check, so the Edge
 * build never includes it (it uses node:crypto through the database layer).
 */
export async function onRequestError(err: unknown, request: { path?: string }): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logRequestError } = await import("./instrumentation-node");
    await logRequestError(err, request);
  }
}
