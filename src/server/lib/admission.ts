/**
 * 🚦 Admission control for the answer path (r68, a class rush on 0.5 CPU / 512 MB).
 *
 * Every answer being worked on holds its reads, the engine's state and its database connection(s) in memory. When 150
 * students press Check in the same few seconds, working on ALL of them at once multiplied that memory and made every one
 * slow (and the database pool timed out). Now at most `limit` answers are worked on at the same time per server
 * process (ANSWER_CONCURRENCY, default 12); the others wait their turn in order (a few hundred ms) — the memory of the
 * answer path is bounded whatever the number of students. A request that waited longer than `maxWaitMs` gets a
 * Busy error: the player sends it again by itself (each answer is applied once).
 */
export class BusyError extends Error { constructor() { super("The server is busy. Trying again…"); } }

interface Lane { running: number; waiting: (() => void)[]; peak: number; served: number; rejected: number }
const G = globalThis as unknown as { __admission?: Map<string, Lane> };
const lanes = (): Map<string, Lane> => (G.__admission ??= new Map());
const laneOf = (name: string): Lane => { let l = lanes().get(name); if (!l) lanes().set(name, (l = { running: 0, waiting: [], peak: 0, served: 0, rejected: 0 })); return l; };

export const ANSWER_CONCURRENCY = Math.max(2, Math.min(64, Number(process.env.ANSWER_CONCURRENCY) || 12));
export const ADMISSION_MAX_WAIT_MS = 25_000;

/** Runs `fn` when one of the lane's `limit` places is free (in arrival order; a freed place is handed to the next). */
export async function admitted<T>(name: string, fn: () => Promise<T>, limit = ANSWER_CONCURRENCY, maxWaitMs = ADMISSION_MAX_WAIT_MS): Promise<T> {
  const l = laneOf(name);
  if (l.running >= limit || l.waiting.length) {
    // wait for a place: the request that leaves hands its place over (running stays counted)
    await new Promise<void>((go, fail) => {
      const enter = () => { clearTimeout(t); go(); };
      const t = setTimeout(() => { const i = l.waiting.indexOf(enter); if (i >= 0) l.waiting.splice(i, 1); l.rejected++; fail(new BusyError()); }, maxWaitMs);
      (t as { unref?: () => void }).unref?.();
      l.waiting.push(enter);
    });
  } else l.running++;
  l.peak = Math.max(l.peak, l.running);
  try { return await fn(); }
  finally {
    l.served++;
    const next = l.waiting.shift();
    if (next) next(); else l.running--;
  }
}

/** The lane now (tests, the memory log): running, waiting, the most at once, served, refused for waiting too long. */
export function admissionStats(name: string): { running: number; waiting: number; peak: number; served: number; rejected: number } {
  const l = laneOf(name);
  return { running: l.running, waiting: l.waiting.length, peak: l.peak, served: l.served, rejected: l.rejected };
}
