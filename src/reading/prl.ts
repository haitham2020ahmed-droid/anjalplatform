/**
 * Platform Reading Level (PRL) — an INTERNAL readability scale.
 *
 * PRL is NOT a Lexile measure and must never be labelled as one. It is derived
 * from the public-domain Flesch–Kincaid grade-level formula:
 *   FKGL = 0.39·(words/sentences) + 11.8·(syllables/words) − 15.59
 *   PRL  = round(100 + 100·FKGL), clamped to 100–1400
 * so PRL 500 ≈ text a typical Grade 4 reader handles, PRL 600 ≈ Grade 5.
 * Official Lexile values, when licensed, are stored in OfficialReadingMeasure.
 */

export interface TextStats {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  avgWordLength: number;
  avgSyllablesPerWord: number;
}

/** Heuristic English syllable counter (good enough for readability bands). */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Genres where a prose readability formula is not meaningful. */
export const NON_PROSE_GENRES = new Set(["Poetry", "Drama"]);

/** PRL only for prose; poems and scripts return null (teachers set a level manually). */
export function platformReadingLevelFor(text: string, genre: string): number | null {
  return NON_PROSE_GENRES.has(genre) ? null : platformReadingLevel(analyzeText(text));
}

export function analyzeText(text: string): TextStats {
  // sentence boundaries: end punctuation, OR a line break (headings and list lines have no period)
  const sentences = text.split(/[.!?]+(?:["”’)]*)\s+|[.!?]+$|\n+/).map((s) => s.trim()).filter(Boolean);
  const words = text.match(/[A-Za-z’'-]+/g) ?? [];
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const letters = words.reduce((a, w) => a + w.replace(/[^A-Za-z]/g, "").length, 0);
  const syllables = words.reduce((a, w) => a + countSyllables(w), 0);
  return {
    wordCount,
    sentenceCount,
    avgSentenceLength: wordCount / sentenceCount,
    avgWordLength: wordCount ? letters / wordCount : 0,
    avgSyllablesPerWord: wordCount ? syllables / wordCount : 0,
  };
}

export function platformReadingLevel(stats: TextStats): number {
  const fkgl = 0.39 * stats.avgSentenceLength + 11.8 * stats.avgSyllablesPerWord - 15.59;
  return Math.round(Math.min(1400, Math.max(100, 100 + 100 * fkgl)));
}

/**
 * Student reading range from the reading-domain ability estimate.
 * Center = grade-level PRL shifted by theta (1 theta ≈ 1 grade ≈ 100 PRL);
 * width widens when the estimate is uncertain (SE) and narrows with evidence.
 */
export function studentReadingRange(gradeLevel: number, theta: number, se: number): { low: number; high: number; label: string } {
  const center = 100 + 100 * gradeLevel + 100 * theta;
  const half = Math.round(Math.min(150, 40 + 60 * se));
  const low = Math.max(100, Math.round((center - half) / 10) * 10);
  const high = Math.min(1400, Math.round((center + half) / 10) * 10);
  return { low, high, label: `PRL ${low}–${high}` };
}
