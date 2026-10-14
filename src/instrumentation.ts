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
    // ✏️ teachers' edited copies made before they became private: private now (once, in the background, never blocking)
    setTimeout(() => { void import("./instrumentation-node").then((m) => m.privatizeCopiesInBackground()).catch(() => undefined); }, 15_000).unref?.();
    // 🛠 stuck questions (not under a skill, drafts, waiting): fixed once after the update, in the background (report: System check)
    setTimeout(() => { void import("./instrumentation-node").then((m) => m.fixStuckQuestionsInBackground()).catch(() => undefined); }, 60_000).unref?.();
    // ⭐ skill stars computed from the practice already there (once, in the background, batched)
    setTimeout(() => { void import("./instrumentation-node").then((m) => m.migrateStarsInBackground()).catch(() => undefined); }, 30_000).unref?.();
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
