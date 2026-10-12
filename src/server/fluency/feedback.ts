/**
 * 🎯 What a student is told after a reading (pure functions, tested in Node): every word marked, the counts of each
 * kind of miscue, the NAEP fluency level, the THREE words most worth practising, 2–3 short next steps in plain,
 * encouraging English, and the growth since the student's last reading of the same text.
 *
 * Marking follows oral reading fluency practice (Hasbrouck & Tindal; running records):
 *   errors (lower the words correct):  SUBSTITUTED / MISPRONOUNCED (another word, or the word changed) · SKIPPED
 *                                      (omission) · HESITATION (stuck for more than 3 seconds)
 *   noted, NOT errors:                 SELF_CORRECTION (fixed within 3 s) · REPETITION · INSERTION (an extra word)
 * An accent is never an error. Next steps are chosen from the evidence in a fixed order of importance (accuracy
 * before speed, speed before expression), as a reading specialist would: one thing at a time, said kindly.
 */
import type { ErrorKind, Prosody } from "./coach";

export type WordMark = "OK" | ErrorKind | "NOT_READ";
export type WordNote = "SELF_CORRECTION" | "REPETITION" | "INSERTION";
export interface MarkedWord { text: string; mark: WordMark; heard: string; note?: WordNote | null; inserted?: string }

export interface MiscueCounts { read: number; correct: number; substitution: number; omission: number; hesitation: number; insertion: number; selfCorrection: number; repetition: number; notRead: number }
export interface PractiseWord { word: string; why: "SUBSTITUTED" | "MISPRONOUNCED" | "SKIPPED" | "HESITATION"; heard: string }
export interface NextStep { icon: string; text: string; code: string }
export interface ReadingGrowth { previous: { wcpm: number; accuracy: number; date: string }; wcpmGain: number; accuracyGain: number; message: string }
export interface FeedbackSummary {
  counts: MiscueCounts;
  practise: PractiseWord[];
  nextSteps: NextStep[];
  naep: { level: 1 | 2 | 3 | 4 | null; label: string; kid: string };
  headline: string;
  growth: ReadingGrowth | null;
}

/** The NAEP oral reading fluency scale (2002/2018), for teachers and in simple words for students. */
export const NAEP_LEVELS: Record<1 | 2 | 3 | 4, { label: string; kid: string }> = {
  1: { label: "Level 1 · reads primarily word by word", kid: "You read one word at a time. Let's join words into groups." },
  2: { label: "Level 2 · reads mainly in two-word phrases", kid: "You read two words at a time. Try longer word groups." },
  3: { label: "Level 3 · reads in meaningful phrase groups, some expression", kid: "You read in good word groups. Add a little more feeling." },
  4: { label: "Level 4 · larger meaningful phrases, expressive, follows punctuation", kid: "You read smoothly in phrases, with expression. Wonderful!" },
};

const bare = (w: string) => w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "");
/** little words a reader usually fixes alone: practised only when nothing bigger was missed */
const SMALL = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "is", "it", "and", "or", "but", "as", "by", "for", "he", "she", "we", "i", "you", "was", "his", "her", "my"]);

export function countMiscues(words: readonly MarkedWord[]): MiscueCounts {
  const c: MiscueCounts = { read: 0, correct: 0, substitution: 0, omission: 0, hesitation: 0, insertion: 0, selfCorrection: 0, repetition: 0, notRead: 0 };
  for (const w of words) {
    if (w.mark === "NOT_READ") { c.notRead++; continue; }
    c.read++;
    if (w.mark === "OK") c.correct++;
    else if (w.mark === "SKIPPED") c.omission++;
    else if (w.mark === "HESITATION") c.hesitation++;
    else c.substitution++;
    if (w.note === "SELF_CORRECTION") c.selfCorrection++;
    else if (w.note === "REPETITION") c.repetition++;
    else if (w.note === "INSERTION") c.insertion++;
  }
  return c;
}

/**
 * The three words most worth practising: a changed word first (it is the real decoding gap), then a long stop, then
 * a skipped word; a word missed twice before a word missed once; longer words before short ones; little words
 * (the, of, a…) only when nothing else was missed. One entry per word.
 */
export function wordsToPractise(words: readonly MarkedWord[], n = 3): PractiseWord[] {
  const weight: Record<string, number> = { SUBSTITUTED: 30, MISPRONOUNCED: 30, HESITATION: 20, SKIPPED: 10 };
  const by = new Map<string, { score: number; first: number; why: PractiseWord["why"]; heard: string; word: string }>();
  words.forEach((w, i) => {
    if (w.mark === "OK" || w.mark === "NOT_READ") return;
    const word = w.text.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "");
    const key = bare(word);
    if (key.length < 2 && !/^[ai]$/i.test(key)) return;
    const base = weight[w.mark] ?? 0;
    const cur = by.get(key);
    if (cur) { cur.score += 15; if (base > (weight[cur.why] ?? 0)) { cur.why = w.mark as PractiseWord["why"]; cur.heard = w.heard; } return; }
    by.set(key, { score: base + Math.min(10, key.length) - (SMALL.has(key) ? 40 : 0), first: i, why: w.mark as PractiseWord["why"], heard: w.heard, word });
  });
  return [...by.values()].sort((a, b) => b.score - a.score || a.first - b.first).slice(0, n).map(({ word, why, heard }) => ({ word, why, heard }));
}

/** The NAEP level from the AI's overall score, or from the four traits. */
export function naepLevel(expression: number | null, prosody: Prosody | null | undefined): FeedbackSummary["naep"] {
  let lv = expression !== null && expression >= 1 && expression <= 4 ? Math.round(expression) : null;
  if (lv === null && prosody) {
    const sc = Object.values(prosody).filter((x): x is { score: number; reason: string } => !!x).map((x) => x.score);
    if (sc.length) lv = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
  }
  if (lv === null) return { level: null, label: "Not enough reading to judge", kid: "Read a little longer next time so the coach can hear how you sound." };
  const l = Math.max(1, Math.min(4, lv)) as 1 | 2 | 3 | 4;
  return { level: l, ...NAEP_LEVELS[l] };
}

export interface FeedbackInput {
  words: readonly MarkedWord[];
  wcpm: number; accuracy: number;
  expression: number | null; prosody: Prosody | null | undefined;
  /** the grade's 25th / 50th percentile now (Hasbrouck & Tindal), when known */
  p25?: number | null; p50?: number | null;
  /** the student's last reading of the same text (not a practice re-read) */
  previous?: { wcpm: number; accuracy: number; date: string } | null;
  /** a speed drill or one echo sentence: no speed or expression advice */
  task?: "READ" | "ECHO" | "DRILL";
}

const trait = (p: Prosody | null | undefined, t: keyof Prosody) => p?.[t]?.score ?? null;

/**
 * 2–3 next steps from the evidence, most important first, each specific to this reading:
 *   accuracy under 90 % → slow down and get every word right (an easier passage first);
 *   misses → practise the three words; skipped words → point under the line; long stops → break the word into parts;
 *   accurate but slow → read it again a little faster, like talking; fast but inaccurate → slow down;
 *   phrasing / expression ≤ 2 → read in word groups, use the punctuation;
 *   self-corrections → praised (great readers fix their own words).
 */
export function nextSteps(x: FeedbackInput, counts: MiscueCounts, practise: PractiseWord[]): NextStep[] {
  const out: NextStep[] = [];
  const add = (code: string, icon: string, text: string) => { if (!out.some((s) => s.code === code)) out.push({ code, icon, text }); };
  const read = x.task ?? "READ";
  const list = practise.map((p) => `“${p.word}”`).join(", ");
  if (counts.read > 0 && x.accuracy < 90) add("ACCURACY", "🐢", "Slow down and get every word right — accuracy first, speed later. Look at all the letters before you say a word.");
  if (practise.length) add("WORDS", "🗣", `Practise ${practise.length === 1 ? "this word" : `these ${practise.length} words`}: ${list}. Tap each one to hear it, say it three times, then read its sentence again.`);
  if (counts.omission >= 2) add("SKIPS", "👉", `You skipped ${counts.omission} words. Slide your finger under the line as you read so every word gets said.`);
  if (counts.hesitation >= 1) add("STOPS", "🧩", "When a word is tricky, break it into parts (sta-tion, un-der) and keep going within 3 seconds.");
  if (read === "READ" && counts.read >= 20) {
    const slow = x.p25 != null && x.wcpm < x.p25;
    if (x.accuracy >= 95 && slow) add("RATE", "🚀", "Your words are right! Now read the same passage again a little faster, like you are talking to a friend.");
    else if (x.accuracy < 93 && x.p50 != null && x.wcpm >= x.p50) add("TOO_FAST", "🛑", "You read fast, but some words slipped. Slow down a little so every word is right.");
    const phr = trait(x.prosody, "phrasing"), into = trait(x.prosody, "intonation");
    if ((phr !== null && phr <= 2) || (x.expression !== null && x.expression <= 2)) add("PHRASING", "🎼", "Read in word groups, not one word at a time: scoop 3–4 words together and take a breath at commas and full stops.");
    else if (into !== null && into <= 2) add("EXPRESSION", "🎭", "Let your voice show the meaning: go up at a question (?), sound excited at (!), and change your voice for people talking.");
  }
  if (counts.selfCorrection > 0) add("SELF_CORRECT", "🌟", `You fixed ${counts.selfCorrection} word${counts.selfCorrection > 1 ? "s" : ""} by yourself — that is what great readers do!`);
  // always at least two clear steps
  if (out.length < 2 && read === "READ") add("REREAD", "🔁", x.accuracy >= 97 ? `Great reading! Read it once more and try to beat ${x.wcpm} words correct per minute.` : "Read it once more, slowly and carefully, and try to get every word right.");
  if (out.length < 2) add("NEW_TEXT", "📚", "Try a new passage at your level and read it with the same care.");
  return out.slice(0, 3);
}

/** Growth since the last reading of the same text, in encouraging words. */
export function growthSince(previous: { wcpm: number; accuracy: number; date: string } | null | undefined, now: { wcpm: number; accuracy: number }): ReadingGrowth | null {
  if (!previous) return null;
  const wcpmGain = now.wcpm - previous.wcpm, accuracyGain = now.accuracy - previous.accuracy;
  const message = wcpmGain > 0 && accuracyGain >= 0 ? `🚀 You grew! ${wcpmGain} more word${wcpmGain === 1 ? "" : "s"} correct per minute than last time.`
    : wcpmGain > 0 ? `⚡ ${wcpmGain} more words per minute than last time. Now make every word right.`
    : accuracyGain > 0 ? `🎯 More words right than last time (${previous.accuracy}% → ${now.accuracy}%). Speed will follow.`
    : wcpmGain === 0 && accuracyGain === 0 ? "👍 Just as strong as last time. Keep practising to grow."
    : "💪 A harder day than last time — that happens. Listen to the passage, then read it again.";
  return { previous, wcpmGain, accuracyGain, message };
}

/** Everything the student is shown after a reading (pure). */
export function feedbackSummary(x: FeedbackInput): FeedbackSummary {
  const counts = countMiscues(x.words);
  const practise = wordsToPractise(x.words);
  const naep = x.task === "DRILL" ? { level: null, label: "Word drill (no expression score)", kid: "" } : naepLevel(x.expression, x.prosody);
  const headline = counts.read === 0 ? "💪 Good try! Start at the first word and read aloud."
    : x.accuracy >= 97 && counts.read >= 20 ? "🌟 Excellent reading — almost every word right!"
    : x.accuracy >= 93 ? "👏 Good reading — let's polish a few words."
    : x.accuracy >= 90 ? "👍 Nice work — a few words to practise."
    : "💪 Good effort! Practise the words below and read it again.";
  return { counts, practise, nextSteps: nextSteps(x, counts, practise), naep, headline, growth: growthSince(x.previous, x) };
}
