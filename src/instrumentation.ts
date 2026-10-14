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
    // One-time background jobs after an update, ONE AFTER ANOTHER, 2 minutes after the start. OFF unless the server
    // sets BACKGROUND_JOBS=on: on the 512 MB Render instance they ran together and the server restarted (out of
    // memory). Admins run them from System check / the Question Bank instead.
    if ((process.env.BACKGROUND_JOBS ?? "").toLowerCase() === "on") {
      setTimeout(() => {
        void (async () => {
          const m = await import("./instrumentation-node");
          await m.privatizeCopiesInBackground();   // ✏️ teachers' edited copies → private
          await m.migrateStarsInBackground();      // ⭐ skill stars from the practice already there
          await m.fixStuckQuestionsInBackground(); // 🛠 stuck questions (report: System check)
        })().catch(() => undefined);
      }, 120_000).unref?.();
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
