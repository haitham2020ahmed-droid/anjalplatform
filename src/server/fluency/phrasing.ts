/**
 * 🎼 Phrased reading: the passage with phrase marks — "/" a short pause, "//" a long pause — so students read in
 * meaningful groups of words instead of word by word. The marks come from a deterministic chunker (no AI):
 *   - "//" after the end of a sentence (. ! ? ; :), "/" after a comma or a dash;
 *   - "/" before a conjunction (and, but, because, when…), before a preposition (in, on, with…) once the phrase
 *     has a few words, after an opening prepositional phrase ("In the morning / the fields…"), and between a
 *     subject and its verb ("The tall farmer / watched the sky");
 *   - no phrase longer than 6 words, and no one-word scraps before a pause.
 * Later trials fade the marks: trial 1 all marks, trial 2 only the long pauses, trial 3+ none.
 */
export type PhraseMark = "" | "/" | "//";

const COORD = new Set(["and", "but", "or", "so", "yet", "nor"]);
const SUBORD = new Set(["because", "when", "while", "although", "though", "if", "after", "before", "until", "since", "unless", "whenever", "where", "which", "who", "whose", "that", "as"]);
const PREP = new Set(["in", "on", "at", "to", "with", "from", "for", "of", "by", "about", "over", "under", "through", "into", "onto", "across", "along", "near", "behind", "during", "between", "around", "without", "inside", "outside", "toward", "towards", "against", "above", "below", "beside", "past", "like"]);
const DET = new Set(["the", "a", "an", "my", "his", "her", "their", "our", "your", "its", "this", "that", "these", "those", "every", "each", "some", "many", "one", "two", "three", "all", "most", "several"]);
const AUX = new Set(["is", "are", "was", "were", "has", "have", "had", "will", "can", "could", "would", "should", "might", "must", "may", "did", "does", "do", "began", "started", "became", "seemed", "looked", "felt"]);

const bare = (w: string) => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");
const endsSentence = (w: string) => /[.!?;:]["”’)\]]*$/.test(w);
const endsShort = (w: string) => /[,—–]["”’)\]]*$|-$/.test(w);
/** a word that is probably the verb right after a subject (past tense, -s verb after a noun, or a helper verb) */
const verbLike = (w: string) => AUX.has(w) || (/ed$/.test(w) && w.length > 4);

/** The mark after each word ("" = keep going). */
export function chunkPassage(words: string[]): PhraseMark[] {
  const marks: PhraseMark[] = words.map(() => "");
  let len = 0;          // words in the current phrase
  let sentStart = 0;    // index of the first word of the sentence
  const restOfSentence = (i: number) => { let n = 0; for (let k = i + 1; k < words.length; k++) { n++; if (endsSentence(words[k]) || endsShort(words[k])) break; } return n; };
  for (let i = 0; i < words.length; i++) {
    len++;
    const w = words[i];
    if (endsSentence(w)) { marks[i] = "//"; len = 0; sentStart = i + 1; continue; }
    if (endsShort(w)) { marks[i] = "/"; len = 0; continue; }
    const next = bare(words[i + 1] ?? "");
    if (!next) continue;
    const left = restOfSentence(i);
    if (left < 2) continue;                    // never leave a one-word scrap before the pause
    let cut = false;
    if (COORD.has(next) && len >= 3) cut = true;
    else if (SUBORD.has(next) && len >= 2 && !(next === "that" && len < 4) && !(next === "as" && len < 4)) cut = true;
    else if (PREP.has(next) && len >= (next === "of" || next === "to" || next === "like" ? 4 : 3)) cut = true;
    // subject | predicate: "The tall farmer / watched…" (a phrase that began with a determiner, 2–5 words)
    else if (i - sentStart < 6 && len >= 2 && len <= 5 && DET.has(bare(words[i - len + 1])) && verbLike(next)) cut = true;
    // an opening prepositional phrase ends before the subject: "In the morning / the fields…"
    else if (len >= 3 && PREP.has(bare(words[i - len + 1])) && DET.has(next)) cut = true;
    else if (len >= 6) cut = true;             // phrases of at most 6 words
    if (cut) { marks[i] = "/"; len = 0; }
  }
  if (marks.length) marks[marks.length - 1] = "";
  return marks;
}

/** Fading: trial 1 every mark, trial 2 only the long pauses, trial 3 and later no marks. */
export function marksForTrial(marks: PhraseMark[], trial: number): PhraseMark[] {
  if (trial <= 1) return marks;
  if (trial === 2) return marks.map((m) => (m === "//" ? "//" : ""));
  return marks.map(() => "");
}

/** The phrases as text, e.g. ["The river was low", "that summer."] (for the teacher and the tests). */
export function phrases(words: string[], marks: PhraseMark[] = chunkPassage(words)): string[] {
  const out: string[] = []; let cur: string[] = [];
  words.forEach((w, i) => { cur.push(w); if (marks[i]) { out.push(cur.join(" ")); cur = []; } });
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/** The sentences of a passage (for echo reading): word ranges [from, to] inclusive. */
export function sentences(words: string[]): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = []; let from = 0;
  words.forEach((w, i) => { if (endsSentence(w) || i === words.length - 1) { out.push({ from, to: i, text: words.slice(from, i + 1).join(" ") }); from = i + 1; } });
  return out;
}
