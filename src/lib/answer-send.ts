/**
 * 📮 Sending an answer so the player is NEVER stuck (r68, the 150-student morning).
 *
 * The cause of the stuck "Next question" / "Checking…": the players sent answers with Next.js Server Actions, which a
 * page runs ONE AFTER ANOTHER. When the server was busy (or restarting after running out of memory) one answer's
 * request hung without an end, and every later click waited behind it; when it failed, the quiz player never reset its
 * "pending" state, so its buttons stayed faded until the student left and pressed Continue again.
 *
 * Now an answer goes with a plain fetch (POST /api/practice/answer) that:
 *   - ends after `timeoutMs` (default 15 s) — a hung request is aborted, never waited for forever;
 *   - is sent again automatically on a network error, a timeout or a busy server (5xx/429), up to `tries` times with a
 *     growing pause (0.8 s, 2 s, 4 s) — safe, because the server applies each answer once (a repeat gets that answer's
 *     saved result: same session + question = the idempotency key, checked by the database);
 *   - falls back to the Server Action when the route itself is missing or refused (an old server during a deploy);
 *   - NEVER throws: the caller gets { ok: false } and shows a small "Try again" inside the player (the answer stays
 *     selected, the student keeps their place).
 * Pure apart from fetch/timers: unit-tested with a fake fetch (tests/player-robust.test.ts).
 */
export type Sent<T> = { ok: true; data: T } | { ok: false; reason: "offline" | "busy" | "signedOut"; message: string };

export interface SendOpts {
  tries?: number;
  timeoutMs?: number;
  backoffMs?: readonly number[];
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** called before each automatic retry (1, 2 …): the player shows "Trying again…" */
  onRetry?: (attempt: number) => void;
}

export const ANSWER_URL = "/api/practice/answer";
export const SEND_TRIES = 3;
export const SEND_TIMEOUT_MS = 15_000;
export const SEND_BACKOFF_MS = [800, 2000, 4000] as const;

export const OFFLINE_MESSAGE = "No connection. Your answer is still here: press Try again.";
export const BUSY_MESSAGE = "The server is busy. Your answer is still here: press Try again.";
export const SIGNED_OUT_MESSAGE = "You were signed out. Sign in again to continue — your work is saved.";

class Retryable extends Error {}
class Fallback extends Error {}

/** One POST with a time limit. Throws Retryable (try again), Fallback (use the Server Action) or returns the JSON. */
async function postOnce<T>(url: string, body: unknown, timeoutMs: number, f: typeof fetch): Promise<T | { __signedOut: true }> {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await f(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin", cache: "no-store", signal: ctl?.signal });
    } catch { throw new Retryable("network"); }
    if (res.status === 401) return { __signedOut: true };
    if (res.status === 404 || res.status === 405 || res.status === 403) throw new Fallback(String(res.status));
    if (res.status >= 500 || res.status === 429 || res.status === 408) throw new Retryable(String(res.status));
    try { return (await res.json()) as T; } catch { throw new Retryable("bad json"); }
  } finally { clearTimeout(timer); }
}

/** Sends with time limit + automatic retries; `fallback` (the Server Action) when the route is not there. Never throws. */
export async function sendAnswer<T extends { error?: string }>(body: Record<string, unknown>, fallback: (() => Promise<T>) | null, opts: SendOpts = {}): Promise<Sent<T>> {
  const tries = opts.tries ?? SEND_TRIES;
  const timeoutMs = opts.timeoutMs ?? SEND_TIMEOUT_MS;
  const backoff = opts.backoffMs ?? SEND_BACKOFF_MS;
  const f = opts.fetchImpl ?? (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let reason: "offline" | "busy" = "offline";
  for (let i = 0; i < tries; i++) {
    if (i > 0) { opts.onRetry?.(i); await sleep(backoff[Math.min(i - 1, backoff.length - 1)]); }
    try {
      if (!f) throw new Fallback("no fetch");
      const r = await postOnce<T & { retry?: boolean }>(ANSWER_URL, body, timeoutMs, f);
      if ((r as { __signedOut?: boolean }).__signedOut) return { ok: false, reason: "signedOut", message: SIGNED_OUT_MESSAGE };
      return { ok: true, data: r as T };
    } catch (e) {
      if (e instanceof Fallback && fallback) {
        try { return { ok: true, data: await withTimeout(fallback(), timeoutMs) }; }
        catch { reason = "offline"; continue; }
      }
      reason = e instanceof Retryable && /^\d/.test(e.message) ? "busy" : "offline";
    }
  }
  return { ok: false, reason, message: reason === "busy" ? BUSY_MESSAGE : OFFLINE_MESSAGE };
}

/**
 * A Server Action call that never throws and never hangs the player: a time limit, then retried (up to `tries`) when
 * it threw (network, a 5xx, the server restarting) — for answers the server applies once (a repeat gets its saved
 * result). { ok: false } → the player shows its small "Try again".
 */
export async function callAction<T>(fn: () => Promise<T>, opts: Omit<SendOpts, "fetchImpl"> = {}): Promise<Sent<T>> {
  const tries = opts.tries ?? SEND_TRIES;
  const backoff = opts.backoffMs ?? SEND_BACKOFF_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < tries; i++) {
    if (i > 0) { opts.onRetry?.(i); await sleep(backoff[Math.min(i - 1, backoff.length - 1)]); }
    try { return { ok: true, data: await withTimeout(fn(), opts.timeoutMs ?? SEND_TIMEOUT_MS) }; }
    catch { /* next try */ }
  }
  return { ok: false, reason: "offline", message: OFFLINE_MESSAGE };
}

/**
 * The next screen after "Next question" when the page is drawn again by the server (router.refresh): if the new screen
 * has not come after `ms` (a busy server), the page is loaded again in full — the student never waits on a faded button
 * (the server keeps their place). Returns a cancel function for the component's cleanup.
 */
export function refreshOrReload(refresh: () => void, ms = 8_000, reload: () => void = () => window.location.reload()): () => void {
  const t = setTimeout(reload, ms);
  try { refresh(); } catch { clearTimeout(t); reload(); }
  return () => clearTimeout(t);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
