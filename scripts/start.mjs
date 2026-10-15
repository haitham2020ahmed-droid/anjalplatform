#!/usr/bin/env node
/**
 * Starts the web server with a SAFE heap limit (Update 42A).
 *
 * Without a limit, Node sizes its heap from the machine, not from the container: on a 512 MB plan (Render Starter) the
 * server could grow until the container is killed, or V8 aborts with "FatalProcessOutOfMemory" and every request in
 * flight gets a 502. With --max-old-space-size at about 70% of the memory really available, V8 collects garbage early
 * enough and leaves room for buffers, the database driver and the PDF engine outside the JavaScript heap.
 *
 *   memory available = WEB_MEMORY_MB (if set) → else the container's limit (cgroup v2 / v1) → else 512 MB
 *   heap limit       = 70% of it, but always leaving RESERVE_MB (210 MB) outside the heap for the database engine,
 *                      the compiled code, buffers and the PDF engine — 302 MB on a 512 MB plan (r68; was 358 MB, which
 *                      let the heap grow until the CONTAINER was killed at 512 MB); at least 256 MB; unless NODE_OPTIONS
 *                      already sets --max-old-space-size
 *   semi-space       --max-semi-space-size=8 on plans up to 1 GB (r68): a bounded young generation (3 × 8 MB), so a
 *                      class rush's short-lived garbage is collected young instead of piling into the old space
 *   MALLOC_ARENA_MAX = 2 (unless set): less native memory lost to per-thread malloc arenas (Update 46)
 *
 * Runs `next start` (npm start, local or Render's Node runtime) or, with --standalone (the Docker image), its server.js.
 * Extra arguments are passed on (e.g. `npm start -- -p 4000`).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MB = 512;
const SHARE = 0.7;
const MIN_HEAP_MB = 256;
/** memory kept outside the JavaScript heap (Prisma's query engine, code, buffers, the PDF engine) */
const RESERVE_MB = 210;
/** young-generation semi-space (MB) on small plans */
const SEMI_SPACE_MB = 8;

/** The container's memory limit in MB, or null when there is none (cgroup v2, then v1). */
export function cgroupLimitMb(read = (p) => readFileSync(p, "utf8")) {
  for (const p of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const raw = read(p).trim();
      if (!/^\d+$/.test(raw)) continue; // "max" = no limit
      const mb = Number(raw) / 1048576;
      if (mb > 0 && mb < 1024 * 1024) return Math.floor(mb); // v1 reports a huge number when unlimited
    } catch { /* not on Linux, or no cgroup */ }
  }
  return null;
}

/** The heap limit for the server, in MB. */
export function memoryMb(opts) {
  const fromEnv = Number(opts.webMemoryMb);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : opts.cgroupMb ?? DEFAULT_MB;
}
export function heapLimitMb(opts) {
  const total = memoryMb(opts);
  return Math.max(MIN_HEAP_MB, Math.min(Math.round(total * SHARE), total - RESERVE_MB));
}

/** The V8 flags for the server (only those NODE_OPTIONS does not set already). */
export function nodeFlags(opts, nodeOptions = "") {
  const flags = [];
  if (!/--max-old-space-size=\d+/.test(nodeOptions)) flags.push(`--max-old-space-size=${heapLimitMb(opts)}`);
  if (!/--max-semi-space-size=\d+/.test(nodeOptions) && memoryMb(opts) <= 1024) flags.push(`--max-semi-space-size=${SEMI_SPACE_MB}`);
  return flags;
}

function main() {
  const nodeOptions = process.env.NODE_OPTIONS ?? "";
  const set = /--max-old-space-size=\d+/.test(nodeOptions);
  const mem = { webMemoryMb: process.env.WEB_MEMORY_MB, cgroupMb: cgroupLimitMb() };
  const heap = heapLimitMb(mem);
  const rest = process.argv.slice(2);
  let entry;
  if (rest[0] === "--standalone") {
    // the Docker image (.next/standalone): its own server.js
    const server = join(process.cwd(), "server.js");
    if (!existsSync(server)) { console.error(`[start] ${server} not found`); process.exit(1); }
    entry = [server, ...rest.slice(1)];
  } else {
    let next;
    try { next = createRequire(join(ROOT, "package.json")).resolve("next/dist/bin/next"); }
    catch { console.error("[start] Next.js is not installed: run `npm ci` (or `npm install`) first."); process.exit(1); }
    entry = [next, "start", ...rest];
  }
  // r81: on small plans the cache sweeper may run a full garbage collection while the server is idle (cache/idle.ts),
  // so memory left by a busy period is given back instead of sitting at ~400 MB until the next request
  const gcFlag = memoryMb(mem) <= 1024 && !/--expose-gc/.test(nodeOptions) ? ["--expose-gc"] : [];
  const args = [...nodeFlags(mem, nodeOptions), ...gcFlag, ...entry];
  console.log(`[start] ${args.filter((a) => a.startsWith("--")).join(" ") || "flags from NODE_OPTIONS"} · heap limit ${set ? "from NODE_OPTIONS" : `${heap} MB`} (memory: ${process.env.WEB_MEMORY_MB ? `WEB_MEMORY_MB=${process.env.WEB_MEMORY_MB}` : cgroupLimitMb() ? `container limit ${cgroupLimitMb()} MB` : `default ${DEFAULT_MB} MB`})`);
  // Update 46: glibc gives every thread (Node's thread pool, the database engine's threads) its own malloc arena; on a
  // small container the unused space of those arenas counts as used memory. Two arenas keep the RSS close to what
  // is really in use (a common setting for Node on 512 MB containers). An explicit MALLOC_ARENA_MAX is kept.
  const env = { ...process.env, MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || "2" };
  const child = spawn(process.execPath, args, { stdio: "inherit", env });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
