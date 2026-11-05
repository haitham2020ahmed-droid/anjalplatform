/**
 * 🧠 Memory watch for the web server (512 MB plan).
 *
 *   startMemoryLog   every 60 s: when the process uses more than MEMORY_LOG_MB (400 MB RSS), one log line with
 *                    rss / heap / external / arrayBuffers, so a crash in Render's log is preceded by what grew.
 *   memoryHigh       true when the RSS is past MEMORY_BUSY_MB (400 MB on 512 MB): heavy background work (the daily job, the
 *                    alert scan, the ReadMaster library) is not STARTED then — it starts on a later visit instead.
 *   runHeavy         heavy background work of this process runs one piece at a time (two admins opening the home
 *                    page at the same moment never run two school-wide scans side by side).
 *   startSelfRestart Nov 2026 (owner-approved): Next.js keeps every distinct page's compiled code resident for the
 *                    life of the process (normal framework behavior, not a leak), so RSS climbs across a school day
 *                    as more distinct pages are first visited and never comes back down — eventually crossing the
 *                    512 MB container limit and getting OOM-killed by Render mid-request (the "retry home page
 *                    twice" symptom a teacher/student sees). Rather than upgrade the plan or split the app into
 *                    several services, the server restarts ITSELF before that happens, in three layers:
 *                      1) a guaranteed restart once a day at RESTART_RIYADH_HOUR (4 AM Riyadh), only if idle;
 *                      2) a safety-net restart at ANY time if RSS crosses RESTART_RSS_MB (420), only if idle;
 *                      3) an emergency restart at ANY time, busy or not, if RSS crosses EMERGENCY_RSS_MB (480) — added
 *                         after a live incident where opening a handful of admin pages back to back pushed RSS from
 *                         ~400 to 516 MB (over the 512 MB limit) in under a minute while the server was in active
 *                         use, so layer 2's idle requirement never got a chance to fire before the real OOM-kill;
 *                      4) "idle" (layers 1 and 2 only) = no real page request for RESTART_IDLE_MS (10 min) — reusing
 *                         notePath()'s timestamps below, which only ever fire from a real signed-in page/action
 *                         (src/server/auth/next.ts), never from Render's own /api/health pings (that route never
 *                         calls getActor()), so a steady stream of health checks never looks like "someone is using it".
 *                    A clean `process.exit(0)` is safe here: Render's own orchestration restarts the web service
 *                    automatically (the same restart already seen after the real OOM-kill), and even the emergency
 *                    layer (which does not wait for idle) only costs the one in-flight request a retry — far
 *                    cheaper than every request on the server failing when a real OOM-kill hits.
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

const G = globalThis as unknown as { __memLog?: ReturnType<typeof setInterval>; __heavyTail?: Promise<void>; __paths?: { at: number; path: string; rss: number }[]; __memStart?: number; __memLast?: number; __selfRestart?: ReturnType<typeof setInterval> };

/**
 * r86 "black box" (live: the server restarted ~1–2 min after a deploy with NO log line — killed between two 60 s
 * samples): the last pages opened (path + RSS when they started) are kept, and the memory log now samples every 15 s,
 * always logs during the first 5 minutes after a start ("memory.boot"), logs a sudden jump of 60 MB+ ("memory.jump")
 * and anything over MEMORY_LOG_MB (now 350 MB) — each line names the last pages, so the next crash says what caused it.
 */
export function notePath(path: string | null | undefined): void {
  if (!path) return;
  const list = (G.__paths ??= []);
  list.push({ at: Date.now(), path: String(path).slice(0, 80), rss: rssMb() });
  if (list.length > 8) list.splice(0, list.length - 8);
}
export const recentPaths = (): string => (G.__paths ?? []).slice(-6).map((p) => `${new Date(p.at).toISOString().slice(11, 19)} ${p.path} (${p.rss})`).join(" | ");
export const BOOT_LOG_MS = 5 * 60_000;
export const JUMP_MB = 60;

/** Starts the memory log (once per process): every 15 s, see above. */
export function startMemoryLog(everyMs = 15_000, overMb = Number(process.env.MEMORY_LOG_MB) || 350): void {
  if (G.__memLog) return;
  G.__memStart = Date.now();
  G.__memLog = setInterval(() => {
    const snap = memorySnapshot();
    const last = G.__memLast ?? snap.rssMB;
    G.__memLast = snap.rssMB;
    const boot = Date.now() - (G.__memStart ?? 0) < BOOT_LOG_MS;
    const event = snap.rssMB > overMb ? "memory.high" : snap.rssMB - last >= JUMP_MB ? "memory.jump" : boot ? "memory.boot" : null;
    // r68: with the biggest caches, so the log says WHAT grew (src/server/cache/idle.ts); r86: and the last pages opened
    if (event) log(event === "memory.boot" ? "info" : "warn", event, { ...snap, caches: cacheSizes().slice(0, 5).map((c) => `${c.name}:${c.size}`).join(" "), pages: recentPaths() });
  }, everyMs);
  (G.__memLog as { unref?: () => void }).unref?.();
}

/**
 * r## self-restart (owner-approved, Nov 2026): ms since the last real page request, reusing notePath()'s timestamps
 * (see the file-top comment) — or since this process started, if no page has been visited yet.
 */
export function idleMs(now = Date.now()): number {
  const paths = G.__paths ?? [];
  const last = paths.length ? paths[paths.length - 1].at : (G.__memStart ?? now);
  return now - last;
}

/** Minutes of no real request required before either restart layer is allowed to fire (owner-approved: 10). */
export const RESTART_IDLE_MS = (Number(process.env.RESTART_IDLE_MIN) || 10) * 60_000;
/** RSS (MB) that triggers the safety-net restart at any time of day, but ONLY while idle (owner-approved: 420 — a margin under the 512 MB container limit, large enough to catch even a fast spike). */
export const RESTART_RSS_MB = Number(process.env.RESTART_RSS_MB) || 420;
/**
 * r## emergency layer (Nov 2026, live incident): the safety-net above still waits for "idle", so a fast RSS jump
 * WHILE someone is actively using the server (a few admin pages opened back to back — the live incident went
 * 400ish → 516 MB in under a minute) can cross the 512 MB container limit before the server is ever seen as idle,
 * and Render OOM-kills it for real. This layer does not wait for idle at all: once RSS crosses EMERGENCY_RSS_MB, the
 * server restarts itself immediately, busy or not — a one-request hiccup is far cheaper than a hard crash for
 * everyone on the server at that moment.
 */
export const EMERGENCY_RSS_MB = Number(process.env.EMERGENCY_RSS_MB) || 480;
/** Riyadh hour of the guaranteed daily restart (owner-approved: 4 AM — quiet for a school). Riyadh is UTC+3, no DST. */
export const RESTART_RIYADH_HOUR = Number(process.env.RESTART_RIYADH_HOUR) || 4;
/** How wide the guaranteed-restart hour is before giving up for the day (so a 60 s check interval cannot miss it). */
export const GUARANTEED_RESTART_WINDOW_MIN = 15;
/** A process must have been up this long before the GUARANTEED restart is allowed to fire — keeps one restart per
 *  ~24 h even though a just-restarted process is immediately idle and may land inside the same quiet hour again. */
export const GUARANTEED_RESTART_MIN_UPTIME_MS = 20 * 60 * 60_000;
/** A process must have been up at least this long before EITHER restart layer may fire (settling room after boot). */
export const MIN_UPTIME_BEFORE_RESTART_MS = 5 * 60_000;

/** Pure decision (easy to unit-test without real timers/clocks): which restart, if any, applies right now. */
export function selfRestartReason(
  c: { nowUtc: Date; rssMB: number; idleMs: number; uptimeMs: number },
  opts: { idleMinMs?: number; rssLimitMb?: number; riyadhHour?: number; guaranteedMinUptimeMs?: number; emergencyRssLimitMb?: number } = {},
): "guaranteed" | "safety_net" | "emergency" | null {
  if (c.uptimeMs < MIN_UPTIME_BEFORE_RESTART_MS) return null;
  // emergency: no idle requirement at all — a fast jump while busy must not be allowed to reach the hard 512 MB limit
  const emergencyRssLimitMb = opts.emergencyRssLimitMb ?? EMERGENCY_RSS_MB;
  if (c.rssMB >= emergencyRssLimitMb) return "emergency";
  const idleMinMs = opts.idleMinMs ?? RESTART_IDLE_MS;
  if (c.idleMs < idleMinMs) return null;
  const riyadhHour = opts.riyadhHour ?? RESTART_RIYADH_HOUR;
  const utcHour = (riyadhHour - 3 + 24) % 24;
  const inGuaranteedWindow = c.nowUtc.getUTCHours() === utcHour && c.nowUtc.getUTCMinutes() < GUARANTEED_RESTART_WINDOW_MIN;
  const guaranteedMinUptimeMs = opts.guaranteedMinUptimeMs ?? GUARANTEED_RESTART_MIN_UPTIME_MS;
  if (inGuaranteedWindow && c.uptimeMs >= guaranteedMinUptimeMs) return "guaranteed";
  const rssLimitMb = opts.rssLimitMb ?? RESTART_RSS_MB;
  if (c.rssMB >= rssLimitMb) return "safety_net";
  return null;
}

/**
 * Starts the self-restart check (once per process): every 20 s (shortened from 60 s, Nov 2026, so a fast RSS jump
 * is caught within seconds instead of up to a minute), see the file-top comment. SELF_RESTART=off (env) is an
 * escape hatch that switches this whole mechanism off without a code change, if it is ever needed.
 */
export function startSelfRestart(checkEveryMs = 20_000): void {
  if (G.__selfRestart) return;
  G.__selfRestart = setInterval(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ((process.env.SELF_RESTART ?? "on").trim().toLowerCase() === "off") return;
    const uptimeMs = Date.now() - (G.__memStart ?? Date.now());
    const idle = idleMs();
    const reason = selfRestartReason({ nowUtc: new Date(), rssMB: rssMb(), idleMs: idle, uptimeMs });
    if (!reason) return;
    log("warn", "memory.restart", { reason, rss: rssMb(), idleMin: Math.round(idle / 60_000), uptimeMin: Math.round(uptimeMs / 60_000), pages: recentPaths() });
    process.exit(0);
  }, checkEveryMs);
  (G.__selfRestart as { unref?: () => void }).unref?.();
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
 * r## boot-memory guard (owner: a server that restarted ~1–2 min after a deploy — see the r86 note above
 * startMemoryLog): right after this process starts, a heavy build (NAFS index, MAP pools, Learning Continuum) that
 * would start while RSS is already past BOOT_DELAY_RSS_MB waits a short beat first, instead of piling a big
 * in-memory build on top of a process that hasn't finished settling from its own startup. Outside the first
 * BOOT_DELAY_WINDOW_MS, or whenever memory is comfortable, this is a no-op and the build starts exactly as before.
 */
export const BOOT_DELAY_WINDOW_MS = 2 * 60_000;
export const BOOT_DELAY_RSS_MB = Math.round((Number(process.env.WEB_MEMORY_MB) || 512) * 0.65);
const BOOT_SETTLE_MS = 4_000;

async function settleIfBooting(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const booting = Date.now() - (G.__memStart ?? 0) < BOOT_DELAY_WINDOW_MS;
  if (!booting || rssMb() <= BOOT_DELAY_RSS_MB) return;
  await new Promise<void>((resolve) => { const t = setTimeout(resolve, BOOT_SETTLE_MS); (t as { unref?: () => void }).unref?.(); });
}

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
  if (!prev) run = settleIfBooting().then(fn);
  else {
    GB.__buildsWaiting = (GB.__buildsWaiting ?? 0) + 1;
    run = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, maxWaitMs);
      (timer as { unref?: () => void }).unref?.();
      void prev.then(() => { clearTimeout(timer); resolve(); });
    }).then(() => { GB.__buildsWaiting = (GB.__buildsWaiting ?? 1) - 1; return settleIfBooting().then(fn); });
  }
  const tail: Promise<void> = run.then(() => undefined, () => undefined);
  GB.__buildTail = tail;
  void tail.then(() => { if (GB.__buildTail === tail) GB.__buildTail = undefined; });
  return run;
}
/** Builds waiting for the lane now (tests and the memory log). */
export const buildsWaiting = (): number => GB.__buildsWaiting ?? 0;
