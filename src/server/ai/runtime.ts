/** Server-only AI provider for the question bank (the API key never reaches the browser). */
import "server-only";
import { env } from "@/lib/env";
import { ValidationError } from "@/server/curriculum-admin";
import { anthropicProvider, chooseAiProvider, geminiProvider, type AiProvider } from "./question-generator";

/** Gemini when GEMINI_API_KEY is set (or AI_PROVIDER=gemini), else Claude; see chooseAiProvider. */
export function aiProvider(): AiProvider {
  const c = chooseAiProvider(env);
  if ("error" in c) throw new ValidationError(c.error);
  return c.provider === "gemini" ? geminiProvider({ apiKey: c.apiKey, model: c.model }) : anthropicProvider({ apiKey: c.apiKey, model: c.model });
}
