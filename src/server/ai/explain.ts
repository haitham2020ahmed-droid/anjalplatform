/**
 * 🤖 “Explain it to me”: after a wrong answer, a short, kind explanation in simple English that points to the text.
 * Uses the school's AI provider (Gemini's free tier when GEMINI_API_KEY is set, else Claude) with the same limits
 * as the AI tools; only the question's own content is sent (never the student's name or data). Without a provider,
 * or when the limit is reached, the platform explains it itself from the question's explanation and rationales.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { consumeRateLimit } from "../auth/rate-limit";
import { loadQuestionItems } from "../practice/items";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike } from "./engine";

const s = (v: unknown) => String(v ?? "");
export const EXPLAIN_PER_DAY = 15;
export interface Explanation { text: string; tip: string; steps: string[]; source: "AI" | "PLATFORM" }

/** The explanation of the student's last answer to this question. */
export async function explainAnswer(repo: Repo, actor: Actor, questionId: string, env: EnvLike, now = new Date()): Promise<Explanation> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  // only for a question the student has answered (the explanation never helps before answering)
  const last = (await repo.findMany("QuestionAttempt", { studentId: actor.studentId, questionId }, { select: ["response", "isCorrect", "createdAt"] })).sort((a, b) => new Date(s(b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt)).getTime() - new Date(s(a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt)).getTime())[0];
  if (!last) throw new ForbiddenError("Answer the question first.");
  const it = (await loadQuestionItems(repo, [questionId]))[0];
  if (!it) throw new ForbiddenError("Question not found.");
  const chosen = (() => { const r = typeof last.response === "string" ? (() => { try { return JSON.parse(s(last.response)); } catch { return last.response; } })() : last.response; return Array.isArray(r) ? r.map(String) : [s(r)]; })();
  const opts = it.options ?? [];
  const right = opts.filter((o) => o.correct);
  const picked = opts.filter((o) => chosen.includes(o.label));
  // the platform's own explanation (always available)
  const built: Explanation = {
    source: "PLATFORM",
    text: [it.explanation.whyCorrect, ...picked.filter((o) => !o.correct && o.rationale).map((o) => `“${o.text}” is not right: ${o.rationale}`)].filter(Boolean).join(" ") || `The correct answer is ${right.map((o) => `“${o.text}”`).join(" and ") || "shown above"}.`,
    tip: it.explanation.tip || "Read the question twice, then find the words in the text that prove your answer.",
    steps: [
      it.passageText ? "Go back to the text and find the sentence the question is about." : "Read the question slowly and underline the key words.",
      right.length ? `Check each choice against the text: only ${right.map((o) => o.label).join(" and ")} is supported by it.` : "Check your answer against the text.",
      "Say in your own words why the answer is right before you go on.",
    ],
  };
  const settings = await aiSettings(repo, s(actor.schoolId));
  const pickedP = pickProvider(env, settings);
  if (!pickedP.ok) return built;
  const mine = await consumeRateLimit(repo, `explain:${actor.userId}`, EXPLAIN_PER_DAY, 86_400_000, now);
  if (!mine.allowed) return built;
  const rs = await rateState(repo, s(actor.schoolId), settings, now);
  if (rs.waitMs > 0) return built;
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 5);
  const system = `You are a kind, patient reading tutor for a Grade ${grade} student learning English (their first language is Arabic). The student chose a wrong answer. In simple English a Grade ${grade} learner understands, explain (1) why the correct choice is right, pointing to words in the text when there is a text, (2) why the chosen choice does not fit, and (3) give one short strategy for next time. No more than 90 words in "explanation". Never mention grades, scores or the student. Reply with JSON only: {"explanation": string, "tip": string, "steps": [string, string, string]}.`;
  const payload = {
    questionText: it.stem,
    passageText: it.passageText ? it.passageText.slice(0, 2500) : null,
    choices: opts.map((o) => `${o.label}. ${o.text}`),
    correctChoice: right.map((o) => `${o.label}. ${o.text}`).join(" / ") || null,
    chosenChoice: picked.map((o) => `${o.label}. ${o.text}`).join(" / ") || null,
    authorExplanation: it.explanation.whyCorrect || null,
  };
  const r = await callJson(repo, { schoolId: s(actor.schoolId), tool: "explain", picked: pickedP, items: 1 }, system, payload, (data) => {
    const d = data as { explanation?: unknown; tip?: unknown; steps?: unknown };
    if (typeof d?.explanation !== "string" || d.explanation.trim().length < 10) return { ok: false, error: "explanation must be a sentence" };
    if (d.explanation.split(/\s+/).length > 140) return { ok: false, error: "explanation must be under 90 words" };
    return { ok: true, value: { explanation: d.explanation.trim(), tip: typeof d.tip === "string" ? d.tip.trim() : "", steps: Array.isArray(d.steps) ? d.steps.map(String).slice(0, 3) : [] } };
  }, 1).catch(() => ({ ok: false as const, error: "", stop: true }));
  if (!r.ok) return built;
  return { source: "AI", text: r.value.explanation, tip: r.value.tip || built.tip, steps: r.value.steps.length ? r.value.steps : built.steps };
}
