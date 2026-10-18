/**
 * ⏩ Work that the student does not wait for (Update 42B): decision logs, notifications, assignment statuses,
 * skill evidence from other activities, alert scans … run AFTER the response is sent.
 *
 * r68 (150 students answering at once on 0.5 CPU / 512 MB): this work used to start at once for EVERY answer (next/server
 * `after()`), so a class rush ran hundreds of these side by side — each holding database connections and memory — and the
 * answers themselves waited for a free connection ("Retry", a stuck "Checking…", out-of-memory restarts). Now it goes
 * into ONE bounded queue per process:
 *
 *   - at most AFTER_CONCURRENCY tasks run at a time (default 2), so the request path keeps the database connections;
 *   - heavy school-wide work (admin scans, the daily job, library loads: "heavy" lane) runs one at a time and never
 *     blocks the light per-answer work;
 *   - duplicate work is merged: a task with a `key` (e.g. the star status of one student + skill) that is already
 *     waiting is replaced by the newest one (it recomputes from the data, so once is enough);
 *   - the queue is bounded (AFTER_QUEUE_MAX): above it the oldest optional work is dropped and logged once a minute —
 *     never an answer (answers are saved before any of this runs).
 *
 * A failure is logged (it never reaches the student). Tests and scripts wait for everything with `afterResponseSettled()`.
 */
import { log } from "../monitoring/log";

export interface AfterOpts {
  /** work with the same key that is still waiting is replaced by this one (merged) */
  key?: string;
  /** "heavy": school-wide work, one at a time, in its own lane */
  lane?: "light" | "heavy";
}

interface Task { label: string; key?: string; lane: "light" | "heavy"; fn: () => Promise<unknown> | unknown; releases: (() => void)[] }

const HEAVY_LABELS = /^(admin\.|teacher\.daily|readmaster\.library)/;
export const AFTER_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.AFTER_CONCURRENCY) || 2));
export const AFTER_QUEUE_MAX = Math.max(100, Number(process.env.AFTER_QUEUE_MAX) || 20_000);

interface State { light: Task[]; heavy: Task[]; running: { light: number; heavy: number }; keyed: Map<string, Task>; dropped: number; merged: number; lastDropLog: number; ran: number; peakQueued?: number }
const G = globalThis as unknown as { __afterQueue?: State };
const st = (): State => (G.__afterQueue ??= { light: [], heavy: [], running: { light: 0, heavy: 0 }, keyed: new Map(), dropped: 0, merged: 0, lastDropLog: 0, ran: 0 });

/** Scheduled or running background work of this process (tests and scripts wait for it). */
const pending = new Set<Promise<void>>();

let held: (() => void)[] | null = null;

/** Runs `fn` after the response, in the bounded queue. `label` names it in the error log. */
export function runAfterResponse(label: string, fn: () => Promise<unknown> | unknown, opts: AfterOpts = {}): void {
  let release!: () => void;
  const done = new Promise<void>((r) => { release = r; });
  pending.add(done);
  void done.finally(() => pending.delete(done));
  const task: Task = { label, key: opts.key, lane: opts.lane ?? (HEAVY_LABELS.test(label) ? "heavy" : "light"), fn, releases: [release] };
  if (held) { held.push(() => push(task)); return; }
  push(task);
}

const settle = (t: Task) => { for (const r of t.releases.splice(0)) r(); };

function push(task: Task): void {
  const s = st();
  if (task.key) {
    const waiting = s.keyed.get(task.key);
    if (waiting) {
      // merged: the waiting task runs the NEWEST work once (it recomputes from the data); both callers settle with it
      waiting.fn = task.fn;
      waiting.label = task.label;
      waiting.releases.push(...task.releases);
      s.merged++;
      return;
    }
    s.keyed.set(task.key, task);
  }
  (task.lane === "heavy" ? s.heavy : s.light).push(task);
  s.peakQueued = Math.max(s.peakQueued ?? 0, s.light.length + s.heavy.length);
  if (s.light.length + s.heavy.length > AFTER_QUEUE_MAX) {
    // the oldest optional work is skipped (recomputed by the next visit); answers are never part of it
    const victim = (s.light.length ? s.light : s.heavy).shift()!;
    if (victim.key && s.keyed.get(victim.key) === victim) s.keyed.delete(victim.key);
    s.dropped++;
    const now = Date.now();
    if (now - s.lastDropLog > 60_000) { s.lastDropLog = now; log("warn", "after_response.dropped", { label: victim.label, dropped: s.dropped, queued: s.light.length + s.heavy.length }); }
    settle(victim);
  }
  pump();
}

function pump(): void {
  const s = st();
  while (s.running.light < AFTER_CONCURRENCY && s.light.length) start(s.light.shift()!);
  while (s.running.heavy < 1 && s.heavy.length) start(s.heavy.shift()!);
}

function start(task: Task): void {
  const s = st();
  if (task.key && s.keyed.get(task.key) === task) s.keyed.delete(task.key);
  s.running[task.lane]++;
  // a fresh macrotask: the response is written first, and a long chain of work never grows the stack
  setImmediate(() => {
    void (async () => {
      try { await task.fn(); }
      catch (e) { log("error", "after_response.failed", { label: task.label, error: e }); }
      finally { s.ran++; s.running[task.lane]--; settle(task); pump(); }
    })();
  });
}

/**
 * Tests (page timing): work scheduled until the returned `release()` waits — as on the server, where it runs only
 * once the response is sent — so a page's measured time never includes it.
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

/** Waits until every piece of work scheduled has finished (including work it scheduled). */
export async function afterResponseSettled(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}

/** How many deferred tasks have finished in this process (tests). */
export const afterResponseRuns = (): number => st().ran;

/** The queue now (tests, the memory log). */
export function afterQueueStats(): { queued: number; running: number; dropped: number; merged: number; peakQueued: number } {
  const s = st();
  return { queued: s.light.length + s.heavy.length, running: s.running.light + s.running.heavy, dropped: s.dropped, merged: s.merged, peakQueued: s.peakQueued ?? 0 };
}
