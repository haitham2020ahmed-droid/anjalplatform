/**
 * 🔊 Says a word (or a short sentence) with the browser's own voice: speechSynthesis works offline, with no
 * download and no network. Used by DICTATION items and the decoding screener.
 */
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Speaks the texts one after another (e.g. word → sentence → word). `slow` uses a slower rate for a replay. */
export function speakTexts(texts: string[], opts: { slow?: boolean; onEnd?: () => void } = {}): boolean {
  if (!canSpeak()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = synth.getVoices();
  const voice = voices.find((v) => /en[-_]US/i.test(v.lang) && /natural|samantha|google|aria|jenny/i.test(v.name)) ?? voices.find((v) => /^en/i.test(v.lang));
  const list = texts.map((t) => t.trim()).filter(Boolean);
  list.forEach((t, k) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "en-US";
    u.rate = opts.slow ? 0.55 : 0.85;
    if (voice) u.voice = voice;
    if (k === list.length - 1 && opts.onEnd) { u.onend = () => opts.onEnd!(); u.onerror = () => opts.onEnd!(); }
    synth.speak(u);
  });
  return list.length > 0;
}

export const stopSpeaking = () => { if (canSpeak()) window.speechSynthesis.cancel(); };
