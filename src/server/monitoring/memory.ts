/**
 * 🧠 Memory watch for the web server (512 MB plan).
 *
 *   startMemoryLog   every 60 s: when the process uses more than MEMORY_LOG_MB (400 MB RSS), one log line with
 *                    rss / heap / external / arrayBuffers, so a crash in Render's log is preceded by what grew.
 *   memoryHigh       true when the RSS is past MEMORY_BUSY_MB (380 MB): heavy background work (the daily job, the
 *                    alert scan, the ReadMaster library) is not STARTED then — it starts on a later visit instead.
 *   runHeavy         heavy background work of this process runs one piece at a time (two admins opening the home
 *                    page at the same moment never run two school-wide scans side by side).
 */
import { log } from "./log";

const MB = 1048576;
export const MEMORY_LOG_MB = 400;
export const MEMORY_BUSY_MB = 380;

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
    if (snap.rssMB > overMb) log("warn", "memory.high", snap);
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
