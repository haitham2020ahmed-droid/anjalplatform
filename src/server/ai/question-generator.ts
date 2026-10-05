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
      if (!res.ok) throw new Error(`AI provider error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    },
  };
}
