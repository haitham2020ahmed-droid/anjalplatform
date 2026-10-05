/** Server-only AI provider for the question bank (the API key never reaches the browser). */
import "server-only";
import { env } from "@/lib/env";
import { ValidationError } from "@/server/curriculum-admin";
import { anthropicProvider, type AiProvider } from "./question-generator";

export function aiProvider(): AiProvider {
  if (!env.ANTHROPIC_API_KEY) throw new ValidationError("AI question generation is not set up: add ANTHROPIC_API_KEY to the server settings.");
  return anthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL });
}
