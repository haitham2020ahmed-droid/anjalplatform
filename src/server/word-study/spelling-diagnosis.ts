/**
 * ✍️ Which spelling pattern a typed word missed (DICTATION items and word-study feedback).
 *
 * Pure: compares the target word with what the student typed. The common start and end are removed, and the
 * part that differs is read in its context (the letters around it and the ending after it):
 *
 *   carried / carryed   → Y_TO_I            hopping / hoping   → DOUBLING_RULE    making / makeing → DROP_E
 *   knee / nee          → L1_SILENT_LETTER   rain / rane        → VOWEL_TEAM       bird / burd      → R_CONTROLLED
 *   pet / bet           → L1_P_B             van / fan          → L1_V_F           lid / led        → L1_SHORT_VOWEL
 *   street / sitreet    → L1_CLUSTER         jumped / jumpt     → SPELLING (suffix) anything else    → SPELLING
 *
 * Every code exists in src/insights/misconceptions.ts.
 */

export type SpellingPattern = "y-to-i" | "doubling" | "drop-e" | "silent-e" | "silent-letter" | "p-b" | "v-f" | "r-controlled" | "vowel-team" | "short-vowel" | "cluster" | "suffix" | "other";

export interface SpellingDiagnosis {
  /** misconception code (src/insights/misconceptions.ts) */
  code: string;
  pattern: SpellingPattern;
  /** a short, student-friendly line naming the pattern (never the whole word) */
  message: string;
}

const VOWELS = "aeiou";
const isVowel = (c: string | undefined) => !!c && VOWELS.includes(c);
const isConsonant = (c: string | undefined) => !!c && /[a-z]/.test(c) && !VOWELS.includes(c);
/** endings that start with a vowel (doubling, drop e, y → i apply before them) */
const VOWEL_ENDING = /^(ing|ed|er|ers|est|en|y|ish|able|ible|ous|ance|ence|ion|ive|al|ies|ied|ier|iest)$/;
/** any common ending (inflections and suffixes) */
const ANY_ENDING = /^(s|es|ing|ed|er|ers|est|en|y|ly|ful|ness|less|ment|ish|able|ible|ous|ion|tion|sion|ive|al|ity|ty|ies|ied|ier|iest|ily|iness|iful)$/;
/** endings whose spelling is fixed (careful, not carefull; jumped, not jumpt; nation, not nashun) */
const SUFFIXES = ["ness", "less", "ment", "tion", "sion", "able", "ible", "ful", "ous", "ing", "est", "ly", "ed", "er", "es"];
const VOWEL_TEAMS = ["eigh", "igh", "ai", "ay", "ee", "ea", "oa", "oe", "ow", "ou", "oi", "oy", "oo", "ie", "ei", "ue", "ew", "au", "aw", "ui"];
const R_TEAMS = ["ear", "our", "air", "are", "ere", "ar", "er", "ir", "or", "ur"];

const MESSAGES: Record<SpellingPattern, string> = {
  "y-to-i": "Look at the y: after a consonant, y changes to i before most endings (but stays before -ing).",
  doubling: "Check the ending: one syllable, one short vowel, one last consonant → double that consonant before -ing, -ed, -er, -est.",
  "drop-e": "Check the silent e: drop it before an ending that starts with a vowel; keep it before an ending that starts with a consonant.",
  "silent-e": "Listen for the long vowel: this word needs a silent e at the end.",
  "silent-letter": "This word has a letter you do not hear (a silent letter). Picture the word and find it.",
  "p-b": "Listen again for /p/ (a puff of air) and /b/ (a buzz in the throat).",
  "v-f": "Listen again for /v/ (the throat buzzes) and /f/ (no buzz).",
  "r-controlled": "Check the vowel + r part (ar, or, er, ir, ur): which spelling does this word use?",
  "vowel-team": "Check the vowel team: which two letters spell this vowel sound in this word?",
  "short-vowel": "Tap each sound: one short vowel sound is missing or spelled with the wrong letter.",
  cluster: "Say the consonant blend slowly: every consonant is written, with no extra vowel between them.",
  suffix: "Check the ending (suffix): spell it the same way every time, even when it sounds different.",
  other: "Compare your spelling with the word letter by letter, then try it again.",
};
const CODES: Record<SpellingPattern, string> = {
  "y-to-i": "Y_TO_I", doubling: "DOUBLING_RULE", "drop-e": "DROP_E", "silent-e": "L1_SILENT_LETTER", "silent-letter": "L1_SILENT_LETTER",
  "p-b": "L1_P_B", "v-f": "L1_V_F", "r-controlled": "R_CONTROLLED", "vowel-team": "VOWEL_TEAM", "short-vowel": "L1_SHORT_VOWEL",
  cluster: "L1_CLUSTER", suffix: "SPELLING", other: "SPELLING",
};
const out = (pattern: SpellingPattern): SpellingDiagnosis => ({ code: CODES[pattern], pattern, message: MESSAGES[pattern] });

const clean = (s: string) => s.trim().toLowerCase().replace(/’/g, "'");

/** Spans [start, end) of the given letter groups in the word (longest first, no overlaps). */
function spans(word: string, groups: string[]): [number, number][] {
  const res: [number, number][] = [];
  const taken = new Array(word.length).fill(false);
  for (const g of [...groups].sort((a, b) => b.length - a.length)) {
    for (let i = word.indexOf(g); i >= 0; i = word.indexOf(g, i + 1)) {
      if (taken.slice(i, i + g.length).some(Boolean)) continue;
      res.push([i, i + g.length]);
      for (let k = i; k < i + g.length; k++) taken[k] = true;
    }
  }
  return res;
}
/** Does the letter group [a0, a1) touch the changed part [from, to) of the word? (an insertion touches both neighbours) */
const overlaps = (a: [number, number], from: number, to: number) => {
  const lo = to > from ? from : from - 1, hi = to > from ? to : from + 1;
  return a[0] < hi && a[1] > lo;
};

/** The pattern the student missed, or null when the spelling is right (case and outer spaces ignored). */
export function diagnoseSpelling(target: string, typed: string): SpellingDiagnosis | null {
  const t = clean(target), s = clean(typed);
  if (t === s) return null;
  if (!s) return out("other");
  let i = 0;
  while (i < t.length && i < s.length && t[i] === s[i]) i++;
  let j = 0;
  while (j < t.length - i && j < s.length - i && t[t.length - 1 - j] === s[s.length - 1 - j]) j++;
  const tMid = t.slice(i, t.length - j), sMid = s.slice(i, s.length - j);
  const after = t.slice(t.length - j); // the target's letters after the difference
  const prev = t[i - 1], next = t[t.length - j];

  // y → i: carried / carryed, cries / crys, happily / happyly — and the reverse (played / plaied)
  const beforeEnding = ANY_ENDING.test(after) || SUFFIXES.includes(after) || after === "d";
  if (beforeEnding && ((/^(i|ie)$/.test(tMid) && /^(y|ye|ey)$/.test(sMid)) || (/^(y|ye)$/.test(tMid) && /^(i|ie)$/.test(sMid)))) return out("y-to-i");
  // doubling: hopping / hoping (not doubled), or hoping / hopping (doubled by mistake), before a vowel ending
  const endsLikeSuffix = (rest: string) => VOWEL_ENDING.test(rest);
  if (tMid.length === 1 && sMid === "" && isConsonant(tMid) && prev === tMid && endsLikeSuffix(after)) return out("doubling");
  if (sMid.length === 1 && tMid === "" && isConsonant(sMid) && s[i - 1] === sMid && endsLikeSuffix(after)) return out("doubling");
  // a double letter written single (or a single one doubled) inside the word, not before an ending: plain spelling
  if ((tMid.length === 1 && sMid === "" && prev === tMid) || (sMid.length === 1 && tMid === "" && s[i - 1] === sMid && isConsonant(sMid))) return out("other");
  // drop e: making / makeing (kept before a vowel ending), hopeful / hopful (dropped before a consonant ending)
  if (tMid === "" && sMid === "e" && after && endsLikeSuffix(after)) return out("drop-e");
  if (tMid === "e" && sMid === "" && after && ANY_ENDING.test(after) && !endsLikeSuffix(after) && isConsonant(prev)) return out("drop-e");
  // silent e of a long-vowel word: cake / cak, flute / flut
  if (tMid === "e" && sMid === "" && after === "" && isConsonant(prev) && isVowel(t[i - 2])) return out("silent-e");
  // silent letters: knee/nee, write/rite, lamb/lam, light/lite, calm/cam, listen/lisen, gnaw/naw, hour/our, rhyme/ryme
  if (sMid.length < tMid.length && /gh/.test(tMid) && !/gh/.test(sMid)) return out("silent-letter");
  if (tMid.length === 1 && sMid === "") {
    const c = tMid;
    if ((c === "k" && next === "n") || (c === "g" && next === "n") || (c === "w" && next === "r") || (c === "b" && prev === "m") || (c === "l" && "kmf".includes(next ?? "-") && "aou".includes(prev ?? "-"))
      || (c === "t" && prev === "s" && next === "e") || (c === "h" && (prev === "w" || prev === "r" || prev === "g" || i === 0)) || (c === "n" && prev === "m" && after === "")) return out("silent-letter");
  }
  // sound swaps that Arabic speakers make: p/b and v/f
  const pair = (a: string, b: string) => (tMid === a && sMid === b) || (tMid === b && sMid === a) || (tMid === a + a && sMid === b + b) || (tMid === b + b && sMid === a + a);
  if (pair("p", "b")) return out("p-b");
  if (pair("v", "f")) return out("v-f");
  const from = i, to = t.length - j;
  // vowel + r (checked before vowel teams: "ear" contains "ea")
  // (a vowel + r is r-controlled only when no vowel follows the r: “bird”, “storm”, but not “se-pa-rate”)
  const rSpans = spans(t, R_TEAMS).filter((sp) => t[sp[1] - 1] === "e" || !isVowel(t[sp[1]]));
  if (rSpans.some((sp) => overlaps(sp, from, to)) && (/r/.test(t.slice(Math.max(0, from - 1), to + 1)))) {
    if (/[aeiou]/.test(tMid + sMid) || /r/.test(tMid + sMid)) return out("r-controlled");
  }
  // vowel teams and variant vowels (ai/ay, ee/ea, oa/ow, ou/ow, oi/oy, au/aw, oo, ew/ue, igh)
  if (spans(t, VOWEL_TEAMS).some((sp) => overlaps(sp, from, to))) return out("vowel-team");
  // a vowel team typed where the word has a single vowel (rane for ran is not this; ruun for run is)
  if (tMid.length <= 1 && isVowel(tMid || prev) && VOWEL_TEAMS.some((v) => s.slice(Math.max(0, from - 1), from + sMid.length + 1).includes(v)) && sMid.length >= 1 && [...sMid].every(isVowel)) return out("vowel-team");
  // short vowels: one vowel swapped or left out (lid / led, pocket / pockt)
  if ((tMid.length === 1 && isVowel(tMid) && (sMid === "" || (sMid.length === 1 && isVowel(sMid))))) return out("short-vowel");
  // consonant clusters: a consonant dropped next to another consonant, or a vowel added between two (sitreet)
  if (tMid.length === 1 && isConsonant(tMid) && sMid === "" && (isConsonant(prev) || isConsonant(next)) && !(tMid === "c" && next === "k")) return out("cluster");
  if (tMid === "" && sMid.length === 1 && isVowel(sMid) && isConsonant(prev) && isConsonant(next)) return out("cluster");
  // the ending itself: jumped / jumpt, nation / nashun, careful / carefull
  const suffix = SUFFIXES.find((e) => t.endsWith(e) && t.length > e.length + 1 && to >= t.length - e.length && from >= t.length - e.length - 1);
  if (suffix) return out("suffix");
  return out("other");
}
