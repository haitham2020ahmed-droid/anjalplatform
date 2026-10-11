/**
 * 🧑‍🏫 The tutor's words after a wrong answer (pure, no AI, no database).
 *
 * Built from what the platform knows: the misconception of the option the student chose, the student's level on the
 * skill, how often they made this mistake lately, the question's own rationale and tip. Rules:
 *   1. name the mistake (not "Wrong answer"): what the chosen option did, in the student's terms
 *   2. guide before telling: a guiding question and a hint; the correct answer is shown only when the student asks
 *   3. adjust to the level: short, plain sentences for Below Level; a stretch question for Above Level
 *   4. never contain the correct option's words (checked by tutorLeaksAnswer)
 */
import { passageBlocks } from "../lib/passage";

export type Band = "BELOW" | "ON" | "ABOVE";

export interface TutorInput {
  misconception: string | null;
  band: Band;
  repeated: number;            // wrong answers with this misconception in the last 30 days (including this one)
  rationale: string | null;    // the bank's "why this option is wrong"
  tip: string | null;
  hint: string | null;
  hasPassage: boolean;
  correctTexts: string[];      // only to make sure the tutor never gives them away
}

export interface TutorMessage { message: string; guidingQuestion: string; hint: string; example: string; strategy: string; repeated: number; misconception: string | null }

interface Template { message: string; simple: string; question: string; example: string; stretch: string }

const T: Record<string, Template> = {
  DETAIL_NOT_MAIN: { message: "You chose a supporting detail, but the question asks for the main idea — the big message of the whole text.", simple: "Your answer is one small part. The question wants the BIG idea.", question: "Which choice could be a title for the WHOLE text, not just one part of it?", example: "In a text about bees, “bees dance to show where flowers are” is a detail; “bees work together to survive” is the main idea.", stretch: "Can you say the main idea in 10 words or fewer?" },
  NOT_SUPPORTED: { message: "Your answer sounds reasonable, but the text does not say it or show it.", simple: "The text does not say that. Look for proof.", question: "Can you point to the sentence in the text that proves your answer? If you can't find one, which choice CAN you prove?", example: "If a story says “Sara put on her coat and gloves,” we can prove it is cold. We cannot prove that Sara is going to school.", stretch: "Which two sentences together give the strongest proof?" },
  CONTRADICTS_TEXT: { message: "The text actually says something different from the choice you picked.", simple: "The text says the opposite. Read that part again.", question: "Read the key sentence again slowly. What does it really say, in your own words?", example: "If the text says “the river was calm,” a choice that says “the river was rough” goes against the text.", stretch: "Which exact words in the text rule out your first choice?" },
  EVENT_NOT_THEME: { message: "You chose something that happens in the story, but a theme is the lesson the story teaches about life.", simple: "That is an event. A theme is a lesson.", question: "Finish this sentence: “The character learns that …” Which choice fits?", example: "Event: “Omar fixes the kite with his grandmother.” Theme: “Patience and help from others can fix what is broken.”", stretch: "Could this lesson apply to a different story too? That is how you know it is a theme." },
  LITERAL_MEANING: { message: "You read the words exactly as they are, but the writer is using figurative language — the words mean something more.", simple: "The words do not mean exactly what they say here.", question: "Imagine the words happening for real. Does that make sense? What is the writer really trying to show?", example: "“It's raining cats and dogs” does not mean animals fall from the sky — it means it is raining very hard.", stretch: "Why did the author choose this comparison instead of saying it plainly?" },
  SEQUENCE_TIME: { message: "The order of events got mixed up.", simple: "Check what happened first and what happened next.", question: "Find the signal words (first, then, later, before, after). What happens right before and right after this part?", example: "“After lunch, Maya read. Before lunch, she played.” — Maya played first, then ate, then read.", stretch: "How would the story change if these two events swapped places?" },
  CAUSE_EFFECT: { message: "The cause and the effect are mixed up — what made it happen and what happened as a result.", simple: "Ask: what made it happen? What happened because of it?", question: "Try the sentence “Because ___, ___.” Which choice fits the first blank?", example: "“Because it rained, the game was cancelled.” Rain is the cause; the cancelled game is the effect.", stretch: "Is there more than one cause? Which one does the text say is most important?" },
  CHARACTER_PERSPECTIVE: { message: "You described what the character did, but the question asks what that shows about them (a trait or point of view).", simple: "What does the action SHOW about the character?", question: "What kind of person would do this? Which choice names that quality?", example: "Action: “Ali shared his lunch with a new student.” Trait: kind.", stretch: "Find a second action that shows the same trait." },
  TEXT_STRUCTURE: { message: "Look again at how the text is built — its parts and features.", simple: "Look at the parts of the text.", question: "Which part of the text (heading, stanza, stage direction, caption) does the question ask about?", example: "A poem is made of lines grouped into stanzas; a play has stage directions in brackets.", stretch: "Why did the author organize it this way?" },
  AUTHOR_PURPOSE: { message: "Think about what the author WANTS the reader to think or do.", simple: "Why did the author write this?", question: "Is the author trying to inform you, persuade you, or entertain you? Which words show it?", example: "“Everyone should plant a garden!” — the author wants to persuade.", stretch: "How would the text change if the purpose were different?" },
  CONTEXT_IGNORED: { message: "The sentences around the word give clues to its meaning — use them.", simple: "Read the sentence around the word. It gives clues.", question: "Cover the word and read the sentence. What word would make sense there?", example: "“The ancient castle was over 800 years old.” — “800 years old” is the clue that ancient means very old.", stretch: "Which clue word helped you most, and what kind of clue is it (example, opposite, definition)?" },
  WORD_PARTS: { message: "Break the word into its parts — the prefix, the root and the suffix each add meaning.", simple: "Split the word into parts.", question: "What does each part mean? Put the meanings together.", example: "un + happy = not happy; re + read = read again; help + ful = full of help.", stretch: "Find another word with the same part and check that the meaning fits." },
  WORD_RELATIONSHIP: { message: "These words are close in meaning, but they are not the same.", simple: "These words are close, but not the same.", question: "Which word is stronger, and which is weaker? Which fits the sentence exactly?", example: "warm → hot → boiling: all about heat, but each is stronger.", stretch: "Write a sentence where only one of the words fits." },
  PART_OF_SPEECH: { message: "Think about the job the word does in THIS sentence.", simple: "What job does the word do?", question: "Does it name something, show an action, describe, or tell how or where?", example: "“Run” is a verb in “I run fast” but a noun in “I went for a run.”", stretch: "Can the same word do a different job in another sentence?" },
  VERB_FORM: { message: "The verb does not match the time of the sentence.", simple: "Check WHEN it happens.", question: "Find the time words (yesterday, now, tomorrow). Which verb form matches?", example: "Yesterday I walked. Now I walk. Tomorrow I will walk.", stretch: "Which verbs are irregular here (like go → went)?" },
  AGREEMENT: { message: "The subject and the verb (or pronoun) do not agree.", simple: "One or many? The verb must match.", question: "Find the real subject. Is it one or more than one? Say subject + verb together.", example: "The dog runs. The dogs run. The box of toys IS heavy.", stretch: "Why is “of toys” a trap in “The box of toys is heavy”?" },
  PRONOUN_REFERENCE: { message: "The pronoun does not clearly point to the right noun.", simple: "Who does the pronoun mean?", question: "Draw an arrow from the pronoun to the noun it stands for. Could it point to two people?", example: "“Sara told Mona she won.” Who won? Better: “Sara told Mona, ‘I won.’”", stretch: "Rewrite the sentence so only one meaning is possible." },
  SENTENCE_BOUNDARY: { message: "Check where each sentence starts and ends.", simple: "Is it a full sentence?", question: "Does it have a subject and a verb and a complete thought? Are two sentences stuck together?", example: "Fragment: “Because I was tired.” Run-on: “I was tired I went home.” Fixed: “I was tired, so I went home.”", stretch: "Fix it in two different ways." },
  GRAMMAR_RULE: { message: "A grammar rule is being used in the wrong place.", simple: "Check the rule.", question: "What rule does this sentence need? Say it in one sentence, then check each choice.", example: "Rule: use “a” before a consonant sound and “an” before a vowel sound — a cat, an apple.", stretch: "Find the exception to the rule." },
  WORD_FORM: { message: "The word needs a different form here (plural, comparison or negative).", simple: "Change the word's form.", question: "Does the sentence need more than one, a comparison, or a ‘not’? Which form fits?", example: "one child → two children; tall → taller → tallest.", stretch: "Which form is irregular here?" },
  APOSTROPHE: { message: "Check the apostrophe: it shows ownership or a missing letter — not just “more than one”.", simple: "Does it own something or is a letter missing?", question: "Does the word show that something belongs to someone, or that a letter is missing? If neither, no apostrophe.", example: "the dog's bone (belongs) · don't = do not (missing letter) · two dogs (no apostrophe)", stretch: "Where does the apostrophe go when many people own something?" },
  COMMA_PUNCT: { message: "Look again at the punctuation.", simple: "Read it aloud and listen for the pause.", question: "Read the sentence aloud. Where do you naturally pause? Which rule fits that spot?", example: "I bought apples, bananas, and grapes. · “Come here,” said Mom.", stretch: "Which comma rule is used here?" },
  MECHANICS_RULE: { message: "A punctuation or capital-letter rule is being used in the wrong place.", simple: "Check capitals and punctuation.", question: "Which rule does this spot need? Check each choice against it.", example: "Names, places and the first word of a sentence start with a capital letter.", stretch: "Edit one more sentence using the same rule." },
  CAPITALIZATION: { message: "Check which words need a capital letter.", simple: "Names and sentence starts get capitals.", question: "Is it a name, a place, a day, a title, or the first word of the sentence?", example: "On Monday, Huda visited Riyadh.", stretch: "Which words in a title stay lowercase?" },
  HOMOPHONE: { message: "These words sound the same but mean different things.", simple: "Same sound, different meaning.", question: "Which meaning does the sentence need? Try each word with its meaning.", example: "their (belongs to them) · there (a place) · they're (they are)", stretch: "Write one sentence that uses all three correctly." },
  SPELLING: { message: "Check the spelling pattern of the word.", simple: "Look at the letters again.", question: "Say the word slowly. Which spelling pattern does it follow?", example: "hop → hopping (double p) · hope → hoping (drop the e)", stretch: "Find two more words with the same pattern." },
  WRITING_CHOICE: { message: "Think about what makes the writing clearest for the reader.", simple: "Which choice is clearest?", question: "Which choice stays on topic and gives the reader the most useful information?", example: "Weak: “It was good.” Strong: “The ending surprised me because the quiet boy saved the team.”", stretch: "How would you make the strong choice even better?" },
  // ---- added codes (reading evidence, vocabulary, Arabic-speaker transfer, spelling rules); none names an answer
  EVIDENCE_MISMATCH: { message: "Your answer may be right, but the evidence you chose does not prove it. It is about the same topic, but it does not show your answer is true.", simple: "Good answer. Now find the sentence that PROVES it.", question: "Say: “I know my answer is right because the text says ___.” Which sentence makes that true?", example: "Answer: “Lina is brave.” Weak evidence: “Lina lives near the sea.” Strong evidence: “Lina jumped in to help the boy who was struggling.”", stretch: "Why is the other evidence weaker, even though it is about the same thing?" },
  WRONG_SENSE: { message: "This word has more than one meaning. You chose a real meaning, but not the one used in this sentence.", simple: "The word has two meanings. Which one fits HERE?", question: "Think of two meanings of the word. Put each one into the sentence. Which one makes sense?", example: "“The bat flew out of the cave.” Here bat is an animal, not the stick used in a game.", stretch: "Write two sentences that use the word with its two different meanings." },
  FALSE_SPLIT: { message: "The word was split into parts that are not really there. Some letters only look like a prefix or suffix.", simple: "Check the parts. Is it really a prefix?", question: "Cover the part you think is a prefix or suffix. Is what is left a real word with a meaning?", example: "un + happy works (happy is a word). But “uncle” is not un + cle, because “cle” is not a word.", stretch: "Find a word that starts with the same letters but has no prefix." },
  POS_MISMATCH: { message: "The meaning you chose is for a different kind of word. Check the job the word does in this sentence.", simple: "Is it a thing, an action, or a describing word here?", question: "What job does the word do in this sentence: does it name, act, or describe? Which meaning does that same job?", example: "“I will park the car.” Here park is an action (a verb), so it cannot mean a place with trees.", stretch: "Use the word once as a noun and once as a verb in your own sentences." },
  CONNOTATION_POLARITY: { message: "These words can mean almost the same thing, but they give a different feeling — positive, negative or neutral.", simple: "Does the word feel nice or not nice?", question: "How does the writer feel about the person or thing? Which word gives that same feeling?", example: "“Curious” sounds positive; “nosy” sounds negative — both are about wanting to know things.", stretch: "Rewrite the sentence with a word that has the opposite feeling. How does the meaning change?" },
  EXAMPLE_NOT_CATEGORY: { message: "You mixed up one example with the whole group it belongs to (or the other way around).", simple: "Is it ONE example or the WHOLE group?", question: "Does the question ask for the big group or for one member of it? Which level does each choice name?", example: "Group: fruit. Examples: apple, mango, date.", stretch: "Name the group, then add two more examples that belong to it." },
  L1_THIRD_PERSON_S: { message: "With he, she, it or one person, a present-tense verb needs an -s ending in English.", simple: "He, she, it: add -s to the verb.", question: "Who is the subject? If it is he, she, it or one person, does the verb end in -s?", example: "I play. You play. He plays. My sister reads.", stretch: "Find every he/she/it sentence in a paragraph and check each verb." },
  L1_MISSING_BE: { message: "English sentences need a verb. When there is no action verb, use am, is or are.", simple: "Add am, is or are.", question: "Is there a verb in the sentence? If not, which of am, is or are fits the subject?", example: "Not “She happy.” → “She is happy.” Not “They at school.” → “They are at school.”", stretch: "Change the sentence to the past. Which verb do you use then?" },
  L1_ARTICLE: { message: "Check the small words a, an and the. English uses them in some places where Arabic does not (and not in others).", simple: "Does it need a, an, the, or nothing?", question: "Is the noun one particular thing, any one thing, or things in general? Which choice matches that?", example: "“I saw a cat.” (any one cat) · “The cat was black.” (that cat) · “Cats like milk.” (cats in general)", stretch: "Explain why one sentence needs no article at all." },
  L1_ADJ_ORDER: { message: "In English, the describing word usually comes before the noun.", simple: "Describing word first, then the thing.", question: "Find the noun and the describing word. Which one should come first in English?", example: "Not “a car red” → “a red car.” Not “the house big old” → “the big old house.”", stretch: "Add two describing words to a noun and put them in the right order." },
  L1_PLURAL_AFTER_NUMBER: { message: "After a number bigger than one, or words like many and several, the noun must be plural.", simple: "More than one? Use the plural.", question: "Find the number word. Does it mean more than one? Then which form of the noun fits?", example: "one book → three books; many student → many students.", stretch: "Which plurals here are irregular (child → children)?" },
  L1_TENSE_PRESENT_FOR_FUTURE: { message: "The action happens later, so English needs a future form, not the present.", simple: "Later? Use will or going to.", question: "Find the time word. Is it now or later? Which choice shows the future?", example: "Not “Tomorrow I visit my uncle.” → “Tomorrow I will visit my uncle.”", stretch: "Say the sentence with “going to” as well. Does the meaning change?" },
  L1_PREPOSITION: { message: "Prepositions often do not translate word for word. English uses its own small word in this phrase.", simple: "Learn this phrase as one chunk.", question: "Have you heard this phrase before? Say each choice in the full phrase. Which one sounds like English you have read?", example: "good at math · interested in science · arrive at school · listen to music", stretch: "Write three more phrases that use the same preposition." },
  L1_PRESENT_PERFECT: { message: "Check the time: is the action finished at a past time, or connected to now?", simple: "Finished time or up to now?", question: "Look for time words. A finished time (yesterday, last year) or a time up to now (since, already, ever)? Which form fits?", example: "I visited Jeddah last year. · I have visited Jeddah three times (in my life, up to now).", stretch: "Change the sentence so the other form is correct." },
  L1_P_B: { message: "Listen to the first sound carefully: p and b are different sounds in English.", simple: "Is it p or b? Feel the puff of air.", question: "Hold your hand in front of your mouth and say the word. Do you feel a puff of air? Which letter makes that sound?", example: "pin / bin · pat / bat · cap / cab", stretch: "Find two more word pairs that change meaning with p and b." },
  L1_V_F: { message: "Listen carefully: v and f are different sounds in English.", simple: "Is it v or f? Feel your throat.", question: "Touch your throat and say the word. Does it buzz? Which letter makes that sound?", example: "fan / van · leaf / leave · safe / save", stretch: "Find two more word pairs that change meaning with v and f." },
  L1_SHORT_VOWEL: { message: "A vowel sound is missing or changed. In English, every syllable needs a vowel, and short vowels must be written.", simple: "Say each sound. Write a letter for each.", question: "Say the word slowly and tap each sound. Did you write a letter for every vowel sound you hear?", example: "c-a-t, b-e-d, s-i-t, h-o-t, c-u-p", stretch: "Change the vowel to make three new words." },
  L1_CLUSTER: { message: "Check the group of consonants that come together — no extra vowel goes between them, and none are dropped.", simple: "Say the consonant group slowly.", question: "Say the word slowly. Which consonants come together at the start or end? Are they all there, with nothing extra?", example: "street (s-t-r) · spring (s-p-r) · next (k-s-t)", stretch: "Find three words that begin with the same consonant group." },
  L1_SILENT_LETTER: { message: "Some English words have letters you write but do not say.", simple: "Some letters are silent.", question: "Which letters in this kind of word are written but not heard? Does the choice keep them?", example: "knee (silent k) · write (silent w) · lamb (silent b) · light (silent gh)", stretch: "Find two more words with the same silent letter." },
  VOWEL_TEAM: { message: "Two vowels together (a vowel team) can spell one long vowel sound. Check which team this word uses.", simple: "Two vowels, one sound. Which team?", question: "Which vowel team spells this sound? Is the sound in the middle or at the end of the word?", example: "rain (ai in the middle) · play (ay at the end) · boat (oa) · snow (ow)", stretch: "Sort five words by their vowel team." },
  R_CONTROLLED: { message: "When r follows a vowel, it changes the vowel sound. Several spellings can make the same sound.", simple: "The r changes the vowel.", question: "The sound can be spelled er, ir or ur (or ar, or). Which spelling does this word use? Have you seen it written?", example: "her · bird · turn · car · fork", stretch: "Find three words that rhyme but use different r-spellings." },
  DOUBLING_RULE: { message: "Check the base word before adding the ending: some words double the last consonant, others do not.", simple: "One short vowel + one consonant? Double it.", question: "Does the base word have one syllable, one short vowel and one final consonant? What happens to that consonant before -ing or -ed?", example: "skip → skipping · plan → planned · jump → jumping (two consonants: no doubling)", stretch: "Why does “rain” not double before -ing?" },
  DROP_E: { message: "Check the silent e at the end of the base word before adding the ending.", simple: "Silent e + vowel ending: drop the e.", question: "Does the ending start with a vowel or a consonant? What happens to the silent e then?", example: "bake → baking · care → careful (consonant ending: keep the e)", stretch: "Find a word that keeps the e before a vowel ending (like “seeing”)." },
  Y_TO_I: { message: "Check the y at the end of the base word before adding the ending.", simple: "Consonant + y: change y to i (not before -ing).", question: "Is there a consonant or a vowel before the y? Does the ending start with i?", example: "dry → dried · pony → ponies · stay → stayed · dry → drying", stretch: "Explain why “playing” keeps its y." },
};
const GENERIC: Template = { message: "Not this one — let's look again together.", simple: "Let's look again.", question: "Read the question again. What exactly is it asking?", example: "Underline the key words of the question before you choose.", stretch: "Explain why each wrong choice is wrong." };

/** The tutor's turn after a wrong answer. */
export function tutorFeedback(i: TutorInput): TutorMessage {
  const t = (i.misconception && T[i.misconception]) || GENERIC;
  const parts: string[] = [i.band === "BELOW" ? t.simple : t.message];
  if (i.rationale && i.band !== "BELOW") parts.push(i.rationale);
  if (i.repeated >= 3) parts.push(i.band === "BELOW" ? "This is the same mistake as before. Let's fix it together." : `This is a pattern: the same kind of mistake ${i.repeated} times lately. Use the strategy below on the next questions.`);
  const strategy = i.band === "ABOVE" ? t.stretch : i.hasPassage ? "Go back to the text, find the exact sentence, then choose." : "Read the question twice and check each choice against it.";
  const msg: TutorMessage = { message: parts.join(" "), guidingQuestion: t.question, hint: i.hint || i.tip || "Look at the key words in the question.", example: t.example, strategy, repeated: i.repeated, misconception: i.misconception };
  return tutorLeaksAnswer(msg, i.correctTexts) ? { ...msg, hint: "Look at the key words in the question.", message: t.message } : msg;
}

/** True when the tutor's words contain the correct option (it must guide, not tell). */
export function tutorLeaksAnswer(m: Pick<TutorMessage, "message" | "guidingQuestion" | "hint">, correctTexts: string[]): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const all = ` ${norm(`${m.message} ${m.guidingQuestion} ${m.hint}`)} `;
  // whole words only: "strong" is not leaked by "stronger"; very short answers ("a", "is") are not checked
  return correctTexts.some((c) => { const n = norm(c); return n.length >= 4 && all.includes(` ${n} `); });
}

export const bandOfTheta = (theta: number | null): Band => (theta === null ? "ON" : theta <= -0.75 ? "BELOW" : theta >= 0.75 ? "ABOVE" : "ON");

// ------------------------------------------------------------------ 💡 hint ladder (practice and lessons)

/**
 * Three hints, one more step each time the student asks (guide first, then show where to look):
 *   1. the question type (QAR) and one strategy step
 *   2. which paragraph holds the answer
 *   3. the clue sentence itself, highlighted in the passage
 * Each hint lowers the credit of the answer (HINT_CREDIT). Items without a passage: level 2 is the item's own hint,
 * level 3 a "check each choice" routine. Pure and deterministic.
 */
export type QarCode = "RIGHT_THERE" | "THINK_AND_SEARCH" | "AUTHOR_AND_ME" | "ON_MY_OWN";
export const QAR_HELP: Record<QarCode, { name: string; how: string }> = {
  RIGHT_THERE: { name: "Right There", how: "The answer is stated in one place in the text. Find the words of the question in the text." },
  THINK_AND_SEARCH: { name: "Think and Search", how: "The answer is in the text, but in more than one place. Put two or more parts together." },
  AUTHOR_AND_ME: { name: "Author and Me", how: "The answer is not written in the text. Join a clue from the text with what you already know." },
  ON_MY_OWN: { name: "On My Own", how: "The answer comes from your own life and ideas. The text helps you think about it." },
};
export const isQar = (v: unknown): v is QarCode => typeof v === "string" && v in QAR_HELP;

/** The share of credit an answer keeps after 0, 1, 2 or 3 hints. */
export const HINT_CREDIT = [1, 0.75, 0.5, 0.25] as const;
export const MAX_HINT_LEVEL = 3;
export const creditAfterHints = (credit: number, hints: number) => credit * HINT_CREDIT[Math.max(0, Math.min(MAX_HINT_LEVEL, Math.floor(hints)))];

const STOP = new Set("a an the and or but so of to in on at by for from with as is are was were be been it its this that these those he she they them his her their we you i my our your not no do does did has have had will would can could than then there what which who whom why how when where about into over after before also very just more most some any each one all".split(" "));
const words = (s: string) => new Set(String(s ?? "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")).filter((w) => w.length > 2));

/** The paragraphs of a passage as the student sees them (headings and text features are not numbered). */
export function passageParagraphs(text: string): string[] {
  return passageBlocks(text).filter((b) => b.kind === "p").map((b) => b.text.replace(/\s*\n\s*/g, " ").trim());
}

/** The sentences of a paragraph (keeps a closing quotation mark with its sentence). */
export function sentencesOf(paragraph: string): string[] {
  return (String(paragraph).match(/[^.!?]+(?:[.!?]+["”’)]*|$)/g) ?? []).map((x) => x.trim()).filter((x) => x.length > 1);
}

export interface Evidence { paragraph: number; sentence: string; score: number }

/**
 * The passage sentence that best supports the answer: the most content words shared with the correct option and its
 * rationale. Ties go to the earlier sentence (deterministic). null when nothing overlaps.
 */
export function pickEvidenceSentence(passage: string | null | undefined, targets: (string | null | undefined)[]): Evidence | null {
  if (!passage) return null;
  const want = words(targets.filter(Boolean).join(" "));
  if (!want.size) return null;
  let best: Evidence | null = null;
  passageParagraphs(passage).forEach((p, pi) => {
    for (const sentence of sentencesOf(p)) {
      const w = words(sentence);
      let score = 0;
      for (const x of w) if (want.has(x)) score++;
      if (score > 0 && (!best || score > best.score)) best = { paragraph: pi + 1, sentence, score };
    }
  });
  return best;
}

export interface HintStep { level: 1 | 2 | 3; text: string; qar: QarCode | null; paragraph: number | null; sentence: string | null; maxLevel: number }

/** The hint at `level` (1–3). */
export function hintLadderStep(level: number, ctx: { qar: string | null; strategyStep: string | null; passage: string | null; evidence: Evidence | null; itemHint: string | null; correctTexts: string[] }): HintStep {
  const lv = Math.max(1, Math.min(MAX_HINT_LEVEL, Math.floor(level))) as 1 | 2 | 3;
  const qar = isQar(ctx.qar) ? ctx.qar : null;
  const safe = (t: string, fallback: string) => (tutorLeaksAnswer({ message: t, guidingQuestion: "", hint: "" }, ctx.correctTexts) ? fallback : t);
  const base = { qar, paragraph: null as number | null, sentence: null as string | null, maxLevel: MAX_HINT_LEVEL };
  if (lv === 1) {
    const kind = qar ? `This is a “${QAR_HELP[qar].name}” question. ${QAR_HELP[qar].how}` : "Read the question twice and underline its key words.";
    const step = ctx.strategyStep ? ` Strategy: ${ctx.strategyStep}` : "";
    return { ...base, level: 1, text: safe(`${kind}${step}`, kind) };
  }
  if (lv === 2) {
    if (ctx.passage && ctx.evidence) return { ...base, level: 2, paragraph: ctx.evidence.paragraph, text: `Look closely at paragraph ${ctx.evidence.paragraph}. The clue you need is there.` };
    const own = ctx.itemHint ? safe(ctx.itemHint, "") : "";
    return { ...base, level: 2, text: own || (ctx.passage ? "Go back to the text and reread the part the question is about." : "Read each choice and cross out the ones that do not fit the question.") };
  }
  if (ctx.passage && ctx.evidence) return { ...base, level: 3, paragraph: ctx.evidence.paragraph, sentence: ctx.evidence.sentence, text: `This sentence is the clue: “${ctx.evidence.sentence}” Which answer does it prove?` };
  return { ...base, level: 3, text: "Try each choice in the question one at a time. Ask: does it make sense, and does it match every word of the question? Keep the only one that does." };
}
