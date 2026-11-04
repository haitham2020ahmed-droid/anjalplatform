/**
 * 🛟 r89 (server-stability audit, Oct 2026): the last-resort net for the whole process.
 *
 * Node.js's default behavior: an uncaught exception, or an unhandled promise rejection (Node ≥15), terminates the
 * ENTIRE process immediately — not just the one request that triggered it. On this single-instance 512 MB server,
 * that means one bad error anywhere outside a request's own try/catch (a `setInterval`/`setTimeout` callback that
 * throws, a fire-and-forget call that slips through without a `.catch`) takes the whole school offline until Render
 * notices the health check failing and restarts the instance — minutes of downtime from one stray error.
 *
 * This installs a single process-wide handler for both. It only logs — it deliberately never calls `process.exit()`
 * — because for almost every realistic error here (a timer's internal bug, a missed `.catch`) the rest of the
 * process is still perfectly able to keep serving requests; exiting would turn a harmless one-off into guaranteed
 * downtime. This matches how the rest of the codebase already treats failures (the job runner, the daily job's
 * per-step try/catch, every error boundary): log it, keep going. Idempotent — safe to call more than once (e.g. if
 * a test imports this module twice); only the first call attaches the listeners.
 */
import { log } from "./log";

const G = globalThis as unknown as { __crashGuardsInstalled?: boolean };

export function installCrashGuards(): void {
  if (G.__crashGuardsInstalled) return;
  G.__crashGuardsInstalled = true;
  process.on("uncaughtException", (err) => {
    try { log("error", "process.uncaught_exception", { error: String((err as Error)?.stack ?? err) }); } catch { /* never throw from the guard itself */ }
  });
  process.on("unhandledRejection", (reason) => {
    try { log("error", "process.unhandled_rejection", { error: String((reason as Error)?.stack ?? reason) }); } catch { /* never throw from the guard itself */ }
  });
}
