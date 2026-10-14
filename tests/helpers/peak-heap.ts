/**
 * Peak heap growth of one piece of work (r68 memory tests): a full garbage collection first (exposed with v8 flags
 * when the test runner did not pass --expose-gc), then heapUsed sampled every 5 ms while it runs. Returns the result,
 * the peak growth over the start (MB) and the growth still held afterwards (MB).
 */
import v8 from "node:v8";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const MB = 1048576;

/** A real full GC in this process (the flag is switched on at run time when node was started without it). */
export function forceGc(): () => void {
  const g = globalThis as { gc?: () => void };
  if (!g.gc) {
    try { v8.setFlagsFromString("--expose-gc"); g.gc = vm.runInNewContext("gc") as () => void; } catch { /* not available */ }
  }
  return g.gc ?? (() => undefined);
}

/**
 * Runs a measuring script in a child process with a REAL `--expose-gc` (the flag switched on at run time does not give
 * exact numbers) and the same TypeScript loader as this process; returns the JSON object it prints last.
 */
export function runWithGc<T>(file: string, args: string[] = [], timeoutMs = 600_000, nodeFlags: string[] = []): T {
  const execArgv = process.execArgv.filter((a) => !a.startsWith("--test") && a !== "--expose-gc");
  const r = spawnSync(process.execPath, [...execArgv, "--expose-gc", ...nodeFlags, file, ...args], { encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const lines = String(r.stdout ?? "").trim().split("\n").filter((l) => l.startsWith("{") && l.includes("\"result\""));
  if (!lines.length) throw new Error(`no result from ${file}: ${String(r.stderr ?? "").slice(-2000)}`);
  return (JSON.parse(lines[lines.length - 1]) as { result: T }).result;
}

export async function peakHeap<T>(fn: () => Promise<T>): Promise<{ value: T; peakMb: number; heldMb: number }> {
  const gc = forceGc();
  gc(); gc();
  const start = process.memoryUsage().heapUsed;
  let peak = start;
  const timer = setInterval(() => { const h = process.memoryUsage().heapUsed; if (h > peak) peak = h; }, 5);
  try {
    const value = await fn();
    const h = process.memoryUsage().heapUsed; if (h > peak) peak = h;
    clearInterval(timer);
    gc(); gc();
    return { value, peakMb: Math.round(((peak - start) / MB) * 10) / 10, heldMb: Math.round(((process.memoryUsage().heapUsed - start) / MB) * 10) / 10 };
  } finally { clearInterval(timer); }
}
