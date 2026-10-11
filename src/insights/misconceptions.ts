/**
 * Misconceptions: WHY a student chose a wrong answer.
 *
 * Every wrong option of a question can carry a misconception code. The code is decided from the
 * option's rationale (the bank's "why this is wrong" line) and the skill family, by rules first
 * (cross-skill cues such as "apostrophe" or "not stated"), then the family's usual error. An admin can
 * change it, and the AI completion can fill it for options the rules leave empty.
 *
 * A student's answer copies the chosen option's code into QuestionAttempt.misconception, so reports can
 * say "picks a detail instead of the main idea (6 of 8 wrong answers)" instead of only "weak in Theme".
 */

export interface Misconception {
  code: string;
  label: string; // what the student tends to do (teacher wording)
  fix: string; // a short teaching move
  area: "READING" | "VOCABULARY" | "GRAMMAR" | "MECHANICS" | "WRITING";
}

export const MISCONCEPTIONS: Misconception[] = [
  { code: "DETAIL_NOT_MAIN", area: "READING", label: "Picks a detail instead of the main idea", fix: "Ask: does this answer cover the WHOLE text or only one part? Sort sentences into “main idea” and “detail”." },
  { code: "NOT_SUPPORTED", area: "READING", label: "Chooses an idea the text does not support", fix: "Ask the student to point to the exact sentence that proves the answer. No sentence, no answer." },
  { code: "CONTRADICTS_TEXT", area: "READING", label: "Chooses the opposite of what the text says", fix: "Reread the key sentence aloud and restate it in their own words before choosing." },
  { code: "EVENT_NOT_THEME", area: "READING", label: "Confuses an event or fact with the theme or lesson", fix: "Use the frame “The character learns that …” — a theme is a lesson about life, not something that happens." },
  { code: "LITERAL_MEANING", area: "READING", label: "Reads figurative language literally", fix: "Compare the words with what they really mean in the scene; draw the literal picture and laugh at it together." },
  { code: "SEQUENCE_TIME", area: "READING", label: "Mixes up the order of events", fix: "Build a quick timeline with signal words (first, then, later, before, after)." },
  { code: "CAUSE_EFFECT", area: "READING", label: "Mixes up cause and effect or problem and solution", fix: "Use “because …, so …” sentences: the cause comes after because, the effect after so." },
  { code: "CHARACTER_PERSPECTIVE", area: "READING", label: "Confuses what a character does with their trait or point of view", fix: "Ask: what does this action SHOW about the character? Name a trait and give the evidence." },
  { code: "TEXT_STRUCTURE", area: "READING", label: "Misreads the structure or features of a text, poem or play", fix: "Label the parts together (stanza, line, stage direction, heading, caption) on a short model text." },
  { code: "AUTHOR_PURPOSE", area: "READING", label: "Misjudges the author's purpose, claim or perspective", fix: "Ask: what does the author WANT the reader to think or do? Find the words that show it." },
  { code: "CONTEXT_IGNORED", area: "VOCABULARY", label: "Ignores context clues for word meaning", fix: "Cover the word, read the sentence around it and predict a meaning before looking at the choices." },
  { code: "WORD_PARTS", area: "VOCABULARY", label: "Misreads prefixes, suffixes or roots", fix: "Split the word into parts and say the meaning of each part, then put the meanings together." },
  { code: "WORD_RELATIONSHIP", area: "VOCABULARY", label: "Confuses synonyms, antonyms or shades of meaning", fix: "Place the words on a line from weakest to strongest; check same vs. opposite meaning." },
  { code: "PART_OF_SPEECH", area: "GRAMMAR", label: "Confuses parts of speech or sentence parts", fix: "Ask what job the word does in THIS sentence (names, acts, describes, tells how/where)." },
  { code: "VERB_FORM", area: "GRAMMAR", label: "Uses the wrong verb tense or verb form", fix: "Find the time words (yesterday, now, tomorrow) and match the verb; practise the irregular list aloud." },
  { code: "AGREEMENT", area: "GRAMMAR", label: "Makes subject–verb or pronoun agreement errors", fix: "Find the real subject (cross out the phrase between) and say subject + verb together." },
  { code: "PRONOUN_REFERENCE", area: "GRAMMAR", label: "Uses unclear or wrong pronouns", fix: "Draw an arrow from each pronoun to the noun it stands for; if the arrow could go two ways, rewrite." },
  { code: "SENTENCE_BOUNDARY", area: "GRAMMAR", label: "Writes fragments or run-ons; joins sentences incorrectly", fix: "Check each sentence for a subject and a verb; join two sentences with a comma + FANBOYS or a period." },
  { code: "GRAMMAR_RULE", area: "GRAMMAR", label: "Applies a grammar rule incorrectly", fix: "Say the rule in one sentence, show one right and one wrong example, then let the student explain the difference." },
  { code: "WORD_FORM", area: "GRAMMAR", label: "Uses the wrong word form (plural, comparative, negative)", fix: "Review the rule with three examples and one exception; sort words by rule." },
  { code: "APOSTROPHE", area: "MECHANICS", label: "Misuses apostrophes (possessives, contractions, plurals)", fix: "Ask: does it show ownership or a missing letter? If neither, no apostrophe." },
  { code: "COMMA_PUNCT", area: "MECHANICS", label: "Misplaces commas or punctuation", fix: "Read the sentence aloud and mark the natural pauses; review the comma rule for this pattern." },
  { code: "CAPITALIZATION", area: "MECHANICS", label: "Makes capitalization errors", fix: "Circle every proper noun and sentence start; review titles and abbreviations." },
  { code: "HOMOPHONE", area: "MECHANICS", label: "Confuses words that sound alike", fix: "Use a meaning test (their = belongs to them, there = place); write a sentence for each." },
  { code: "MECHANICS_RULE", area: "MECHANICS", label: "Applies a punctuation or capitalization rule incorrectly", fix: "Edit a short model paragraph together, naming the rule behind each fix." },
  { code: "SPELLING", area: "MECHANICS", label: "Spells words incorrectly", fix: "Practise the spelling pattern with word sorts; look-say-cover-write-check." },
  { code: "WRITING_CHOICE", area: "WRITING", label: "Makes weak writing choices (focus, evidence, organization)", fix: "Compare a strong and a weak model and name what makes the strong one clearer." },
  // Reading: two-part items (Part A answer + Part B evidence)
  { code: "EVIDENCE_MISMATCH", area: "READING", label: "Gets the answer right but picks evidence that does not prove it", fix: "Have the student say “I know ___ because the text says ___” and check: does the sentence PROVE the answer, or is it only about the same topic?" },
  // Vocabulary
  { code: "WRONG_SENSE", area: "VOCABULARY", label: "Chooses another meaning of a multiple-meaning word", fix: "List two meanings of the word, then test each one in the sentence. Only one makes sense here." },
  { code: "FALSE_SPLIT", area: "VOCABULARY", label: "Splits a word into the wrong parts (sees a prefix or suffix that is not there)", fix: "Cover the possible prefix: is what is left a real base word? If not (un + cle), the letters are not a prefix." },
  { code: "POS_MISMATCH", area: "VOCABULARY", label: "Picks a meaning that is the wrong part of speech for the sentence", fix: "Ask what job the word does in the sentence first (thing, action, describing word), then keep only meanings that do that job." },
  { code: "CONNOTATION_POLARITY", area: "VOCABULARY", label: "Mixes up the positive or negative feeling of a word", fix: "Sort word pairs (curious / nosy, thrifty / cheap) into “nice” and “not nice” and say how the feeling changes the sentence." },
  { code: "EXAMPLE_NOT_CATEGORY", area: "VOCABULARY", label: "Confuses an example with the group it belongs to", fix: "Build a quick word tree: the group on top (vehicles), examples underneath (bus, train). Ask which level the question wants." },
  // Grammar transfer from Arabic (L1 = first language)
  { code: "L1_THIRD_PERSON_S", area: "GRAMMAR", label: "Leaves off the -s on present verbs after he, she or it", fix: "Highlight he/she/it + verb in a short text; chant “he walks, she reads, it runs” and self-check every he/she/it sentence for the -s." },
  { code: "L1_MISSING_BE", area: "GRAMMAR", label: "Leaves out am, is or are (“She happy”)", fix: "Point out that English needs a verb in every sentence; practise swapping in am/is/are with I/he/they cards." },
  { code: "L1_ARTICLE", area: "GRAMMAR", label: "Uses a, an or the where English does not (or leaves them out)", fix: "Contrast pairs: “Water is important” vs “The water in this cup is cold.” Ask: is it one particular thing, any one thing, or things in general?" },
  { code: "L1_ADJ_ORDER", area: "GRAMMAR", label: "Puts the adjective after the noun or in the wrong order", fix: "In English the describing word comes before the thing: “a red car.” Build phrases with adjective and noun cards in the right order." },
  { code: "L1_PLURAL_AFTER_NUMBER", area: "GRAMMAR", label: "Keeps the noun singular after a number or “many”", fix: "Circle the number word, then check the noun: more than one needs a plural (three books, many students)." },
  { code: "L1_TENSE_PRESENT_FOR_FUTURE", area: "GRAMMAR", label: "Uses the present tense for a future action", fix: "Find the time word (tomorrow, next week) and add will or going to; compare “I go” with “I will go.”" },
  { code: "L1_PREPOSITION", area: "GRAMMAR", label: "Chooses the preposition a word-for-word translation suggests", fix: "Teach preposition chunks as whole phrases (good at, interested in, arrive at) and practise them in short sentences." },
  { code: "L1_PRESENT_PERFECT", area: "GRAMMAR", label: "Confuses the simple past and the present perfect (has/have + past participle)", fix: "Show the timeline: finished time (yesterday) = simple past; up to now (since, already, ever) = has/have + participle." },
  // Word study and pronunciation (Arabic speakers) and spelling patterns
  { code: "L1_P_B", area: "MECHANICS", label: "Mixes up p and b (Arabic has no /p/ sound)", fix: "Hold a paper strip in front of the mouth: /p/ makes it move, /b/ does not. Sort minimal pairs (pin / bin, cap / cab)." },
  { code: "L1_V_F", area: "MECHANICS", label: "Mixes up v and f (Arabic has no /v/ sound)", fix: "Feel the throat: /v/ buzzes, /f/ does not. Practise minimal pairs (fan / van, leaf / leave)." },
  { code: "L1_SHORT_VOWEL", area: "MECHANICS", label: "Leaves out or mixes up short vowels when spelling", fix: "Tap each sound of the word and write one letter group per tap; check every syllable has a vowel." },
  { code: "L1_CLUSTER", area: "MECHANICS", label: "Adds or drops a sound in consonant clusters (“sitreet”, “spling”)", fix: "Say the blend slowly, then faster, with no vowel between the consonants; build the word with letter tiles." },
  { code: "L1_SILENT_LETTER", area: "MECHANICS", label: "Leaves out silent letters or spells a word only by its sound", fix: "Keep a silent-letter word wall (knee, write, lamb, light); trace the silent letter in a different colour." },
  { code: "VOWEL_TEAM", area: "MECHANICS", label: "Picks the wrong vowel team for a long vowel sound", fix: "Sort words by vowel team (ai / ay, ee / ea, oa / ow) and notice where each team usually sits in the word." },
  { code: "R_CONTROLLED", area: "MECHANICS", label: "Mixes up r-controlled spellings (er, ir, ur, ar, or)", fix: "Sort er / ir / ur words that sound alike and learn the most common ones as a group (her, bird, turn)." },
  { code: "DOUBLING_RULE", area: "MECHANICS", label: "Does not double (or wrongly doubles) the final consonant before an ending", fix: "Check the base word: one syllable, one short vowel, one final consonant? Then double it before -ing or -ed (hop → hopping)." },
  { code: "DROP_E", area: "MECHANICS", label: "Keeps the silent e before a vowel ending (or drops it before a consonant ending)", fix: "Before an ending that starts with a vowel, drop the silent e (make → making); keep it before a consonant ending (hope → hopeful)." },
  { code: "Y_TO_I", area: "MECHANICS", label: "Forgets to change y to i before an ending (or changes it when it should not)", fix: "Consonant + y: change y to i before most endings (cry → cried); keep the y before -ing and after a vowel (play → played)." },
];

export const MISCONCEPTION_BY_CODE = new Map(MISCONCEPTIONS.map((m) => [m.code, m]));
export const misconceptionLabel = (code: string | null | undefined) => (code ? MISCONCEPTION_BY_CODE.get(code)?.label ?? code : "");

/** The usual error of each skill family (the skill code without its grade, e.g. "G4.theme" → "theme"). */
const FAMILY_DEFAULT: Record<string, string> = {
  "central-idea": "DETAIL_NOT_MAIN", summarize: "DETAIL_NOT_MAIN",
  "text-evidence": "NOT_SUPPORTED", inference: "NOT_SUPPORTED", "make-predictions": "NOT_SUPPORTED", "ask-answer-questions": "NOT_SUPPORTED", reread: "NOT_SUPPORTED", visualize: "NOT_SUPPORTED", "compare-texts": "NOT_SUPPORTED", "compare-contrast": "NOT_SUPPORTED", description: "NOT_SUPPORTED",
  theme: "EVENT_NOT_THEME", "idioms-adages": "LITERAL_MEANING",
  "figurative-language": "LITERAL_MEANING", imagery: "LITERAL_MEANING", puns: "LITERAL_MEANING",
  "plot-events": "SEQUENCE_TIME", "plot-flashback": "SEQUENCE_TIME", "plot-foreshadowing": "SEQUENCE_TIME", sequence: "SEQUENCE_TIME", "plot-setting": "SEQUENCE_TIME", "plot-conflict": "CAUSE_EFFECT",
  "cause-effect": "CAUSE_EFFECT", "problem-solution": "CAUSE_EFFECT",
  character: "CHARACTER_PERSPECTIVE", "character-perspective": "CHARACTER_PERSPECTIVE", "point-of-view": "CHARACTER_PERSPECTIVE",
  "poetry-elements": "TEXT_STRUCTURE", "drama-elements": "TEXT_STRUCTURE", "text-features": "TEXT_STRUCTURE", "sound-devices": "TEXT_STRUCTURE",
  "author-purpose": "AUTHOR_PURPOSE", "author-claim": "AUTHOR_PURPOSE", "author-perspective": "AUTHOR_PURPOSE",
  "context-clues": "CONTEXT_IGNORED", "multiple-meaning": "WRONG_SENSE", "reference-materials": "CONTEXT_IGNORED", "academic-vocabulary": "CONTEXT_IGNORED",
  prefixes: "WORD_PARTS", suffixes: "WORD_PARTS", "greek-latin-roots": "WORD_PARTS",
  "synonyms-antonyms": "WORD_RELATIONSHIP", connotation: "CONNOTATION_POLARITY", "precise-language": "WORD_RELATIONSHIP",
  nouns: "PART_OF_SPEECH", verbs: "PART_OF_SPEECH", adjectives: "PART_OF_SPEECH", adverbs: "PART_OF_SPEECH", prepositions: "PART_OF_SPEECH", "subjects-predicates": "PART_OF_SPEECH",
  "verb-tenses": "VERB_FORM", "irregular-verbs": "VERB_FORM",
  "subject-verb-agreement": "AGREEMENT", pronouns: "PRONOUN_REFERENCE",
  "fragments-run-ons": "SENTENCE_BOUNDARY", "compound-sentences": "SENTENCE_BOUNDARY", "clauses-complex": "SENTENCE_BOUNDARY", "combining-sentences": "SENTENCE_BOUNDARY", sentences: "SENTENCE_BOUNDARY",
  "plural-nouns": "WORD_FORM", comparatives: "WORD_FORM", negatives: "WORD_FORM",
  "possessive-nouns": "APOSTROPHE", "apostrophes-contractions": "APOSTROPHE",
  commas: "COMMA_PUNCT", "quotations-dialogue": "COMMA_PUNCT",
  capitalization: "CAPITALIZATION", "titles-abbreviations": "CAPITALIZATION",
  "homographs-homophones": "HOMOPHONE", "pronoun-homophones": "HOMOPHONE",
  spelling: "SPELLING",
  "writing-informative": "WRITING_CHOICE", "writing-argument": "WRITING_CHOICE", "writing-narrative": "WRITING_CHOICE", "writing-research": "WRITING_CHOICE",
};

const familiesOfArea = (area: Misconception["area"]) => new Set(Object.entries(FAMILY_DEFAULT).filter(([, c]) => MISCONCEPTION_BY_CODE.get(c)?.area === area).map(([f]) => f));
const READING = familiesOfArea("READING");
/** vocabulary strategies (idioms/figurative language count too: their cues overlap with word meaning) */
const VOCAB = new Set([...familiesOfArea("VOCABULARY"), "idioms-adages", "figurative-language", "homographs-homophones"]);

type Scope = "reading" | "vocab" | "notReading";
/**
 * Rules that hold whatever the skill (checked in order, first match wins). `scope` limits a cue to reading
 * families, vocabulary families, or everything that is not reading (grammar, mechanics, word study).
 */
const CUES: { code: string; re: RegExp; scope?: Scope }[] = [
  { code: "APOSTROPHE", re: /apostrophe|\bpossessive\b|contraction/ },
  // spelling rules and Arabic-speaker sound confusions (before the general SPELLING cue: "spelled" appears in many)
  { code: "DOUBLING_RULE", re: /\bdoubl(e|ed|es|ing)\b (the )?(final |last |ending )?(consonant|letter|["“][a-z]["”])|should (not )?be doubled|1-1-1 rule|one-one-one/ },
  { code: "DROP_E", re: /\b(drop|keep|dropped|kept|remove)s? (the )?(final |silent )?(letter )?["“]?e["”]?\b|silent e is (dropped|kept)/ },
  { code: "Y_TO_I", re: /\by to i\b|\bchange[sd]? (the )?["“]?y["”]?\b|\b["“]?y["”]? (changes|becomes) (to )?["“]?i["”]?\b/ },
  { code: "L1_P_B", re: /\b(p and b|b and p|p\/b|b\/p|p for b|b for p|p instead of b|b instead of p)\b|\/p\/ (and|or|vs\.?) \/b\/|\/b\/ (and|or|vs\.?) \/p\// },
  { code: "L1_V_F", re: /\b(v and f|f and v|v\/f|f\/v|f for v|v for f|f instead of v|v instead of f)\b|\/v\/ (and|or|vs\.?) \/f\/|\/f\/ (and|or|vs\.?) \/v\// },
  { code: "L1_SILENT_LETTER", re: /silent (letter|[kwbgthl]\b|gh)|spell(s|ed)? (it |the word )?(the way|like|as) it sounds|written the way it sounds/ },
  { code: "VOWEL_TEAM", re: /vowel (team|pair)|two vowels (go|together)|\b(ai|ay|ee|ea|oa|ie|ei|oe|ue|ew)\b (instead of|not|for|vs\.?) \b(ai|ay|ee|ea|oa|ie|ei|ow|oe|ue|ew)\b/ },
  { code: "R_CONTROLLED", re: /r-controlled|bossy r|\b(er|ir|ur|ar|or)\b (instead of|not|for|vs\.?) \b(er|ir|ur|ar|or)\b/ },
  { code: "L1_CLUSTER", re: /consonant (cluster|blend|group)|\bcluster\b|extra vowel (between|before|in)|\bblend\b/, scope: "notReading" },
  { code: "L1_SHORT_VOWEL", re: /short vowel|(missing|left out|leaves out|no) (a |the )?vowel|vowel (is )?missing|wrong vowel/, scope: "notReading" },
  { code: "SPELLING", re: /misspell|not a word|spelled|spelling/ },
  { code: "CAPITALIZATION", re: /capitali[sz]e|capital letter|lowercase/ },
  { code: "L1_SILENT_LETTER", re: /sounds? like it is spelled/ },
  { code: "HOMOPHONE", re: /homophone|sounds? (the same|like)/ },
  // grammar transfer from Arabic
  { code: "L1_THIRD_PERSON_S", re: /third[- ]person (singular )?(-s|s ending|verb)|\bhe\/she\/it\b|(-s|\bs) ending|(needs|takes|missing|without|add) (an |the )?["“]?-?s["”]? (on|at the end of) the verb|\b(he|she|it) (needs|takes) .{0,25}-s\b/, scope: "notReading" },
  { code: "L1_MISSING_BE", re: /missing (the )?(verb |word )?["“](is|am|are|was|were)["”]|leaves? out ["“]?(is|am|are)["”]?|\bno ["“](is|am|are)["”]|needs? (a |the )?(linking verb|verb ["“](is|am|are)["”]|["“](is|am|are)["”])/, scope: "notReading" },
  { code: "L1_ARTICLE", re: /\b(wrong|missing|extra|unneeded|no|needs an?|uses an?) article\b|\b(missing|extra|wrong|unneeded|no) ["“](a|an|the)["”]|does not need ["“]?(a|an|the)["”]? (before|here|with)|needs ["“]?(a|an|the)["”]? (before|here)/, scope: "notReading" },
  { code: "L1_ADJ_ORDER", re: /adjective (order|comes|goes|must come|should come|is placed) ?(before|after)?|order of (the )?adjectives|after the noun/, scope: "notReading" },
  { code: "L1_PLURAL_AFTER_NUMBER", re: /(after|with) (a number|numbers|many|several|both|few|\d+|two|three|four|five|ten)\b.{0,40}\bplural|plural.{0,30}(after|with) (a number|numbers|many|several|\d+)|singular (noun )?after (a number|many|several|\d+)/, scope: "notReading" },
  { code: "L1_TENSE_PRESENT_FOR_FUTURE", re: /present tense (for|instead of|about) (a |the )?future|(future|tomorrow|next (week|year|month|day)).{0,40}(needs|takes|use) ["“]?(will|going to)["”]?|missing ["“]?will["”]?/, scope: "notReading" },
  { code: "L1_PRESENT_PERFECT", re: /present perfect|\b(has|have) \+|needs ["“]?(has|have)["”]?|simple past (instead of|for) /, scope: "notReading" },
  { code: "L1_PREPOSITION", re: /wrong preposition|preposition (does not|doesn't) (fit|go)|we say ["“]?(good|interested|arrive|depend|listen|afraid|married|angry)\b|word[- ]for[- ]word translation/, scope: "notReading" },
  // two-part items: the evidence does not prove the (correct) answer
  { code: "EVIDENCE_MISMATCH", re: /evidence (does not|doesn't|that does not) (support|prove|match)|does not prove (the|your|this) (answer|claim|idea)|not the (best )?evidence for|(about|on) the same topic but (does not|doesn't) (prove|support)|part a answer/, scope: "reading" },
  // vocabulary
  { code: "WRONG_SENSE", re: /\b(another|other|a different|the wrong) (meaning|sense) of (the word|this word|it)\b|not the meaning (used )?(here|in this sentence)|meaning (that )?(does not|doesn't) fit (here|this sentence|the sentence)|meaning used in (a )?(different|another) (sentence|context)/, scope: "vocab" },
  { code: "FALSE_SPLIT", re: /not a (real )?(prefix|suffix|root)( here)?|(is|are) part of the (base|root) word|wrong (word )?parts?|split (the word )?(wrong|incorrectly)|is not a base word/, scope: "vocab" },
  { code: "POS_MISMATCH", re: /(wrong|different) part of speech|(is|as) an? (noun|verb|adjective|adverb) (here|in this sentence)|(used|uses \w+) as an? (noun|verb|adjective|adverb)|(names a thing|an action), not an? (action|thing|describing word)/, scope: "vocab" },
  { code: "CONNOTATION_POLARITY", re: /(positive|negative|nice|unkind|neutral) (feeling|connotation|meaning|tone)|connotation|too (positive|negative)|sounds? (kind|mean|harsh|rude|nice)/, scope: "vocab" },
  { code: "EXAMPLE_NOT_CATEGORY", re: /\b(only )?an example of\b|is one (kind|type|example) of|not the (whole )?(group|category)|is a category|names? the (group|category)/, scope: "vocab" },
  { code: "LITERAL_MEANING", re: /literal|exactly what the words say|word[- ]for[- ]word|takes? (it|the words?|the phrase) (literally|at face value)/, scope: "vocab" },
  // reading
  { code: "DETAIL_NOT_MAIN", re: /\b(small |minor |one |a |supporting )?detail\b|one example|only (one|part)|too narrow|just one part/, scope: "reading" },
  { code: "LITERAL_MEANING", re: /literal|exactly what the words say|word[- ]for[- ]word/, scope: "reading" },
  { code: "EVENT_NOT_THEME", re: /misses the lesson|not a (message|lesson|theme)|a fact about/, scope: "reading" },
  { code: "CAUSE_EFFECT", re: /\b(an? )?(cause|effect|result) of\b|is the (cause|effect|problem|solution)/, scope: "reading" },
  { code: "SEQUENCE_TIME", re: /comes (after|before)|happens (after|before)|later in|earlier|returns to the present|turning point|flashback/, scope: "reading" },
  { code: "NOT_SUPPORTED", re: /not (stated|mentioned|discussed|in the text|supported|the focus)|nothing (suggests|in the text)|no evidence|does not say|never says|is not described/, scope: "reading" },
  { code: "CONTRADICTS_TEXT", re: /\bthe (text|author|passage|story) (says|describes|shows|praises|explains)/, scope: "reading" },
];

/** The usual error of a skill category, when the family is not known (e.g. Curriculum Map skills). */
const CATEGORY_DEFAULT: Record<string, string> = {
  LITERATURE: "NOT_SUPPORTED", INFORMATIONAL: "NOT_SUPPORTED", COMPREHENSION: "NOT_SUPPORTED",
  VOCABULARY: "CONTEXT_IGNORED", WORD_STUDY: "WORD_PARTS", GRAMMAR: "GRAMMAR_RULE", MECHANICS: "MECHANICS_RULE",
  PHONICS_WORD_STUDY: "SPELLING", WRITING: "WRITING_CHOICE",
};

/**
 * The misconception of one WRONG option.
 * @param family   skill family code ("theme") — a full skill code ("G4.theme") is accepted too
 * @param rationale the option's "why this is wrong" line (may be empty)
 */
export function classifyMisconception(family: string, rationale: string | null | undefined, opts: { familyCode?: string; category?: string } = {}): string | null {
  const own = family.includes(".") ? family.slice(family.indexOf(".") + 1) : family;
  const fam = FAMILY_DEFAULT[own] || !opts.familyCode ? own : opts.familyCode;
  const text = String(rationale ?? "").toLowerCase();
  const reading = READING.has(fam) || (!FAMILY_DEFAULT[fam] && ["LITERATURE", "INFORMATIONAL", "COMPREHENSION"].includes(opts.category ?? ""));
  const vocab = VOCAB.has(fam) || (!FAMILY_DEFAULT[fam] && ["VOCABULARY", "WORD_STUDY"].includes(opts.category ?? ""));
  const inScope = (sc?: Scope) => !sc || (sc === "reading" ? reading : sc === "vocab" ? vocab : !reading);
  if (text) for (const c of CUES) if (inScope(c.scope) && c.re.test(text)) return c.code;
  return FAMILY_DEFAULT[fam] ?? (opts.category ? CATEGORY_DEFAULT[opts.category] ?? null : null);
}

/** The misconception of the answer a student gave (null when correct or not an option type). */
export function chosenMisconception(type: string, options: { label: string; correct: boolean; misconception?: string | null }[] | undefined, response: unknown): string | null {
  if (!options) return null;
  if (type === "MULTIPLE_CHOICE" || type === "DROPDOWN") {
    const o = options.find((x) => x.label === response);
    return o && !o.correct ? o.misconception ?? null : null;
  }
  if (type === "MULTI_SELECT" && Array.isArray(response)) {
    const wrong = options.find((x) => !x.correct && (response as unknown[]).includes(x.label) && x.misconception);
    return wrong?.misconception ?? null;
  }
  return null;
}
