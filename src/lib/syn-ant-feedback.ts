/**
 * Synonym/antonym error-pattern feedback (NAFS vocabulary practice, shown after the student answers — never
 * during a test). Pure function: no database, no i18n — the caller (src/server/nafs/practice.ts) decides when to
 * call it and how to show the result.
 *
 * SCOPE, deliberately narrow — read this before extending it:
 *
 * Step 1, "is this a synonym/antonym question at all?" We only answer yes when we have STRUCTURED evidence:
 *   - the question's NAFS target code is exactly "NAFS.V.SYNANT" — the one NAFS skill this platform already tags
 *     for "a word with the same or the opposite meaning, as used in the text" (see src/server/nafs/framework.ts,
 *     NAFS_SKILLS). This is the reliable path: it is how the platform itself classifies the question, not a guess.
 *   - OR, when no NAFS target is available (outside NAFS practice), the question's own stem literally contains the
 *     word "synonym" or "antonym". This is the honest fallback the task asked for when structured data is absent.
 * We deliberately do NOT try to detect a synonym/antonym question from loose wording alone (e.g. the mere presence
 * of "opposite") without one of the two signals above — a grammar or comprehension question could use that word
 * for an unrelated reason, and guessing would be exactly the false-confidence NLP behaviour we were told to avoid.
 *
 * Step 2, "which relationship is this question asking for?" Once step 1 says yes, we still need to word the hint
 * correctly (synonym = same meaning, or antonym = opposite meaning). For THIS narrower question we do use a wider
 * set of cues, because this platform's own authored stems consistently use this phrasing — confirmed by reading
 * the real seeded content (data/questions/src/grade4.py, grade4_topup.py, grade5.py, grade5_topup.py, grade6.py,
 * grade6_topup.py, extremes.py, and the NAFS model booklets under data/nafs/booklets/*.json): "Which word is a
 * synonym for X?", "Which word is an antonym for X?", "Which word means the opposite of X?", "Which word is
 * closest in meaning to X?". If the stem matches both cue sets, or neither, we say nothing rather than guess.
 *
 * Step 3, "can we name the SPECIFIC mistake?" The most useful hint names what the student actually did wrong
 * ("you picked a word with the opposite meaning"). We only say that when the wrong OPTION THE STUDENT CHOSE has
 * its own authored rationale confirming it — every wrong option in this question bank is required to carry one
 * (data/questions/src/qb.py's build step refuses to publish a distractor without a rationale), and in the
 * synonyms-antonyms family that rationale is reliably worded ("This is an antonym.", "This is a synonym.", "This
 * is close in meaning.", "Warm is close to hot.") — see data/questions/src/grade4.py, grade4_topup.py,
 * grade5_topup.py, extremes.py for real examples. When the chosen option has no rationale, or its rationale says
 * nothing about synonym/antonym/opposite/closeness, we fall back to a generic (but still honest and specific-to-
 * the-relationship) reminder instead of inventing a diagnosis the data does not support.
 *
 * LIMITATION we are flagging explicitly: step 3's confirmation reads free-text rationale with keyword matching,
 * not a structured tag — it is a best-effort corroboration, not a certainty. It only ever makes the message MORE
 * specific when it fires; when it doesn't, the generic (step 2) message is still correct and still useful.
 */

export type SynAntRelation = "SYNONYM" | "ANTONYM";

export interface SynAntInput {
  /** The NAFS target code the student was practising, e.g. "NAFS.V.SYNANT" (NafsPracticeAnswer.target / the
   *  current run target). Pass null/undefined when there is none (outside NAFS practice). */
  nafsTarget?: string | null;
  /** The question's stem text. */
  stem: string;
  /** Whether the student's answer was correct. Callers should generally only call this function when false, but
   *  it is checked here too so a mistaken call never produces a hint for a right answer. */
  correct: boolean;
  /** The authored rationale of the WRONG option the student picked (QuestionOption.rationale), if any. */
  chosenRationale?: string | null;
}

export interface SynAntHint {
  relation: SynAntRelation;
  /** true when the message names the specific mistake (corroborated by the chosen option's own rationale);
   *  false when it is the generic, relationship-only reminder. */
  specific: boolean;
  message: string;
}

const SYN_ANT_NAFS_TARGET = "NAFS.V.SYNANT";
/** Step 1 fallback: the stem itself names the concept. */
const EXPLICIT_WORD_RE = /\b(synonym|antonym)s?\b/i;
/** Step 2: which relationship the stem is asking for (wider — only used once step 1 already said yes). */
const ANTONYM_CUE_RE = /\bantonyms?\b|\bopposite(?:s)?\b/i;
const SYNONYM_CUE_RE = /\bsynonyms?\b|\bclosest in meaning\b|\bsame meaning\b|\bsimilar(?:ly)? in meaning\b|\bbest synonym\b/i;
/** Step 3: does the chosen (wrong) option's own rationale admit it leans the OTHER way? */
const RATIONALE_SYNONYM_CUE_RE = /\bsynonym\b|\bclose(?:st)? in meaning\b|\bsimilar meaning\b|\bsame meaning\b|\balmost the same\b|\bclose to\b/i;
const RATIONALE_ANTONYM_CUE_RE = /\bantonym\b|\bopposite\b/i;

/**
 * Returns a feedback hint, or null when the question is not confidently a synonym/antonym item, when the asked
 * relationship itself is ambiguous, or when the answer was correct.
 */
export function synAntFeedback(input: SynAntInput): SynAntHint | null {
  if (input.correct) return null;
  const stem = String(input.stem ?? "");
  const isSynAnt = input.nafsTarget === SYN_ANT_NAFS_TARGET || EXPLICIT_WORD_RE.test(stem);
  if (!isSynAnt) return null;
  const asksAntonym = ANTONYM_CUE_RE.test(stem);
  const asksSynonym = SYNONYM_CUE_RE.test(stem);
  if (asksAntonym === asksSynonym) return null; // both or neither matched: ambiguous — say nothing rather than guess
  const relation: SynAntRelation = asksAntonym ? "ANTONYM" : "SYNONYM";
  const rationale = String(input.chosenRationale ?? "");
  const confirmedOther = relation === "ANTONYM" ? RATIONALE_SYNONYM_CUE_RE.test(rationale) : RATIONALE_ANTONYM_CUE_RE.test(rationale);
  if (confirmedOther) {
    return {
      relation, specific: true,
      message: relation === "ANTONYM"
        ? "You picked a word with a similar meaning — but this question asks for an antonym (the opposite meaning), not a synonym (the same meaning)."
        : "You picked a word with the opposite meaning — check whether the question asks for a synonym (same meaning) or an antonym (opposite meaning).",
    };
  }
  return {
    relation, specific: false,
    message: relation === "ANTONYM"
      ? "This question asks for an antonym — a word with the OPPOSITE meaning. Re-read the key word and look for its opposite, not a word that means close to the same thing."
      : "This question asks for a synonym — a word with a meaning close to the SAME thing. Re-read the key word and look for one that means almost the same, not its opposite.",
  };
}
