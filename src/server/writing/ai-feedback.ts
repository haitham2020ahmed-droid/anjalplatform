/**
 * 🤖 AI trait feedback for writing (only when the task turns it on). After a student submits, the school's AI
 * provider drafts a score, one strength and one next step per rubric trait, and tags convention errors with the
 * platform's error codes. The draft is saved PENDING: the teacher edits and approves it (→ scores + comment) or
 * dismisses it; the student never sees a draft that was not approved.
 *
 * Privacy: only the student's text, the genre and the rubric are sent (no name, id, class or score history).
 * Limits: the school's AI settings (per minute / per day) and at most WRITING_AI_PER_DAY drafts per school day.
 */
import type { Repo } from "../seeding/repo";
import { consumeRateLimit } from "../auth/rate-limit";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike, type Validator } from "../ai/engine";
import type { anthropicProvider, geminiProvider } from "../ai/question-generator";
import { MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";
import { GENRE_LABEL, type Genre, type Rubric } from "./genres";
import { WRITING_ERROR_CODES } from "./reteach";

export const WRITING_AI_PER_DAY = 40;
const TOOL = "writing-feedback";

export interface AiTrait { score: number; strength: string; nextStep: string }
export interface AiDraft { traits: Record<string, AiTrait>; conventions: { code: string; example: string }[]; summary: string; at?: string; by?: "AI" | "TEACHER" }
export type AiOutcome = "PENDING" | "OFF" | "LIMIT" | "FAILED";

/** The Saudi school day (UTC+3) of a moment, e.g. "2026-10-10". */
export const schoolDay = (now: Date) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const short = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The request body: the genre, the rubric and the writing only. */
export function aiPayload(genre: Genre, rubric: Rubric, text: string): Record<string, unknown> {
  return {
    genre: GENRE_LABEL[genre],
    scale: { lowest: rubric.min, highest: rubric.max },
    rubric: rubric.traits.map((t) => ({ key: t.key, trait: t.name, checks: t.what, levels: t.levels })),
    writing: text.slice(0, 6000),
  };
}

export function aiSystem(rubric: Rubric): string {
  const codes = WRITING_ERROR_CODES.map((c) => `${c} (${MISCONCEPTION_BY_CODE.get(c)!.label})`).join("; ");
  return `You help a teacher give feedback on writing by a Grade 4–6 student learning English (their first language is Arabic). Score each rubric trait from ${rubric.min} to ${rubric.max} using the level descriptors. For each trait write one strength and one next step: short, kind, simple English a child understands, addressed to the student as "you", pointing to their own words. Never mention a name, a grade level or other students. Then list up to 6 grammar or mechanics errors you see, each with one code from this list and a short example quoted from the writing: ${codes}. Reply with JSON only: {"traits": {"<key>": {"score": number, "strength": string, "nextStep": string}}, "conventions": [{"code": string, "example": string}], "summary": string}. The summary is two sentences for the student.`;
}

/**
 * Validates (and tidies) the AI reply against the task's rubric and the allowed error codes: scores are rounded and
 * clamped to the rubric's scale, unknown trait keys and unknown error codes are dropped, texts are shortened. A
 * missing trait, a non-number score or an empty strength / next step is refused (the engine asks again).
 */
export function aiDraftValidator(rubric: Rubric): Validator<AiDraft> {
  const allowed = new Set(WRITING_ERROR_CODES);
  return (data) => {
    const d = data as { traits?: Record<string, Partial<AiTrait>>; conventions?: unknown; summary?: unknown };
    if (!d || typeof d !== "object" || !d.traits || typeof d.traits !== "object") return { ok: false, error: "traits must be an object keyed by the rubric keys" };
    const traits: Record<string, AiTrait> = {};
    for (const t of rubric.traits) {
      const x = d.traits[t.key];
      if (!x || typeof x !== "object") return { ok: false, error: `trait “${t.key}” is missing` };
      const raw = typeof x.score === "string" ? Number.parseFloat(x.score) : Number(x.score);
      if (x.score === null || x.score === undefined || !Number.isFinite(raw)) return { ok: false, error: `${t.key}.score must be a number from ${rubric.min} to ${rubric.max}` };
      const score = Math.max(rubric.min, Math.min(rubric.max, Math.round(raw)));
      const strength = short(x.strength, 300), nextStep = short(x.nextStep, 300);
      if (strength.length < 5 || nextStep.length < 5) return { ok: false, error: `${t.key} needs a strength and a next step (a short sentence each)` };
      traits[t.key] = { score, strength, nextStep };
    }
    const conventions: AiDraft["conventions"] = [];
    for (const c of Array.isArray(d.conventions) ? (d.conventions as { code?: unknown; example?: unknown }[]) : []) {
      const code = String(c?.code ?? "").trim().toUpperCase();
      if (allowed.has(code) && conventions.length < 6) conventions.push({ code, example: short(c?.example, 160) });
    }
    const summary = short(d.summary, 400);
    if (summary.length < 5) return { ok: false, error: "summary must be a sentence or two" };
    return { ok: true, value: { traits, conventions, summary } };
  };
}

/**
 * Drafts AI feedback for one submitted piece of writing and saves it (aiStatus PENDING). Never throws for AI
 * problems: without a provider, over a limit or after a failed call the teacher simply scores by hand.
 */
export async function draftAiFeedback(
  repo: Repo, input: { schoolId: string; taskId: string; studentId: string; genre: Genre; rubric: Rubric; text: string },
  env: EnvLike, now = new Date(), make: { gemini?: typeof geminiProvider; anthropic?: typeof anthropicProvider } = {},
): Promise<{ outcome: AiOutcome; reason: string | null }> {
  if (words(input.text) < 3) return { outcome: "FAILED", reason: "There is no writing to read yet." };
  const settings = await aiSettings(repo, input.schoolId);
  const picked = pickProvider(env, settings, make);
  if (!picked.ok) return { outcome: "OFF", reason: picked.reason };
  const rs = await rateState(repo, input.schoolId, settings, now);
  if (rs.reason && rs.waitMs > 0) return { outcome: "LIMIT", reason: rs.reason };
  const day = await consumeRateLimit(repo, `writing-ai:${input.schoolId}:${schoolDay(now)}`, WRITING_AI_PER_DAY, 86_400_000, now);
  if (!day.allowed) return { outcome: "LIMIT", reason: `Today's ${WRITING_AI_PER_DAY} AI writing drafts are used. Score by hand, or ask again tomorrow.` };
  const r = await callJson(repo, { schoolId: input.schoolId, tool: TOOL, picked, items: 1 }, aiSystem(input.rubric), aiPayload(input.genre, input.rubric, input.text), aiDraftValidator(input.rubric), 1)
    .catch((e: Error) => ({ ok: false as const, error: e.message, stop: true }));
  if (!r.ok) return { outcome: "FAILED", reason: r.error || "The AI did not give a usable draft." };
  const draft: AiDraft = { ...r.value, at: now.toISOString(), by: "AI" };
  await repo.updateMany("WritingSubmission", { taskId: input.taskId, studentId: input.studentId }, { aiDraft: draft, aiStatus: "PENDING" });
  return { outcome: "PENDING", reason: null };
}

/** Reads a stored draft (JSON or string). */
export function readDraft(v: unknown): AiDraft | null {
  if (!v) return null;
  const d = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  return d && typeof d === "object" && (d as AiDraft).traits ? (d as AiDraft) : null;
}
