/**
 * 🤖 owner r##: AI-drafted score for a ReadRise "thought question" (the written answer). Mirrors the pattern in
 * src/server/writing/ai-feedback.ts (the separate Writing module), simplified to ReadRise's single 0–4 score:
 *
 *   After the student submits their writing, the school's AI provider drafts a score (0–4, using the band's
 *   checklist as the rubric) and a short comment. The draft is saved to RRRun.writingAiScore / writingAiComment —
 *   NEVER shown to the student, and never written again once a teacher has actually scored the run (writingScore
 *   set). The teacher's "✍️ Scoring" screen pre-fills the score and comment from this draft so grading is faster,
 *   but the teacher can change either field before saving; whatever they save becomes the official writingScore.
 *
 * Privacy: only the prompt, the checklist and the student's written text are sent — no name, id, class or score
 * history (assertNoStudentData in ai/engine.ts also guards this).
 *
 * Never throws for an AI problem: without a provider, over a limit, or after a failed call, the run is simply left
 * without an AI draft and the teacher scores it from scratch, exactly as before this feature existed.
 */
import type { Repo } from "../seeding/repo";
import { consumeRateLimit } from "../auth/rate-limit";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike, type Validator } from "../ai/engine";
import type { anthropicProvider, geminiProvider } from "../ai/question-generator";
import { schoolDay } from "../writing/ai-feedback";

export const READRISE_WRITING_AI_PER_DAY = 40;
const TOOL = "readrise-writing-score";

export interface AiScoreDraft { score: number; comment: string }
export type AiOutcome = "SAVED" | "OFF" | "LIMIT" | "FAILED" | "TOO_SHORT";

const short = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

function system(checklistLen: number): string {
  return `You help a teacher score a short written answer by a Grade 4–6 student learning English (their first language is Arabic). You are given the question (prompt), a checklist of ${checklistLen} points a strong answer includes, and the student's own writing. First decide, point by point, whether the writing actually addresses each checklist item (do not guess generously — only count a point as met if the writing really shows it, with support from the text where relevant). Then score from that tally: 4 = meets every checklist point clearly; 3 = meets most points; 2 = meets about half, or a vague/partial attempt; 1 = barely attempts the question or meets only one point; 0 = blank, copied from the question, or completely off-topic. Then write ONE short comment (a sentence or two) addressed to the student as "you": name one specific checklist point they did meet (or attempt) and one specific thing to improve. Keep it kind, simple English a child understands. Never mention a name, grade level or other students. Reply with JSON only: {"checklistMet": boolean[] (one per checklist point, in order), "score": number, "comment": string}.`;
}

function payload(prompt: string, checklist: string[], writing: string): Record<string, unknown> {
  return { prompt, checklist, writing: writing.slice(0, 6000) };
}

function validator(checklistLen: number): Validator<AiScoreDraft> {
  return (data) => {
    const d = data as { checklistMet?: unknown; score?: unknown; comment?: unknown };
    if (checklistLen > 0 && !Array.isArray(d?.checklistMet)) return { ok: false, error: "checklistMet must be a boolean array, one entry per checklist point" };
    const raw = typeof d?.score === "string" ? Number.parseFloat(d.score) : Number(d?.score);
    if (d?.score === null || d?.score === undefined || !Number.isFinite(raw)) return { ok: false, error: "score must be a number from 0 to 4" };
    let score = Math.max(0, Math.min(4, Math.round(raw)));
    // ground the score in the model's own checklist tally rather than trusting it blindly: a score that
    // disagrees sharply with how many checklist points the model itself says were met is pulled back in line.
    if (checklistLen > 0 && Array.isArray(d.checklistMet)) {
      const met = (d.checklistMet as unknown[]).filter(Boolean).length;
      const ratio = met / checklistLen;
      const expected = ratio >= 0.99 ? 4 : ratio >= 0.65 ? 3 : ratio >= 0.4 ? 2 : ratio > 0 ? 1 : 0;
      if (Math.abs(score - expected) > 1) score = expected;
    }
    const comment = short(d?.comment, 300);
    if (comment.length < 5) return { ok: false, error: "comment must be a sentence or two" };
    return { ok: true, value: { score, comment } };
  };
}

/**
 * Drafts an AI score for one ReadRise writing answer and saves it to RRRun.writingAiScore / writingAiComment.
 * Skips silently (never throws) when the run is already teacher-scored, the text is too short, AI is off/over its
 * limit, or the call fails — the teacher just scores by hand in every one of those cases.
 */
export async function draftReadRiseWritingScore(
  repo: Repo, input: { schoolId: string; runId: string; prompt: string; checklist: string[]; text: string },
  env: EnvLike, now = new Date(), make: { gemini?: typeof geminiProvider; anthropic?: typeof anthropicProvider } = {},
): Promise<{ outcome: AiOutcome; reason: string | null }> {
  if (words(input.text) < 5) return { outcome: "TOO_SHORT", reason: "There is not enough writing to score yet." };
  const run = await repo.findUnique("RRRun", { id: input.runId });
  if (!run || run.writingScore !== null && run.writingScore !== undefined) return { outcome: "FAILED", reason: "Already scored by a teacher." };
  const settings = await aiSettings(repo, input.schoolId);
  const picked = pickProvider(env, settings, make);
  if (!picked.ok) return { outcome: "OFF", reason: picked.reason };
  const rs = await rateState(repo, input.schoolId, settings, now);
  if (rs.reason && rs.waitMs > 0) return { outcome: "LIMIT", reason: rs.reason };
  const day = await consumeRateLimit(repo, `readrise-writing-ai:${input.schoolId}:${schoolDay(now)}`, READRISE_WRITING_AI_PER_DAY, 86_400_000, now);
  if (!day.allowed) return { outcome: "LIMIT", reason: `Today's ${READRISE_WRITING_AI_PER_DAY} AI score drafts are used. The teacher scores by hand, or try again tomorrow.` };
  const checklist = input.checklist.filter((c) => c.trim());
  const r = await callJson(repo, { schoolId: input.schoolId, tool: TOOL, picked, items: 1 }, system(checklist.length), payload(input.prompt, checklist, input.text), validator(checklist.length), 1)
    .catch((e: Error) => ({ ok: false as const, error: e.message, stop: true }));
  if (!r.ok) return { outcome: "FAILED", reason: r.error || "The AI did not give a usable draft." };
  // only write if STILL not teacher-scored (a teacher could have scored it while this background call was running)
  const changed = await repo.updateMany("RRRun", { id: input.runId, writingScore: null }, { writingAiScore: r.value.score, writingAiComment: r.value.comment });
  if (!changed) return { outcome: "FAILED", reason: "The run was scored by a teacher before the AI draft finished." };
  return { outcome: "SAVED", reason: null };
}
