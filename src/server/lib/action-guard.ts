/**
 * 🧯 r79 (the r78 NAFS rule, shared by the MAP actions): a Server Action that throws shows Next.js's error page — a
 * white page for the teacher. Every MAP action ends on the teacher's page with a message, whatever fails:
 *   - Next.js's own signals (redirect, not found) pass through — they ARE the answer;
 *   - a known refusal (ValidationError / ForbiddenError) → its own text (translated);
 *   - anything else (the database, a timeout, a bug) → logged (server log + the school's error log) and a friendly
 *     "Something went wrong — try again" (never the technical text).
 */
import { getT } from "@/i18n/server";
import { repo } from "../auth/next";
import { ForbiddenError } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { log } from "../monitoring/log";
import { logError } from "../teacher/extras";

export const FAILED = "Something went wrong — try again";
export const isKnown = (e: unknown): e is Error => e instanceof ValidationError || e instanceof ForbiddenError;

/** A Next.js redirect / not-found signal (must be rethrown, never turned into a message). */
export function isNextControl(e: unknown): boolean {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND");
}

/** The message for the teacher: a known refusal's own text, else the friendly line (the failure is logged). */
export async function failureMessage(e: unknown, area: string, action: string, path: string): Promise<string> {
  const { t } = await getT().catch(() => ({ t: (x: string) => x }));
  if (isKnown(e)) return t(e.message);
  log("error", `${area}.action.failed`, { action, error: e instanceof Error ? e : String(e) });
  void logError(repo, { source: "SERVER", message: `${area} ${action}: ${e instanceof Error ? e.message : String(e)}`, path });
  return t(FAILED);
}

/**
 * A form action: `fn` ends with its own redirect (or returns the message to show); any error comes back to `back(msg)`
 * as a message. `back` must redirect.
 */
export async function guardAction(area: string, action: string, path: string, back: (msg: string) => never, fn: () => Promise<string | void>): Promise<void> {
  let msg: string;
  try {
    const r = await fn();
    if (typeof r !== "string") return;
    msg = r;
  } catch (e) {
    if (isNextControl(e)) throw e;
    msg = await failureMessage(e, area, action, path);
  }
  back(msg);
}

/** A client-called action: `{ ok: false, message }` on any failure — never a thrown error (Next.js signals pass). */
export async function guardCall<T extends { ok: true }>(area: string, action: string, path: string, fn: () => Promise<T>): Promise<T | { ok: false; message: string }> {
  try { return await fn(); } catch (e) { if (isNextControl(e)) throw e; return { ok: false, message: await failureMessage(e, area, action, path) }; }
}
