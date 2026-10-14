/**
 * ⏩ Work that the student does not wait for (Update 42B): decision logs, notifications, assignment statuses,
 * skill evidence from other activities, alert scans … run AFTER the response is sent.
 *
 *   inside a Next.js request  → next/server `after()` (the response is sent first, the work runs right after it)
 *   anywhere else (tests, scripts, the daily job, or before `next/server` has loaded) → setImmediate
 *
 * A failure is logged (it never reaches the student, whose answer is already saved). Tests and scripts wait for
 * everything scheduled with `afterResponseSettled()`.
 */
import { log } from "../monitoring/log";

type AfterFn = (task: () => Promise<void>) => void;

/** next/server's after(), loaded once when this module is first imported (null outside Next.js). */
let nextAfter: AfterFn | null | undefined;
const loading: Promise<void> = (async () => {
  try {
    const m = (await import("next/server")) as unknown as { after?: AfterFn };
    nextAfter = typeof m.after === "function" ? m.after : null;
  } catch {
    nextAfter = null;
  }
})();
void loading;

/** Scheduled or running background work of this process (tests and scripts wait for it). */
const pending = new Set<Promise<void>>();
let ran = 0;

/** Runs `fn` after the response. `label` names it in the error log. */
export function runAfterResponse(label: string, fn: () => Promise<unknown> | unknown): void {
  let release!: () => void;
  const done = new Promise<void>((r) => { release = r; });
  const task = async (): Promise<void> => {
    try { await fn(); }
    catch (e) { log("error", "after_response.failed", { label, error: e }); }
    finally { ran++; release(); }
  };
  if (nextAfter) {
    try { nextAfter(task); return; } catch { /* not inside a request (a script, the daily job): run it here */ }
  }
  pending.add(done);
  void done.finally(() => pending.delete(done));
  if (held) { held.push(() => void task()); return; }
  setImmediate(() => { void task(); });
}

let held: (() => void)[] | null = null;
/**
 * Tests (page timing): work scheduled outside a request waits until the returned `release()` — as next/server's
 * `after()` runs it only once the response is sent — so a page's measured time never includes it.
 */
export function holdAfterResponse(): () => Promise<void> {
  held ??= [];
  return async () => {
    const q = held ?? [];
    held = null;
    for (const run of q) run();
    await afterResponseSettled();
  };
}

/** Waits until every piece of work scheduled outside a request has finished (including work it scheduled). */
export async function afterResponseSettled(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}

/** How many deferred tasks have finished in this process (tests). */
export const afterResponseRuns = (): number => ran;
