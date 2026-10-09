/** The AI keys and choices from the SERVER environment only (never sent to the browser). */
import type { EnvLike } from "./engine";

export function aiEnv(): EnvLike {
  return { AI_PROVIDER: process.env.AI_PROVIDER, GEMINI_API_KEY: process.env.GEMINI_API_KEY, GEMINI_MODEL: process.env.GEMINI_MODEL, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, AI_MODEL: process.env.AI_MODEL };
}
