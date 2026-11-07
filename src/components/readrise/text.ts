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
  // round 6: the stored value may be the new object ({ marks, … }) — its highlights are `marks`
  const list = Array.isArray(raw) ? raw : readAnnotations(raw).marks;
  const out: Annotation[] = [];
  for (const a of list.slice(0, 300)) {
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

/** Round 6: the poll is Agree / Disagree (stored on the old 0–3 scale: 0–1 agree, 2–3 disagree; old runs keep working). */
export const AGREE = 1, DISAGREE = 2;
export const pollSide = (v: number | null | undefined): "AGREE" | "DISAGREE" | null => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v) <= 1 ? "AGREE" : "DISAGREE");

// ------------------------------------------------------------------ round 6: RRRun.annotations as one object

/**
 * 🗂 Round 6 (no schema change): RRRun.annotations holds the highlights AND the Achieve-style step data. Old rows are a
 * bare array of highlights; new rows are an object { marks: [...highlights], ready, reflect, rating, quiz, secondTry,
 * drafts, draft, notesText, …other keys (e.g. a teacher's grading meta) }. Every writer keeps the keys it does not
 * own — always go through readAnnotations / withRunExtras.
 */
export interface PollNote { vote: number; why: string; at: string }
export interface RunExtras {
  /** Ready (before reading): the vote and "Explain why you voted the way you did" */
  ready?: PollNote;
  /** Reflect (after the questions): the same */
  reflect?: PollNote;
  /** the Article Rating popup after Read (skippable) */
  rating?: { stars: number | null; access: "SELF" | "TEACHER" | null; skipped?: boolean; at: string };
  /**
   * Respond in progress: first and second tries (question number → letter), the first answers' times (`at`: ms after
   * the questions opened, worked out on the SERVER — answerQuestion) and the server moment of each first answer (`ts`)
   */
  quiz?: { first: Record<string, string>; second: Record<string, string>; at: Record<string, number>; ts?: Record<string, number> };
  /** after scoring: the second tries (question number → { letter, correct }: the shape points.ts reads); RRRun.answers keeps the FIRST tries */
  secondTry?: Record<string, { letter: string; correct: boolean } | string>;
  /** Write: the drafts (Draft 1, Draft 2 …) and the open one */
  drafts?: string[]; draft?: number;
  /** the Notes tab text */
  notesText?: string;
  [key: string]: unknown;
}

/** Splits a stored RRRun.annotations value (old array or new object, or JSON text) into the highlights and the rest. */
export function readAnnotations(raw: unknown): { marks: unknown[]; extras: RunExtras } {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  if (Array.isArray(v)) return { marks: v, extras: {} };
  if (v && typeof v === "object") {
    const { marks, ...rest } = v as Record<string, unknown>;
    return { marks: Array.isArray(marks) ? marks : [], extras: rest as RunExtras };
  }
  return { marks: [], extras: {} };
}

/** The value to store: the highlights (new ones or the stored ones) + the stored extras merged with `patch`. */
export function withRunExtras(raw: unknown, patch: Partial<RunExtras>, marks?: unknown[]): Record<string, unknown> {
  const cur = readAnnotations(raw);
  const extras: Record<string, unknown> = { ...cur.extras };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete extras[k]; else extras[k] = v; }
  return { ...extras, marks: marks ?? cur.marks };
}
