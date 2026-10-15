/**
 * 🧠 Memory watch for the web server (512 MB plan).
 *
 *   startMemoryLog   every 60 s: when the process uses more than MEMORY_LOG_MB (400 MB RSS), one log line with
 *                    rss / heap / external / arrayBuffers, so a crash in Render's log is preceded by what grew.
 *   memoryHigh       true when the RSS is past MEMORY_BUSY_MB (400 MB on 512 MB): heavy background work (the daily job, the
 *                    alert scan, the ReadMaster library) is not STARTED then — it starts on a later visit instead.
 *   runHeavy         heavy background work of this process runs one piece at a time (two admins opening the home
 *                    page at the same moment never run two school-wide scans side by side).
 */
import { log } from "./log";
import { cacheSizes } from "../cache/idle";

const MB = 1048576;
export const MEMORY_LOG_MB = 400;
/** r68: 78 % of the server's memory (400 MB on the 512 MB plan; WEB_MEMORY_MB on a bigger one) — the same line as the job runner's gate */
export const MEMORY_BUSY_MB = Math.round((Number(process.env.WEB_MEMORY_MB) || 512) * 0.78);

export function memorySnapshot(): { rssMB: number; heapUsedMB: number; heapTotalMB: number; externalMB: number; arrayBuffersMB: number } {
  const m = process.memoryUsage();
  return { rssMB: Math.round(m.rss / MB), heapUsedMB: Math.round(m.heapUsed / MB), heapTotalMB: Math.round(m.heapTotal / MB), externalMB: Math.round(m.external / MB), arrayBuffersMB: Math.round(m.arrayBuffers / MB) };
}

/** RSS of this process in MB (cheap: one syscall). */
export const rssMb = (): number => Math.round(process.memoryUsage.rss() / MB);

/** The server is close to its memory limit: do not start optional heavy work now (production server only: tests,
 *  scripts and the jobs worker always run their work). MEMORY_BUSY_MB overrides the limit (e.g. on a bigger plan). */
export const memoryHigh = (limitMb = Number(process.env.MEMORY_BUSY_MB) || MEMORY_BUSY_MB): boolean =>
  process.env.NODE_ENV === "production" && rssMb() > limitMb;

const G = globalThis as unknown as { __memLog?: ReturnType<typeof setInterval>; __heavyTail?: Promise<void> };

/** Starts the 60-second memory log (once per process). */
export function startMemoryLog(everyMs = 60_000, overMb = Number(process.env.MEMORY_LOG_MB) || MEMORY_LOG_MB): void {
  if (G.__memLog) return;
  G.__memLog = setInterval(() => {
    const snap = memorySnapshot();
    // r68: with the biggest caches, so the log says WHAT grew (src/server/cache/idle.ts)
    if (snap.rssMB > overMb) log("warn", "memory.high", { ...snap, caches: cacheSizes().slice(0, 5).map((c) => `${c.name}:${c.size}`).join(" ") });
  }, everyMs);
  (G.__memLog as { unref?: () => void }).unref?.();
}

/**
 * Runs heavy background work one piece at a time in this process (FIFO). The result of `fn` is returned; a failure
 * of one piece never blocks the next.
 */
export function runHeavy<T>(fn: () => Promise<T>): Promise<T> {
  const prev = G.__heavyTail ?? Promise.resolve();
  const run = prev.then(fn, fn);
  G.__heavyTail = run.then(() => undefined, () => undefined);
  return run;
}

const GB = globalThis as unknown as { __buildTail?: Promise<void>; __buildsWaiting?: number };
/** r84: how long a big cache build waits for the one running before it starts anyway (never a long stall). */
export const BUILD_WAIT_MS = 3_000;

/**
 * 🧠 r84 first use after a deploy: the BIG in-memory builds (the school's NAFS index, a grade's MAP question pools, the
 * Learning Continuum index) run one at a time in this process, so a fresh server never builds two of them side by side
 * (each reads thousands of rows; two together were the peak that got a fresh 512 MB server killed).
 *   - only a build waits: a request whose value is cached (or already being built: concurrent misses share one
 *     promise) never comes here;
 *   - its own lane, not runHeavy's queue: a build never waits behind the daily job or a school-wide scan;
 *   - a build waits at most `maxWaitMs` (BUILD_WAIT_MS) for the one before it, then starts anyway: a student's next
 *     question is never held for long.
 */
export function heavyBuild<T>(fn: () => Promise<T>, maxWaitMs = BUILD_WAIT_MS): Promise<T> {
  const prev = GB.__buildTail;
  let run: Promise<T>;
  if (!prev) run = fn();
  else {
    GB.__buildsWaiting = (GB.__buildsWaiting ?? 0) + 1;
    run = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, maxWaitMs);
      (timer as { unref?: () => void }).unref?.();
      void prev.then(() => { clearTimeout(timer); resolve(); });
    }).then(() => { GB.__buildsWaiting = (GB.__buildsWaiting ?? 1) - 1; return fn(); });
  }
  const tail: Promise<void> = run.then(() => undefined, () => undefined);
  GB.__buildTail = tail;
  void tail.then(() => { if (GB.__buildTail === tail) GB.__buildTail = undefined; });
  return run;
}
/** Builds waiting for the lane now (tests and the memory log). */
export const buildsWaiting = (): number => GB.__buildsWaiting ?? 0;
