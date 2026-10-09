/**
 * 🤖 The AI layer used by the admin AI tools (provider-neutral, server-only use):
 *   - aiSettings / setAiSettings: provider (auto · gemini · claude · off), requests per minute / per day, batch size
 *   - pickProvider: Gemini or Claude from the SERVER environment (keys never reach the browser); a missing key
 *     or "off" only disables the AI tools — the rest of the platform keeps working
 *   - rateState: the school's own counters (from the request log) so we stay under the free-tier limits
 *   - callJson: one request → JSON → validated; retried with the validator's message when invalid; every
 *     attempt is logged (ok / error, time); 429 / 5xx stop the batch with a clear “wait” message
 *   - assertNoStudentData: a last guard — payloads may hold question & passage content only
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { anthropicProvider, chooseAiProvider, geminiProvider, type AiProvider } from "./question-generator";

const s = (v: unknown) => String(v ?? "");
export type ProviderName = "auto" | "gemini" | "anthropic" | "off";
export interface AiSettings { provider: ProviderName; perMinute: number; perDay: number; batch: number }
/** Gemini's free tier is small (a few requests a minute, a limited number a day; AI Studio shows the project's exact limits). */
export const DEFAULT_AI: AiSettings = { provider: "auto", perMinute: 4, perDay: 200, batch: 5 };
const KEY = "ai.settings";

export async function aiSettings(repo: Repo, schoolId: string | null): Promise<AiSettings> {
  if (!schoolId) return DEFAULT_AI;
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: KEY }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (k: string, lo: number, hi: number, d: number) => { const x = Number(o[k]); return Number.isInteger(x) && x >= lo && x <= hi ? x : d; };
  const p = s(o.provider) as ProviderName;
  return { provider: ["auto", "gemini", "anthropic", "off"].includes(p) ? p : DEFAULT_AI.provider, perMinute: n("perMinute", 1, 60, DEFAULT_AI.perMinute), perDay: n("perDay", 1, 10000, DEFAULT_AI.perDay), batch: n("batch", 1, 10, DEFAULT_AI.batch) };
}

export async function setAiSettings(repo: Repo, actor: Actor, input: Partial<AiSettings>, now = new Date()): Promise<AiSettings> {
  assertCan(actor, "settings:engine");
  const v = { ...(await aiSettings(repo, actor.schoolId)) };
  if (input.provider !== undefined) { if (!["auto", "gemini", "anthropic", "off"].includes(input.provider)) throw new ValidationError("Choose a provider."); v.provider = input.provider; }
  const set = (k: "perMinute" | "perDay" | "batch", lo: number, hi: number, name: string) => {
    if (input[k] === undefined) return;
    const x = Number(input[k]);
    if (!(Number.isInteger(x) && x >= lo && x <= hi)) throw new ValidationError(`${name}: a whole number from ${lo} to ${hi}.`);
    v[k] = x;
  };
  set("perMinute", 1, 60, "Requests per minute"); set("perDay", 1, 10000, "Requests per day"); set("batch", 1, 10, "Questions per request");
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: KEY }, { value: v, updatedById: actor.userId, updatedAt: now }, { value: v, updatedById: actor.userId, updatedAt: now });
  return v;
}

export interface EnvLike { AI_PROVIDER?: string; GEMINI_API_KEY?: string; GEMINI_MODEL?: string; ANTHROPIC_API_KEY?: string; AI_MODEL?: string }
export type Picked = { ok: true; provider: AiProvider; name: "gemini" | "anthropic"; model: string } | { ok: false; reason: string };

/** The provider from the server environment + the admin's choice. Never throws. */
export function pickProvider(env: EnvLike, settings: AiSettings, make: { gemini?: typeof geminiProvider; anthropic?: typeof anthropicProvider } = {}): Picked {
  if (settings.provider === "off") return { ok: false, reason: "The AI tools are switched off in AI settings. The rest of the platform works normally." };
  const c = chooseAiProvider({ ...env, AI_PROVIDER: settings.provider === "auto" ? env.AI_PROVIDER : settings.provider });
  if ("error" in c) return { ok: false, reason: `${c.error} Until then the AI tools are paused; the rest of the platform works normally.` };
  const provider = c.provider === "gemini" ? (make.gemini ?? geminiProvider)({ apiKey: c.apiKey, model: c.model, timeoutMs: 60_000 }) : (make.anthropic ?? anthropicProvider)({ apiKey: c.apiKey, model: c.model, timeoutMs: 60_000 });
  return { ok: true, provider, name: c.provider, model: c.model };
}

export interface RateState { usedMinute: number; usedToday: number; waitMs: number; reason: string | null }

/** How many requests this school made in the last minute / today, and how long to wait before the next one. */
export async function rateState(repo: Repo, schoolId: string, settings: AiSettings, now = new Date()): Promise<RateState> {
  const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const logs = (await repo.findMany("AiRequestLog", { schoolId }, { select: ["createdAt", "error"] })).map((l) => ({ at: t(l.createdAt), error: s(l.error) })).filter((l) => l.at >= Math.min(dayStart.getTime(), now.getTime() - 60_000));
  const minute = logs.filter((l) => l.at > now.getTime() - 60_000);
  const today = logs.filter((l) => l.at >= dayStart.getTime());
  // the provider said “too many requests” in the last minute: wait a full minute
  const lastRate = minute.filter((l) => /RATE_LIMIT/.test(l.error)).sort((a, b) => b.at - a.at)[0];
  if (today.length >= settings.perDay) return { usedMinute: minute.length, usedToday: today.length, waitMs: dayStart.getTime() + 86_400_000 - now.getTime(), reason: `Today's limit of ${settings.perDay} AI requests is reached. The work continues tomorrow from where it stopped.` };
  if (lastRate) return { usedMinute: minute.length, usedToday: today.length, waitMs: Math.max(5_000, lastRate.at + 60_000 - now.getTime()), reason: "The AI provider asked us to slow down. Waiting a minute, then continuing." };
  if (minute.length >= settings.perMinute) { const oldest = Math.min(...minute.map((l) => l.at)); return { usedMinute: minute.length, usedToday: today.length, waitMs: Math.max(1_000, oldest + 60_000 - now.getTime()), reason: null }; }
  return { usedMinute: minute.length, usedToday: today.length, waitMs: 0, reason: null };
}

// ------------------------------------------------------------------ privacy

const STUDENT_KEYS = /^(student|studentId|studentNumber|username|displayName|name|email|score|rit|percentile|mapScore|answer|response|attempts?|class|classId|parent)$/i;
/** Throws when a payload looks like it carries student data (only question / passage content may be sent). */
export function assertNoStudentData(payload: unknown, path = "payload"): void {
  if (Array.isArray(payload)) { payload.forEach((x, i) => assertNoStudentData(x, `${path}[${i}]`)); return; }
  if (payload && typeof payload === "object") for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (STUDENT_KEYS.test(k)) throw new Error(`Privacy guard: “${path}.${k}” may not be sent to the AI provider.`);
    assertNoStudentData(v, `${path}.${k}`);
  }
}

// ------------------------------------------------------------------ one validated JSON call

export type Validator<T> = (data: unknown) => { ok: true; value: T } | { ok: false; error: string };
export type CallResult<T> = { ok: true; value: T } | { ok: false; error: string; stop: boolean };

/** Extracts the first JSON value from a reply (tolerates ```json fences and text around it). */
export function extractJson(text: string): unknown {
  const clean = text.replace(/```(?:json)?/gi, "").trim();
  const start = clean.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in the reply");
  const open = clean[start], close = open === "{" ? "}" : "]";
  const end = clean.lastIndexOf(close);
  if (end < start) throw new Error("the JSON in the reply is cut off");
  return JSON.parse(clean.slice(start, end + 1));
}

const isRate = (m: string) => /usage limit|429|too many|rate/i.test(m);
const isDown = (m: string) => /temporarily unavailable|error 5\d\d|timeout|aborted|fetch failed|ECONN|network/i.test(m);
const isConfig = (m: string) => /not valid|did not accept|not found|not set up|not set in/i.test(m);

/**
 * Sends one request and validates the JSON reply; when invalid, asks again (with what was wrong) up to `retries`
 * times. Rate limits, outages and configuration problems stop the batch (stop: true) with a clear message.
 */
export async function callJson<T>(repo: Repo, ctx: { schoolId: string; tool: string; picked: Extract<Picked, { ok: true }>; items: number }, system: string, user: unknown, validate: Validator<T>, retries = 2): Promise<CallResult<T>> {
  assertNoStudentData(user);
  let body = JSON.stringify(user, null, 1), lastError = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      const text = await ctx.picked.provider.complete(system, body);
      let data: unknown;
      try { data = extractJson(text); } catch (e) { throw new SyntaxError(`The reply was not valid JSON (${(e as Error).message}).`); }
      const v = validate(data);
      if (v.ok) { await log(repo, ctx, true, Date.now() - started, null); return v; }
      lastError = `The reply did not follow the rules: ${v.error}`;
      await log(repo, ctx, false, Date.now() - started, `INVALID: ${v.error}`);
    } catch (e) {
      const m = (e as Error).message ?? String(e);
      if (e instanceof SyntaxError) { lastError = m; await log(repo, ctx, false, Date.now() - started, `INVALID: ${m}`); }
      else {
        const code = isRate(m) ? "RATE_LIMIT" : isDown(m) ? "DOWN" : isConfig(m) ? "CONFIG" : "ERROR";
        await log(repo, ctx, false, Date.now() - started, `${code}: ${m}`);
        if (code !== "ERROR") return { ok: false, error: code === "RATE_LIMIT" ? "The AI provider's limit was reached. The tool waits and continues by itself." : m, stop: true };
        lastError = m;
      }
    }
    // ask again, saying exactly what was wrong
    body = JSON.stringify({ ...(user as Record<string, unknown>), yourPreviousReplyWasRejectedBecause: lastError, reminder: "Return ONLY the JSON object in the required shape, using only the allowed values." }, null, 1);
  }
  return { ok: false, error: lastError || "No valid answer after retries.", stop: false };
}

async function log(repo: Repo, ctx: { schoolId: string; tool: string; picked: Extract<Picked, { ok: true }>; items: number }, ok: boolean, ms: number, error: string | null): Promise<void> {
  await repo.create("AiRequestLog", { schoolId: ctx.schoolId, tool: ctx.tool, provider: ctx.picked.name, model: ctx.picked.model.slice(0, 80), ok, items: ctx.items, ms, error: error ? error.slice(0, 500) : null, createdAt: new Date() });
}
