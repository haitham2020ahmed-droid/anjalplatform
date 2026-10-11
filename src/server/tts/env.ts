/** Read-aloud (text-to-speech) settings from the SERVER environment only (keys never reach the browser). */
import { aiEnv } from "../ai/env";

export interface TtsEnv {
  /** google | gemini | none (default none: students hear the best voice of their own device) */
  TTS_PROVIDER?: string;
  /** Google Cloud Text-to-Speech API key (an API key restricted to the Text-to-Speech API) */
  GOOGLE_TTS_API_KEY?: string;
  /** default en-US-Chirp3-HD-Leda (most natural; estimated timings) · en-US-Neural2-F (exact word timings) */
  GOOGLE_TTS_VOICE?: string;
  /** the school's Gemini key (the same one the AI tools use: read through aiEnv()) */
  GEMINI_API_KEY?: string;
  /** default gemini-2.5-flash-preview-tts */
  GEMINI_TTS_MODEL?: string;
  /** default Kore (warm, clear); Puck is a livelier alternative */
  GEMINI_TTS_VOICE?: string;
  /** how Gemini should read (a short instruction; empty = none) */
  GEMINI_TTS_STYLE?: string;
  /** voice speed for generated audio, 0.25–2 (default 0.95; students can still choose Slow) */
  TTS_SPEAKING_RATE?: string;
  /** provider requests per minute for the pre-generation script (default 4 for Gemini, 30 for Google) */
  TTS_REQUESTS_PER_MINUTE?: string;
  /** off = never make audio while a student waits (only pre-generated audio is played). Default on. */
  TTS_ON_DEMAND?: string;
  /** audio made on demand per minute for the whole server (default 3: below the AI limit of ~4 per minute) */
  TTS_ON_DEMAND_PER_MINUTE?: string;
}

export function ttsEnv(): TtsEnv {
  return {
    TTS_PROVIDER: process.env.TTS_PROVIDER,
    GOOGLE_TTS_API_KEY: process.env.GOOGLE_TTS_API_KEY,
    GOOGLE_TTS_VOICE: process.env.GOOGLE_TTS_VOICE,
    GEMINI_API_KEY: aiEnv().GEMINI_API_KEY,
    GEMINI_TTS_MODEL: process.env.GEMINI_TTS_MODEL,
    GEMINI_TTS_VOICE: process.env.GEMINI_TTS_VOICE,
    GEMINI_TTS_STYLE: process.env.GEMINI_TTS_STYLE,
    TTS_SPEAKING_RATE: process.env.TTS_SPEAKING_RATE,
    TTS_REQUESTS_PER_MINUTE: process.env.TTS_REQUESTS_PER_MINUTE,
    TTS_ON_DEMAND: process.env.TTS_ON_DEMAND,
    TTS_ON_DEMAND_PER_MINUTE: process.env.TTS_ON_DEMAND_PER_MINUTE,
  };
}
