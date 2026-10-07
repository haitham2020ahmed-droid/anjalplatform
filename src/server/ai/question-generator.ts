/**
 * AI question generation: prompt building, provider call and response parsing.
 *
 * PRIVACY: this module receives ONLY curriculum data (grade, book, unit, lesson, skill,
 * standard, difficulty plan, and existing question stems to avoid duplicates). It has no
 * access to students, users, answers or results, and it imports nothing that does
 * (enforced by tests/ai-bank.test.ts). Nothing about a student can reach the AI provider.
 */

export interface GenerationContext {
  grade: number;
  book: string;
  unit: { number: number; title: string } | null;
  lesson: { code: string; title: string; genre: string | null } | null;
  skill: { code: string; name: string; description: string | null; domain: string };
  standard: { code: string; description: string | null };
  /** One slot per question to write, with the difficulty level (1–7) it must have. */
  slots: { slot: number; level: number }[];
  /** Existing question stems for this skill, so the model avoids repeating them. */
  avoid: string[];
  /** Approved questions of this skill (curriculum content only), as models of style and format. */
  examples?: { stem: string; options: string[]; correct: string; level: number }[];
}

export interface GeneratedQuestion {
  slot: number;
  level: number;
  cognitiveLevel: string;
  skillCode: string;
  standardCode: string;
  stem: string;
  options: { text: string; correct: boolean; rationale: string | null }[];
  explanation: string;
  tip: string | null;
}

export interface AiProvider {
  /** Returns the model's raw text reply. */
  complete(system: string, user: string): Promise<string>;
}

export const COGNITIVE_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;

export const LEVEL_GUIDE: Record<number, string> = {
  1: "very easy: recognize a basic fact or definition",
  2: "easy: simple recall or a clear example",
  3: "below grade level: straightforward understanding",
  4: "on grade level: typical grade-level task",
  5: "above grade level: requires careful reading or reasoning",
  6: "challenging: inference, analysis or close distinctions",
  7: "advanced: evaluation or subtle reasoning with strong distractors",
};

export function buildPrompt(ctx: GenerationContext): { system: string; user: string } {
  const system = [
    "You write ORIGINAL English Language Arts multiple-choice practice questions for students in Saudi Arabia.",
    "Rules: never copy text from published books; use culturally appropriate, child-friendly content;",
    "each question has exactly 4 options with exactly ONE correct option; every wrong option has a short",
    "rationale explaining why it is wrong (the correct option's rationale is null); include a one-sentence",
    "explanation of why the answer is correct and an optional short tip. If the question needs a text,",
    "include a short original excerpt (at most 80 words) inside the stem.",
    "Every question must assess the given Common Core State Standard (CCSS) for English Language Arts at the given grade.",
    "Return ONLY valid JSON, no Markdown, in exactly this shape:",
    '{"questions":[{"slot":1,"level":4,"cognitiveLevel":"Understand","skillCode":"…","standardCode":"…","stem":"…",',
    '"options":[{"text":"…","correct":true,"rationale":null},{"text":"…","correct":false,"rationale":"…"}],',
    '"explanation":"…","tip":"…"}]}',
    `cognitiveLevel must be one of: ${COGNITIVE_LEVELS.join(", ")}.`,
  ].join(" ");
  const user = JSON.stringify(
    {
      task: `Write ${ctx.slots.length} new question(s), one per slot, each at the slot's difficulty level.`,
      grade: ctx.grade,
      book: ctx.book,
      unit: ctx.unit,
      lesson: ctx.lesson,
      skill: ctx.skill,
      standard: ctx.standard,
      requiredSkillCode: ctx.skill.code,
      requiredStandardCode: ctx.standard.code,
      slots: ctx.slots.map((s) => ({ slot: s.slot, level: s.level, meaning: LEVEL_GUIDE[s.level] })),
      styleExamples: (ctx.examples ?? []).slice(0, 5).map((e) => ({ level: e.level, stem: e.stem, options: e.options, correct: e.correct })),
      styleRule: "Match the style, length, vocabulary and format of styleExamples, but write NEW questions: never copy or lightly reword them.",
      doNotRepeatTheseExistingQuestions: ctx.avoid.slice(0, 40),
    },
    null,
    1,
  );
  return { system, user };
}

/** Extracts the questions array from a model reply (tolerates ```json fences). Throws on non-JSON. */
export function parseGenerated(text: string): unknown[] {
  const clean = text.replace(/```(?:json)?/gi, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The AI reply did not contain JSON.");
  const data = JSON.parse(clean.slice(start, end + 1)) as { questions?: unknown };
  if (!Array.isArray(data.questions)) throw new Error("The AI reply has no “questions” list.");
  return data.questions;
}

/** Anthropic Messages API provider (server-side only; the key never reaches the browser). */
export function anthropicProvider(opts: { apiKey: string; model: string; fetchImpl?: typeof fetch; timeoutMs?: number }): AiProvider {
  const f = opts.fetchImpl ?? fetch;
  return {
    async complete(system, user) {
      const res = await f("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: opts.model, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      });
      if (!res.ok) throw providerError("Claude", res.status, await res.text(), opts.model);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    },
  };
}

/** Readable message for a failed provider call (shown to the admin; never includes the key). */
function providerError(provider: "Gemini" | "Claude", status: number, body: string, model: string): Error {
  const b = body.slice(0, 300);
  if (provider === "Gemini") {
    if (/ACCESS_TOKEN_TYPE_UNSUPPORTED/.test(b)) return new Error("Google did not accept this Gemini key. Check that GEMINI_API_KEY holds the whole key (no spaces, nothing cut off); if it does, create a new key in aistudio.google.com and replace it.");
    if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(b)) return new Error("The Gemini API key is not valid. Check GEMINI_API_KEY in the server settings (a Google key starts with “AQ.” or “AIza”).");
    if (status === 429) return new Error("Gemini's free usage limit was reached (per minute or per day). Wait a minute, or try again tomorrow.");
    if (status === 404) return new Error(`The Gemini model “${model}” was not found. Set GEMINI_MODEL in the server settings to a current model, e.g. gemini-2.5-flash.`);
    if (status >= 500) return new Error(`Gemini is temporarily unavailable (error ${status}). Try again in a few minutes.`);
    return new Error(`Gemini error ${status}: ${b}`);
  }
  if (status === 401) return new Error("The Claude API key is not valid. Check ANTHROPIC_API_KEY in the server settings (an Anthropic key starts with “sk-ant-”).");
  if (status === 429) return new Error("Claude's usage limit was reached. Wait a minute and try again.");
  return new Error(`AI provider error ${status}: ${b}`);
}

/**
 * Google Gemini provider (generateContent; server-side only, the key never reaches the browser).
 * JSON mode is on because the prompt asks for one JSON object. Only the prompt is sent: curriculum
 * content, never student data (see buildPrompt).
 */
export function geminiProvider(opts: { apiKey: string; model: string; fetchImpl?: typeof fetch; timeoutMs?: number }): AiProvider {
  const f = opts.fetchImpl ?? fetch;
  return {
    async complete(system, user) {
      const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          // newer models also spend output tokens on thinking: leave room for the JSON answer
          generationConfig: { maxOutputTokens: 16384, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      });
      if (!res.ok) throw providerError("Gemini", res.status, await res.text(), opts.model);
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      if (data.promptFeedback?.blockReason) throw new Error(`Gemini refused the request (${data.promptFeedback.blockReason}). Try again, or with fewer questions.`);
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (!text.trim()) {
        throw new Error(cand?.finishReason === "MAX_TOKENS" ? "Gemini's reply was cut off (too long). Try generating fewer questions at once." : `Gemini returned no answer${cand?.finishReason ? ` (${cand.finishReason})` : ""}. Try again.`);
      }
      return text;
    },
  };
}

export type AiChoice = { provider: "gemini" | "anthropic"; apiKey: string; model: string };

/**
 * Which AI provider to use, from the server settings:
 *   AI_PROVIDER = "gemini" | "anthropic"  (optional; forces one)
 *   GEMINI_API_KEY (+ GEMINI_MODEL)        Google Gemini (free tier available)
 *   ANTHROPIC_API_KEY (+ AI_MODEL)         Claude
 * Without AI_PROVIDER, Gemini is used when its key is set, else Claude. A Google key ("AQ.…" or "AIza…")
 * put in ANTHROPIC_API_KEY by mistake is recognised and used as the Gemini key.
 */
export function chooseAiProvider(s: { AI_PROVIDER?: string; GEMINI_API_KEY?: string; GEMINI_MODEL?: string; ANTHROPIC_API_KEY?: string; AI_MODEL?: string }): AiChoice | { error: string } {
  // AI Studio keys: "AQ." (auth keys, issued since 2026) or the older "AIza"
  const isGoogleKey = (k: string) => /^(AQ\.|AIza)/.test(k);
  let gemini = (s.GEMINI_API_KEY ?? "").trim();
  let anthropic = (s.ANTHROPIC_API_KEY ?? "").trim();
  if (anthropic && isGoogleKey(anthropic)) {
    if (!gemini) gemini = anthropic;
    anthropic = "";
  }
  const want = (s.AI_PROVIDER ?? "").trim().toLowerCase();
  const geminiChoice = (): AiChoice => ({ provider: "gemini", apiKey: gemini, model: (s.GEMINI_MODEL ?? "").trim() || "gemini-3.5-flash" });
  const claudeChoice = (): AiChoice => ({ provider: "anthropic", apiKey: anthropic, model: (s.AI_MODEL ?? "").trim() || "claude-sonnet-5-5" });
  if (want && want !== "gemini" && want !== "anthropic" && want !== "claude") return { error: `AI_PROVIDER must be “gemini” or “anthropic” (found “${s.AI_PROVIDER}”).` };
  if (want === "gemini") return gemini ? geminiChoice() : { error: "AI_PROVIDER is gemini but GEMINI_API_KEY is not set in the server settings." };
  if (want === "anthropic" || want === "claude") {
    if (anthropic) return claudeChoice();
    return { error: (s.ANTHROPIC_API_KEY ?? "").trim() ? "ANTHROPIC_API_KEY holds a Google key (it starts with “AQ.” or “AIza”). Put it in GEMINI_API_KEY, or remove AI_PROVIDER." : "AI_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set in the server settings." };
  }
  if (gemini) return geminiChoice();
  if (anthropic) return claudeChoice();
  return { error: "AI question generation is not set up: add GEMINI_API_KEY (free, from aistudio.google.com) or ANTHROPIC_API_KEY to the server settings." };
}
