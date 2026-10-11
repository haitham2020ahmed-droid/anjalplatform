/**
 * 🚀 ReadRise text helpers shared by the server and the reader (pure, no React).
 * An article body is paragraphs separated by a blank line. Highlights and notes are stored as WORD positions
 * in the whole text: { start, end } = the first word and one past the last word (0-based).
 */
export interface KeyWord { word: string; partOfSpeech: string; definition: string; example: string }
export type HighlightColor = "yellow" | "green" | "blue";
export interface Annotation { start: number; end: number; color: HighlightColor; note?: string }
export interface Token { i: number; text: string }

export const COLORS: HighlightColor[] = ["yellow", "green", "blue"];

export const paragraphsOf = (body: string): string[] => body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** Paragraphs → tokens with their global word positions. */
export function tokenize(body: string): Token[][] {
  let i = 0;
  return paragraphsOf(body).map((p) => p.split(/\s+/).filter(Boolean).map((text) => ({ i: i++, text })));
}

export const wordCount = (body: string) => body.trim().split(/\s+/).filter(Boolean).length;
/** Reading time at 120 words a minute (at least 1 minute). */
export const minutesFor = (words: number) => Math.max(1, Math.round(words / 120));

const bare = (w: string) => w.toLowerCase().replace(/[^a-z'-]/g, "").replace(/^'+|'+$/g, "");

/** The key word a token is a form of (word, words, wordes, worded, wording, …), or null. */
export function keyWordFor(token: string, keyWords: KeyWord[]): KeyWord | null {
  const t = bare(token);
  if (!t) return null;
  for (const k of keyWords) {
    const w = bare(k.word);
    if (!w) continue;
    const forms = new Set([w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`]);
    if (w.endsWith("e")) forms.add(`${w.slice(0, -1)}ing`);
    if (w.endsWith("y")) { forms.add(`${w.slice(0, -1)}ies`); forms.add(`${w.slice(0, -1)}ied`); }
    if (forms.has(t)) return k;
  }
  return null;
}

/** Validates annotations from the browser (positions inside the text, known colours, short notes). */
export function cleanAnnotations(raw: unknown, totalWords: number): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const out: Annotation[] = [];
  for (const a of raw.slice(0, 300)) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const start = Math.floor(Number(r.start)), end = Math.floor(Number(r.end));
    const color = String(r.color) as HighlightColor;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > totalWords || !COLORS.includes(color)) continue;
    const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 500) : undefined;
    out.push(note ? { start, end, color, note } : { start, end, color });
  }
  return out;
}

export const POLL_LABELS = ["Strongly agree", "Agree", "Disagree", "Strongly disagree"] as const;
