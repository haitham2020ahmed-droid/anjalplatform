/**
 * 🔊 What the browser must SAY (a dictation word, a screener word) has to reach the browser, because speech is made
 * there (speechSynthesis works offline). So that the word is not sitting in plain text in the page data (and in the
 * question's JSON), it travels lightly scrambled with a key from the question and is unscrambled only when spoken.
 * This is a speed bump, not security: a determined student with developer tools could still read it.
 *
 * Pure and dependency-free: the same code runs on the server (encode) and in the browser (decode).
 */

const bytesOf = (s: string) => new TextEncoder().encode(s);
const keyOf = (seed: string) => {
  const k = bytesOf(`anjal-speech:${seed}`);
  // spread the key so that short seeds still scramble every byte differently
  let h = 2166136261;
  return Array.from({ length: 64 }, (_, i) => { h = Math.imul(h ^ k[i % k.length] ^ i, 16777619) >>> 0; return h & 0xff; });
};
const toB64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Scrambles a value (word, or { word, sentence }) with the question's seed. */
export function encodeSpeech(value: unknown, seed: string): string {
  const key = keyOf(seed);
  const b = bytesOf(JSON.stringify(value));
  return toB64(b.map((x, i) => x ^ key[i % key.length]));
}

/** The reverse of encodeSpeech (null when it cannot be read). */
export function decodeSpeech<T = unknown>(code: string, seed: string): T | null {
  try {
    const key = keyOf(seed);
    const b = fromB64(code).map((x, i) => x ^ key[i % key.length]);
    return JSON.parse(new TextDecoder().decode(b)) as T;
  } catch {
    return null;
  }
}
