/**
 * 🔊 Says a word (or a short sentence) with the browser's own voice: speechSynthesis works offline, with no
 * download and no network. Used by DICTATION items and the decoding screener. The most natural US voice of the
 * device is chosen (src/lib/tts/voices.ts).
 */
import { bestBrowserVoice } from "@/lib/tts/voices";

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Speaks the texts one after another (e.g. word → sentence → word). `slow` uses a slower rate for a replay. */
export function speakTexts(texts: string[], opts: { slow?: boolean; onEnd?: () => void } = {}): boolean {
  if (!canSpeak()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = bestBrowserVoice();
  const list = texts.map((t) => t.trim()).filter(Boolean);
  list.forEach((t, k) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "en-US";
    u.rate = opts.slow ? 0.6 : 0.95;
    if (voice) u.voice = voice;
    if (k === list.length - 1 && opts.onEnd) { u.onend = () => opts.onEnd!(); u.onerror = () => opts.onEnd!(); }
    synth.speak(u);
  });
  return list.length > 0;
}

export const stopSpeaking = () => { if (canSpeak()) window.speechSynthesis.cancel(); };
