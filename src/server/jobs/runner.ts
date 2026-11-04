/**
 * 🏃 The light job runner (r68, MEMFIX): background jobs that are SAFE on the 512 MB / 0.5 CPU web server.
 *
 * Before: the three jobs after an update ran school-wide reads at once, side by side, right after the start — the server
 * passed its memory limit and restarted (06:38), and two servers racing on the same settings row logged
 * "Unique constraint failed on SchoolSetting_schoolId_key_key". Now every background job goes through here:
 *
 *   ONE at a time      a process-wide queue (and runHeavy: never beside an alert scan or a library load);
 *   small batches      a job is a `step` from a cursor (25 students / 200 questions): only the columns it needs, no whole
 *                      table, nothing kept between steps but the cursor and a few counters;
 *   yields             a short pause between batches, so student requests always come first;
 *   memory gate        before every batch: above JOB_RSS_MB (400 MB on 512 MB) or JOB_HEAP_MB (230 MB with a 302 MB
 *                      heap) it waits (logged once)
 *                      and tries again; after JOB_MAX_WAIT_MS it stops at its checkpoint and is tried again later;
 *   checkpoint         the cursor and counters are saved in SchoolSetting (`job.<name>`) after every batch: a restart
 *                      resumes where it stopped; a finished job is marked done for its VERSION and never runs again
 *                      (a new version runs once more);
 *   lease (2 servers)  the checkpoint row is also the job's lock: a server takes it with a compare-and-set on
 *                      `updatedBy` and renews it every batch; another server skips the job while the lease is fresh,
 *                      and takes over (from the checkpoint) only when it expired (the first server died);
 *   crash guard        a batch that stopped the server twice in a row stops the job (src/server/jobs/crash-guard.ts).
 *
 * Never throws to its caller: errors are logged and kept on the checkpoint (System check shows them).
 */
import type { Repo, Row } from "../seeding/repo";
import { log } from "../monitoring/log";
import { runHeavy } from "../monitoring/memory";
import { BOOT_ID } from "./crash-guard";
import { getHeapStatistics } from "node:v8";

/** The server's memory (WEB_MEMORY_MB, as scripts/start.mjs; 512 MB = Render Starter by default). */
const serverMemoryMb = (): number => Number(process.env.WEB_MEMORY_MB) || 512;
/** The gate's defaults follow the plan: RSS 78 % of the server's memory (400 MB on 512 MB), heap 76 % of the heap
 *  limit (230 MB with the 302 MB limit of a 512 MB plan); JOB_RSS_MB / JOB_HEAP_MB override them. */
export const defaultRssGateMb = (): number => Number(process.env.JOB_RSS_MB) || Math.round(serverMemoryMb() * 0.78);
export const defaultHeapGateMb = (): number => {
  if (Number(process.env.JOB_HEAP_MB)) return Number(process.env.JOB_HEAP_MB);
  try { return Math.round((getHeapStatistics().heap_size_limit / MB_) * 0.76); } catch { return 230; }
};
const MB_ = 1048576;

const MB = 1048576;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export interface RunnerConfig {
  /** wait while the process RSS is above this (MB) */
  rssMb: number;
  /** wait while the JavaScript heap in use is above this (MB) */
  heapMb: number;
  /** pause between two checks of a waiting job (ms) */
  waitMs: number;
  /** a job that waited this long stops at its checkpoint (tried again later) */
  maxWaitMs: number;
  /** pause between two batches (ms): student requests first */
  yieldMs: number;
  /** a lease not renewed for this long belongs to a dead server */
  leaseMs: number;
  /** the gate is checked (production server; tests switch it on) */
  enforce: boolean;
  /** memory reading (tests) */
  memory: () => { rssMb: number; heapMb: number };
}
const defaults = (): RunnerConfig => ({
  rssMb: defaultRssGateMb(),
  heapMb: defaultHeapGateMb(),
  waitMs: 5_000,
  maxWaitMs: 10 * 60_000,
  yieldMs: 25,
  leaseMs: 5 * 60_000,
  enforce: process.env.NODE_ENV === "production",
  memory: () => { const m = process.memoryUsage(); return { rssMb: m.rss / MB, heapMb: m.heapUsed / MB }; },
});

interface RunnerState { cfg: RunnerConfig; tail: Promise<void>; queue: Map<string, () => Promise<void>>; running: string | null; waitLogged: boolean; active: number; maxActive: number }
const G = globalThis as unknown as { __jobRunner?: RunnerState };
const R = (): RunnerState => (G.__jobRunner ??= { cfg: defaults(), tail: Promise.resolve(), queue: new Map(), running: null, waitLogged: false, active: 0, maxActive: 0 });

/** Tests: change the thresholds (and switch the gate on). `reset` puts the defaults back. */
export function configureRunner(patch: Partial<RunnerConfig> | "reset"): RunnerConfig {
  const r = R();
  r.cfg = patch === "reset" ? defaults() : { ...r.cfg, ...patch };
  return r.cfg;
}
/** The most jobs that ever ran at the same time in this process (tests: always 1). */
export const runnerPeakConcurrency = (): number => R().maxActive;

// ------------------------------------------------------------------ job definitions

export interface JobState<C = unknown> {
  version: string;
  cursor: C | null;
  done: boolean;
  startedAt: string;
  finishedAt: string | null;
  /** counters the job keeps (rows written, students done …) */
  progress: Record<string, number>;
  result?: unknown;
  error?: string | null;
  /** batches so far; waits for memory */
  batches: number;
  waits?: number;
  inFlight?: { boot: string; at: string } | null;
  crashes?: number;
  until?: number;
}

export interface JobStep<C> { cursor: C | null; done: boolean; progress?: Record<string, number> }

export interface JobDef<C = unknown> {
  /** short name: the checkpoint is SchoolSetting `job.<name>` (or `stateKey`) */
  name: string;
  /** a new version runs once more even where the old one finished */
  version: string;
  stateKey?: string;
  /** which schools it runs for (default: every school) */
  schools?(repo: Repo): Promise<string[]>;
  /** true = nothing to do for this school (e.g. migrated before the runner existed): marked done without running */
  skip?(repo: Repo, schoolId: string, state: JobState<C> | null): Promise<boolean>;
  /** ONE bounded batch from `cursor` (null = the start) */
  step(repo: Repo, schoolId: string, cursor: C | null, state: JobState<C>, now: Date): Promise<JobStep<C>>;
  /** after the last batch: the job's result (kept on the checkpoint) */
  finish?(repo: Repo, schoolId: string, state: JobState<C>, now: Date): Promise<unknown>;
}

export const jobKey = (def: Pick<JobDef, "name" | "stateKey">): string => def.stateKey ?? `job.${def.name}`;

const parse = (v: unknown): Record<string, unknown> => {
  if (!v) return {};
  if (typeof v === "string") { try { return (JSON.parse(v) ?? {}) as Record<string, unknown>; } catch { return {}; } }
  return v as Record<string, unknown>;
};

/** The job's saved checkpoint for a school (null: never ran). */
export async function jobState<C>(repo: Repo, def: Pick<JobDef, "name" | "stateKey">, schoolId: string): Promise<JobState<C> | null> {
  const row = await repo.findUnique("SchoolSetting", { schoolId, key: jobKey(def) });
  if (!row) return null;
  const v = parse(row.value);
  return v.version !== undefined ? (v as unknown as JobState<C>) : null;
}

// ------------------------------------------------------------------ settings rows without races

/**
 * Creates the setting row only when it is missing: true when THIS call created it (a claim). Reads first, so the usual
 * "already there" never becomes a failed insert in the log; two writers at the same moment → one wins, the other
 * gets false (no error).
 */
export async function claimSetting(repo: Repo, schoolId: string, key: string, value: unknown, updatedBy: string | null = null): Promise<boolean> {
  if (await repo.findUnique("SchoolSetting", { schoolId, key })) return false;
  try { await repo.create("SchoolSetting", { schoolId, key, value: value as object, updatedBy }); return true; }
  catch { return false; }
}

/** Writes a setting row (create or update) without the unique race. */
export async function saveSetting(repo: Repo, schoolId: string, key: string, value: unknown, updatedBy: string | null = null): Promise<void> {
  await repo.upsert("SchoolSetting", { schoolId, key }, { value: value as object, updatedBy }, { value: value as object, updatedBy });
}

// ------------------------------------------------------------------ the lease (one server at a time per job + school)

const FREE = "~free";
/** Takes the job's row for this server (compare-and-set on updatedBy). Returns the row's state, or null when another
 *  live server holds it. */
async function takeLease<C>(repo: Repo, def: JobDef<C>, schoolId: string, now: Date): Promise<{ id: string; state: JobState<C> | null } | null> {
  const key = jobKey(def);
  let row: Row | null = await repo.findUnique("SchoolSetting", { schoolId, key });
  if (!row) {
    await claimSetting(repo, schoolId, key, { lease: true }, FREE);
    row = await repo.findUnique("SchoolSetting", { schoolId, key });
    if (!row) return null;
  }
  const v = parse(row.value);
  const holder = s(row.updatedBy) || FREE;
  const until = Number(v.until ?? 0);
  if (holder !== FREE && holder !== BOOT_ID && until > now.getTime()) return null; // a live server runs it
  const n = await repo.updateMany("SchoolSetting", { id: row.id, updatedBy: row.updatedBy ?? null }, { updatedBy: BOOT_ID, value: { ...v, until: now.getTime() + R().cfg.leaseMs } as object });
  if (n !== 1) return null;
  return { id: s(row.id), state: v.version !== undefined ? (v as unknown as JobState<C>) : null };
}
async function saveState<C>(repo: Repo, id: string, state: JobState<C>, release = false): Promise<void> {
  const value = { ...state, until: release ? 0 : Date.now() + R().cfg.leaseMs };
  await repo.updateMany("SchoolSetting", { id, updatedBy: BOOT_ID }, { value: value as unknown as object, updatedBy: release ? FREE : BOOT_ID });
}

// ------------------------------------------------------------------ memory gate

const sleep = (ms: number) => new Promise<void>((r) => (ms > 0 ? setTimeout(r, ms) : setImmediate(r)));

export class JobPaused extends Error { constructor() { super("waiting for memory"); } }

/** Waits while the server is above the memory thresholds (logged once per wait). Throws JobPaused after maxWaitMs. */
export async function memoryGate(label: string): Promise<number> {
  const r = R();
  if (!r.cfg.enforce) return 0;
  const t0 = Date.now();
  let waits = 0;
  for (;;) {
    const m = r.cfg.memory();
    if (m.rssMb <= r.cfg.rssMb && m.heapMb <= r.cfg.heapMb) { if (waits) r.waitLogged = false; return waits; }
    if (!r.waitLogged) { r.waitLogged = true; log("warn", "jobs.memory_wait", { job: label, rssMB: Math.round(m.rssMb), heapMB: Math.round(m.heapMb), limitRssMB: r.cfg.rssMb, limitHeapMB: r.cfg.heapMb }); }
    if (Date.now() - t0 >= r.cfg.maxWaitMs) throw new JobPaused();
    waits++;
    await sleep(r.cfg.waitMs);
  }
}

// ------------------------------------------------------------------ running

export interface RunOutcome<C = unknown> { schoolId: string; ran: boolean; state: JobState<C> | null; reason?: "done" | "skipped" | "busy" | "paused" | "failed" | "stopped" }

/** Runs (or resumes) one job for one school, batch by batch, in THIS call (inside the process-wide slot). */
export function runJob<C>(repo: Repo, def: JobDef<C>, schoolId: string, opts: { now?: Date; force?: boolean } = {}): Promise<RunOutcome<C>> {
  return inSlot(`${def.name}|${schoolId}`, () => runJobUnlocked(repo, def, schoolId, opts));
}

async function runJobUnlocked<C>(repo: Repo, def: JobDef<C>, schoolId: string, opts: { now?: Date; force?: boolean }): Promise<RunOutcome<C>> {
  const now = opts.now ?? new Date();
  const lease = await takeLease(repo, def, schoolId, now);
  if (!lease) return { schoolId, ran: false, state: null, reason: "busy" };
  let state = lease.state;
  if (state && state.version === def.version && state.done && !opts.force) { await saveState(repo, lease.id, state, true); return { schoolId, ran: false, state, reason: "done" }; }
  // a run that failed on a batch resumes from its checkpoint (the error is kept on the row until then)
  if (state && state.version === def.version && !state.done && state.error && !opts.force) state = { ...state, error: null };
  if (!state || state.version !== def.version || opts.force || (state.done && state.error)) {
    state = { version: def.version, cursor: null, done: false, startedAt: now.toISOString(), finishedAt: null, progress: {}, batches: 0, error: null, crashes: state?.version === def.version ? state?.crashes ?? 0 : 0, inFlight: state?.version === def.version ? state?.inFlight ?? null : null };
    if (!opts.force && def.skip && (await def.skip(repo, schoolId, state))) {
      state = { ...state, done: true, finishedAt: now.toISOString(), result: "skipped" };
      await saveState(repo, lease.id, state, true);
      return { schoolId, ran: false, state, reason: "skipped" };
    }
  }
  // 🛟 a batch that was running when the server stopped (another boot): counted; twice in a row stops the job
  if (state.inFlight && state.inFlight.boot !== BOOT_ID) state.crashes = Number(state.crashes ?? 0) + 1;
  if (Number(state.crashes ?? 0) >= 2) {
    state = { ...state, done: true, inFlight: null, finishedAt: new Date().toISOString(), error: "The server stopped twice while this job ran: it was stopped to keep the platform running." };
    await saveState(repo, lease.id, state, true);
    log("error", "jobs.stopped_crash_loop", { job: def.name, schoolId });
    return { schoolId, ran: false, state, reason: "stopped" };
  }
  try {
    for (let guard = 0; guard < 100_000 && !state.done; guard++) {
      state.waits = Number(state.waits ?? 0) + (await memoryGate(def.name));
      state.inFlight = { boot: BOOT_ID, at: new Date().toISOString() };
      await saveState(repo, lease.id, state);
      const r = await def.step(repo, schoolId, state.cursor, state, now);
      state.batches++;
      for (const [k, n] of Object.entries(r.progress ?? {})) state.progress[k] = Number(state.progress[k] ?? 0) + n;
      state.cursor = r.cursor;
      state.inFlight = null;
      state.crashes = 0;
      if (r.done) {
        state.result = def.finish ? await def.finish(repo, schoolId, state, now) : null;
        state.done = true;
        state.finishedAt = new Date().toISOString();
      }
      await saveState(repo, lease.id, state, state.done);
      if (!state.done) await sleep(R().cfg.yieldMs);
    }
    return { schoolId, ran: true, state };
  } catch (e) {
    if (e instanceof JobPaused) {
      state.inFlight = null;
      await saveState(repo, lease.id, state, true).catch(() => undefined);
      log("warn", "jobs.paused_memory", { job: def.name, schoolId, batches: state.batches });
      return { schoolId, ran: false, state, reason: "paused" };
    }
    state.inFlight = null;
    state.error = String((e as Error)?.message ?? e).slice(0, 300);
    await saveState(repo, lease.id, state, true).catch(() => undefined);
    log("error", "jobs.failed", { job: def.name, schoolId, error: e });
    return { schoolId, ran: false, state, reason: "failed" };
  }
}

/** Every school of the job (or its own list), one after another. */
export async function runJobEverywhere<C>(repo: Repo, def: JobDef<C>, opts: { now?: Date; force?: boolean } = {}): Promise<RunOutcome<C>[]> {
  const schools = def.schools ? await def.schools(repo) : (await repo.findMany("School", {}, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }] })).map((x) => s(x.id));
  const out: RunOutcome<C>[] = [];
  for (const id of schools) out.push(await runJob(repo, def, id, opts));
  return out;
}

/** The process-wide slot: ONE job at a time (and never beside other heavy work: runHeavy). Also for jobs that are not
 *  JobDefs (the daily job), so they never run beside a startup job. */
export function inJobSlot<T>(label: string, fn: () => Promise<T>): Promise<T> { return inSlot(label, fn); }
function inSlot<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const r = R();
  const run = r.tail.then(() => runHeavy(async () => {
    r.active++; r.maxActive = Math.max(r.maxActive, r.active); r.running = label;
    try { return await fn(); } finally { r.active--; r.running = null; }
  }));
  r.tail = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Adds a job to the background queue and returns at once (an admin button, the start of the server). The same job for
 * the same school waiting already is not added twice. `schoolId` null = every school of the job.
 */
export function enqueueJob<C>(repo: Repo, def: JobDef<C>, schoolId: string | null = null, opts: { force?: boolean } = {}): void {
  const r = R();
  const key = `${def.name}|${schoolId ?? "*"}`;
  if (r.queue.has(key)) return;
  r.queue.set(key, async () => {
    if (schoolId) await runJob(repo, def, schoolId, opts);
    else await runJobEverywhere(repo, def, opts);
  });
  void drain();
}

let draining: Promise<void> | null = null;
function drain(): Promise<void> {
  draining ??= (async () => {
    const r = R();
    while (r.queue.size) {
      const [key, run] = r.queue.entries().next().value as [string, () => Promise<void>];
      r.queue.delete(key);
      try { await run(); } catch (e) { log("error", "jobs.failed", { job: key, error: e }); }
    }
  })().finally(() => { draining = null; });
  return draining;
}

/** Waits until the background queue is empty (tests). */
export async function jobsSettled(): Promise<void> {
  while (draining) await draining;
}

/** The job that is running now and how many wait (System check, tests). */
export function runnerStatus(): { running: string | null; queued: number } {
  return { running: R().running, queued: R().queue.size };
}
