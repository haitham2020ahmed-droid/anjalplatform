/** Read-aloud (text-to-speech) settings from the SERVER environment only (keys never reach the browser). */
export interface TtsEnv {
  /** google | gemini | none (default none: students hear the best voice of their own device) */
  TTS_PROVIDER?: string;
  /** Google Cloud Text-to-Speech API key (an API key restricted to the Text-to-Speech API) */
  GOOGLE_TTS_API_KEY?: string;
  /** default en-US-Chirp3-HD-Leda (most natural; estimated timings) · en-US-Neural2-F (exact word timings) */
  GOOGLE_TTS_VOICE?: string;
  /** the school's Gemini key (the same one the AI tools use) */
  GEMINI_API_KEY?: string;
  GEMINI_TTS_MODEL?: string;
  GEMINI_TTS_VOICE?: string;
  /** how Gemini should read (a short instruction; empty = none) */
  GEMINI_TTS_STYLE?: string;
  /** voice speed for generated audio, 0.25–2 (default 0.95; students can still choose Slow) */
  TTS_SPEAKING_RATE?: string;
  /** provider requests per minute for the pre-generation script (default 30) */
  TTS_REQUESTS_PER_MINUTE?: string;
}

export function ttsEnv(): TtsEnv {
  return {
    TTS_PROVIDER: process.env.TTS_PROVIDER,
    GOOGLE_TTS_API_KEY: process.env.GOOGLE_TTS_API_KEY,
    GOOGLE_TTS_VOICE: process.env.GOOGLE_TTS_VOICE,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_TTS_MODEL: process.env.GEMINI_TTS_MODEL,
    GEMINI_TTS_VOICE: process.env.GEMINI_TTS_VOICE,
    GEMINI_TTS_STYLE: process.env.GEMINI_TTS_STYLE,
    TTS_SPEAKING_RATE: process.env.TTS_SPEAKING_RATE,
    TTS_REQUESTS_PER_MINUTE: process.env.TTS_REQUESTS_PER_MINUTE,
  };
}
