/**
 * 🛟 Crash-loop guard (Update 42A). A heavy step (an import chunk, an AI batch) that kills the server — e.g. it runs out of
 * memory — must not be started again and again by the page that resumes it after every restart. Before the step the job
 * records “in flight on THIS server process”; after it, the mark is cleared. A mark left by ANOTHER process means that
 * attempt died with the server: after MAX_CRASHES such attempts in a row the job is stopped (FAILED, with a clear message).
 * Pure functions; the callers keep the mark in the job's own JSON column (no schema change).
 */
import { randomBytes } from "node:crypto";

/** This server process: a new value after every restart. */
export const BOOT_ID = `${process.pid}.${Date.now().toString(36)}.${randomBytes(3).toString("hex")}`;
/** Attempts of the same step that may end with the server stopping before the job is stopped. */
export const MAX_CRASHES = 2;

export interface InFlight { boot: string; at: string }
export interface GuardState { inFlight?: InFlight | null; crashes?: number }

/** Before the step: the crashes so far (a mark left by another process counts one more) and whether to stop. */
export function beginStep(state: GuardState | null | undefined, now: Date, boot = BOOT_ID): { crashes: number; stop: boolean; next: GuardState } {
  const prev = state?.inFlight ?? null;
  const crashes = Number(state?.crashes ?? 0) + (prev && prev.boot !== boot ? 1 : 0);
  return { crashes, stop: crashes >= MAX_CRASHES, next: { inFlight: { boot, at: now.toISOString() }, crashes } };
}

/** After the step finished (with or without errors it reported itself): no mark, the crash count starts again. */
export const endStep = (): GuardState => ({ inFlight: null, crashes: 0 });

/** True when the mark was left by a process that no longer runs (the step can never finish). */
export const leftByDeadProcess = (state: GuardState | null | undefined, boot = BOOT_ID): boolean => Boolean(state?.inFlight && state.inFlight.boot !== boot);

export const CRASH_MESSAGE = "The server stopped twice while working on this (it ran out of memory), so it was stopped to keep the platform running.";
