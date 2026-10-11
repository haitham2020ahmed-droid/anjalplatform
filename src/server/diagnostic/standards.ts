/**
 * Reporting areas for the Diagnostic: every question is reported under one CCSS standard (sub-standards such as
 * L.4.4.a fold into L.4.4) and one strand. Questions without a standard are reported by their skill's category.
 */
import { bandEdges, fluencySeason, norm50, SEASON_NAME, type Season } from "../fluency/norms";

export type Strand = "LIT" | "INFO" | "VOCAB" | "LANG" | "FOUND" | "WRITE";
export const STRAND_LABEL: Record<Strand, string> = {
  LIT: "Reading Literature", INFO: "Reading Informational Text", VOCAB: "Vocabulary", LANG: "Grammar & Conventions", FOUND: "Foundational Skills", WRITE: "Writing",
};
/**
 * The share of each strand in a 50-question test. Foundational Skills (word study) takes its 4 places only when the
 * bank has word-study questions; otherwise its places go back to the other strands (15 / 15 / 10 / 10).
 */
export const STRAND_QUOTA: Record<Strand, number> = { LIT: 15, INFO: 15, VOCAB: 10, LANG: 10, FOUND: 4, WRITE: 0 };
/** skill families measured by the Foundational Skills slots (multisyllable decoding, affixes, roots, spelling patterns) */
export const WORD_STUDY_FAMILIES: ReadonlySet<string> = new Set(["prefixes", "suffixes", "greek-latin-roots", "spelling", "homographs-homophones"]);

const ANCHOR: Record<string, Record<number, string>> = {
  RL: { 1: "Evidence & Inferences", 2: "Theme & Summary", 3: "Characters, Setting & Events", 4: "Words & Phrases in Context", 5: "Text Structure", 6: "Point of View", 7: "Text & Visuals", 9: "Comparing Texts", 10: "Range of Reading" },
  RI: { 1: "Evidence & Inferences", 2: "Main Idea & Details", 3: "Events, Ideas & Procedures", 4: "Academic Vocabulary in Context", 5: "Text Structure", 6: "Point of View & Purpose", 7: "Charts, Graphs & Visuals", 8: "Reasons & Evidence", 9: "Integrating Two Texts", 10: "Range of Reading" },
  L: { 1: "Grammar & Usage", 2: "Capitals, Punctuation & Spelling", 3: "Knowledge of Language", 4: "Word Meaning (Context Clues, Roots, Affixes)", 5: "Figurative Language & Word Relationships", 6: "Academic & Domain Words" },
  RF: { 3: "Phonics & Word Recognition", 4: "Fluency" },
  W: { 1: "Opinion Writing", 2: "Informative Writing", 3: "Narrative Writing", 4: "Clear Writing", 5: "Planning & Revising" },
};

/** Teaching moves for each anchor (used by the action plan and the support-plan weeks). */
export const PRESCRIPTION: Record<string, { objective: string; activities: string[] }> = {
  "RL.1": { objective: "Students quote accurately and use details to explain what the text says and what it suggests.", activities: ["Mini-lesson: “It says / I think / So” chart to model inferring from clues.", "Evidence hunt: find two details that prove an answer; highlight them in the text.", "Partner check: each answer must point to a line in the text."] },
  "RL.2": { objective: "Students identify the theme of a story or poem and summarize it with key details.", activities: ["Mini-lesson: theme is the lesson or message, not the topic (friendship → “real friends help each other”).", "Read a fable together and fill a theme organizer: what the character learns + 2 details.", "Theme poster: theme, 2–3 supporting details, a one-sentence summary."] },
  "RL.3": { objective: "Students describe characters, setting and events in depth using specific details (thoughts, words, actions).", activities: ["Mini-lesson: character traits vs. feelings; how events cause changes.", "Story map: setting, problem, key events, solution.", "Conflict sort: character vs. character / self / nature / society, with evidence."] },
  "RL.4": { objective: "Students work out the meaning of words and phrases from context, including figurative language.", activities: ["Context-clue strategies: definition, example, synonym, antonym.", "Word detective: underline the clue words around an unknown word.", "Figurative language match-up: simile, metaphor, idiom → meaning."] },
  "RL.5": { objective: "Students explain how poems, drama and prose are built and how parts fit together.", activities: ["Compare a poem, a play scene and a story: stanza / scene / paragraph.", "Label the parts of a drama: cast, stage directions, dialogue.", "Rearrange cut-up story parts and explain the order."] },
  "RL.6": { objective: "Students compare points of view and tell first- from third-person narration.", activities: ["Mini-lesson: pronoun clues for first and third person.", "Retell a scene from another character’s point of view.", "Point-of-view sort with short passages."] },
  "RI.1": { objective: "Students refer to details and examples in an informational text when explaining and inferring.", activities: ["Mini-lesson: explicit vs. inferred information.", "Paired-evidence citation: back every claim with two details.", "Question stems: “How do you know? Which sentence shows it?”"] },
  "RI.2": { objective: "Students find the main idea and explain how key details support it; summarize the text.", activities: ["Mini-lesson: the main idea is what the text is mostly about; details prove it.", "Read & respond: main idea + 2–3 details in a box-and-bullets organizer.", "Main idea match-up game in small groups."] },
  "RI.3": { objective: "Students explain events, procedures and ideas, including cause and effect.", activities: ["Mini-lesson: cause (why) and effect (what happened); signal words because, so, as a result.", "Text hunt: find 2–3 cause/effect pairs and record them in a chart.", "Cause-and-effect card sort."] },
  "RI.4": { objective: "Students determine the meaning of academic and subject words in a text.", activities: ["Pre-teach 5 key words with pictures and examples.", "Use text features (glossary, bold words) and context to define words.", "Vocabulary four-square: word, meaning, sentence, picture."] },
  "RI.5": { objective: "Students describe text structure: chronology, compare/contrast, cause/effect, problem/solution.", activities: ["Signal-word chart for each structure.", "Match paragraphs to their structure and graphic organizer.", "Rewrite a short paragraph in another structure."] },
  "RI.6": { objective: "Students compare first-hand and second-hand accounts and the author’s purpose.", activities: ["Compare a diary entry with an encyclopedia entry on the same event.", "Author’s purpose: persuade, inform, entertain — with evidence.", "Venn diagram of two accounts."] },
  "RI.7": { objective: "Students use charts, diagrams, timelines and visuals to understand a text.", activities: ["Text-feature scavenger hunt.", "Explain what a diagram adds that the words do not.", "Turn a paragraph into a simple chart or timeline."] },
  "RI.8": { objective: "Students explain how an author uses reasons and evidence to support points.", activities: ["Claim–reason–evidence chart.", "Strong vs. weak evidence sort.", "Find the author’s best reason and explain why."] },
  "L.1": { objective: "Students use grammar correctly: verb tenses, pronouns, adjectives, complete sentences.", activities: ["Daily 5-minute sentence fix-up.", "Fragments and run-ons: fix them in pairs.", "Grammar game: sort words by part of speech."] },
  "L.2": { objective: "Students use capitals, commas, quotation marks and correct spelling.", activities: ["Edit a short paragraph with a checklist (CUPS).", "Comma and quotation-mark mini-lessons with examples.", "Spelling patterns word sort."] },
  "L.3": { objective: "Students choose words and punctuation for effect and use formal and informal English.", activities: ["Precise words: replace “said” and “good”.", "Formal vs. informal sort.", "Combine short sentences into one strong sentence."] },
  "L.4": { objective: "Students work out unknown words with context clues, roots and affixes, and a dictionary.", activities: ["Greek and Latin roots of the week (tele, graph, port…).", "Prefix and suffix word building.", "Context-clue detective with short sentences."] },
  "L.5": { objective: "Students explain similes, metaphors, idioms, synonyms and antonyms.", activities: ["Idiom illustration: literal vs. real meaning.", "Synonym and antonym ladders.", "Similes and metaphors in poems: find and explain."] },
  "L.6": { objective: "Students use academic and topic words accurately.", activities: ["Tier 2 word wall with student sentences.", "Word of the day used in speaking and writing.", "Topic vocabulary quiz games."] },
  "RF.3": { objective: "Students decode multisyllable words using phonics and morphology.", activities: ["Syllable division practice.", "Prefix/suffix chunking.", "Read word lists for accuracy, then for speed."] },
  "RF.4": { objective: "Students read grade texts with accuracy, appropriate rate and expression.", activities: ["Repeated reading of a short passage (3 times, timed).", "Partner reading with feedback on expression.", "Readers’ theater."] },
};
const GENERIC = { objective: "Students practise this skill with guided support and short texts.", activities: ["Model the skill with a think-aloud.", "Guided practice in pairs.", "Short independent check."] };

export interface Area { code: string; label: string; strand: Strand; anchor: string }

/** "CCSS.ELA-LITERACY.RL.4.2" → { code "RL.4.2", label "Theme & Summary", strand LIT, anchor "RL.2" } */
export function areaOfStandard(raw: string): Area | null {
  const m = raw.replace(/^CCSS\.ELA-LITERACY\./i, "").match(/^(RL|RI|L|RF|W)\.(\d+)\.(\d+)/i);
  if (!m) return null;
  const kind = m[1].toUpperCase(), grade = m[2], n = Number(m[3]);
  const strand: Strand = kind === "RL" ? (n === 4 ? "VOCAB" : "LIT") : kind === "RI" ? (n === 4 ? "VOCAB" : "INFO") : kind === "L" ? (n >= 4 ? "VOCAB" : "LANG") : kind === "RF" ? "FOUND" : "WRITE";
  return { code: `${kind}.${grade}.${n}`, label: ANCHOR[kind]?.[n] ?? `${kind}.${grade}.${n}`, strand, anchor: `${kind}.${n}` };
}

/** A question with no standard: by its skill category, or the genre of its Curriculum Map place. */
export function areaOfCategory(category: string, grade: number, genre?: string | null): Area {
  const c = category.toUpperCase();
  if (c === "VOCABULARY" || c === "WORD_STUDY" || c === "PHONICS_WORD_STUDY" || c === "CONCEPT_VOCABULARY") return { code: `L.${grade}.4`, label: ANCHOR.L[4], strand: "VOCAB", anchor: "L.4" };
  if (c === "GRAMMAR") return { code: `L.${grade}.1`, label: ANCHOR.L[1], strand: "LANG", anchor: "L.1" };
  if (c === "MECHANICS") return { code: `L.${grade}.2`, label: ANCHOR.L[2], strand: "LANG", anchor: "L.2" };
  if (c === "WRITING") return { code: `W.${grade}.4`, label: ANCHOR.W[4], strand: "WRITE", anchor: "W.4" };
  const info = c === "INFORMATIONAL" || /expository|argument|biograph|nonfiction|informational|persuasive/i.test(genre ?? "");
  return info ? { code: `RI.${grade}.1`, label: ANCHOR.RI[1], strand: "INFO", anchor: "RI.1" } : { code: `RL.${grade}.1`, label: ANCHOR.RL[1], strand: "LIT", anchor: "RL.1" };
}

/** The Foundational Skills area (RF.g.3, Phonics & Word Recognition) of a word-study question. */
export const foundationalArea = (grade: number): Area => ({ code: `RF.${grade}.3`, label: ANCHOR.RF[3], strand: "FOUND", anchor: "RF.3" });

export const prescriptionFor = (anchor: string) => PRESCRIPTION[anchor] ?? GENERIC;

/** Performance tiers of the class report (by % correct). */
export const TIERS = [
  { key: "ADVANCED", name: "Advanced", sub: "Exceeding standards", min: 75, strategy: "Extend: longer and more complex texts, comparing two texts, student-led discussions, and the next grade’s skills in the curriculum plan." },
  { key: "PROFICIENT", name: "Proficient", sub: "Meeting standards", min: 60, strategy: "Strengthen: target the two weakest standards with short practice sets and check for mastery every week." },
  { key: "APPROACHING", name: "Approaching", sub: "Emerging", min: 40, strategy: "Guided reading in small groups, graphic organizers, and explicit modelling of the weakest standards (support plan below)." },
  { key: "INTENSIVE", name: "Intensive Support", sub: "Substantial intervention", min: 0, strategy: "Daily small-group intervention: finding text evidence, main idea mapping, high-frequency academic vocabulary and fluency practice." },
] as const;
export const tierOf = (pct: number) => TIERS.find((t) => pct >= t.min)!;
/**
 * The performance band shown next to a student's Diagnostic level (readiness I-20): derived from the SAME level, so a
 * card never says “On Level” next to “Advanced · Exceeding standards”. Above → Advanced, On → Proficient, Below →
 * Approaching (40 %+) or Intensive Support. Without a level the % bands apply. (Named “bands”, not tiers, so they are
 * never confused with the RTI support tiers.)
 */
export const bandFor = (pct: number, level?: string | null) =>
  level === "ABOVE" ? TIERS[0] : level === "ON" ? TIERS[1] : level === "BELOW" ? (pct >= TIERS[2].min ? TIERS[2] : TIERS[3]) : tierOf(pct);

/** Level of a standard's class average. */
export function standardLevel(pct: number): "Strength" | "Moderate" | "Approaching" | "Priority Need" {
  return pct >= 75 ? "Strength" : pct >= 60 ? "Moderate" : pct >= 50 ? "Approaching" : "Priority Need";
}

/**
 * Oral reading fluency benchmark: the 50th percentile of Hasbrouck & Tindal (2017) for the grade and the CURRENT
 * season (fall Aug–Nov · winter Dec–Feb · spring Mar–Jul), from src/server/fluency/norms.ts. Grades 4–6 are read
 * live (getters, so a long-running server moves to the next season by itself); other grades keep the published
 * winter 50th percentile.
 */
export const WCPM_BENCHMARK: Record<number, number> = { 1: 29, 2: 84, 3: 97, 7: 150, 8: 151 };
for (const g of [4, 5, 6]) Object.defineProperty(WCPM_BENCHMARK, g, { enumerable: true, get: () => norm50(g, fluencySeason()) ?? 120 });
export const wcpmBenchmark = (grade: number, season: Season = fluencySeason()): number => (grade >= 4 && grade <= 6 ? norm50(grade, season) ?? 120 : WCPM_BENCHMARK[grade] ?? 120);

/**
 * The school's Diagnostic Fluency Assessment Rubric (WCPM, Hasbrouck & Tindal 2017, season-aware, US norms as
 * published — the school's decision): Below ≤ the 25th percentile · On between · Above > the 75th percentile, for the
 * grade and the season of the reading. E.g. fall: Grade 4 ≤ 75 · 76–125 · > 125 | Grade 5 ≤ 87 · 88–153 · > 153 |
 * Grade 6 ≤ 112 · 113–159 · > 159. Other grades: Below under 75% of the benchmark, Above over 125%.
 * FLUENCY_RUBRIC holds the current season's edges (getters).
 */
export const FLUENCY_RUBRIC: Record<number, { below: number; above: number }> = {};
for (const g of [4, 5, 6]) Object.defineProperty(FLUENCY_RUBRIC, g, { enumerable: true, get: () => fluencyBands(g) });
export function fluencyBands(grade: number, season: Season = fluencySeason()): { below: number; above: number } {
  const e = grade >= 4 && grade <= 6 ? bandEdges(grade, season) : null;
  if (e) return { below: e.below, above: e.above };
  const b = WCPM_BENCHMARK[grade] ?? 120;
  return { below: Math.round(b * 0.75) - 1, above: Math.round(b * 1.25) };
}
export const fluencyLevel = (wcpm: number, grade: number, season: Season = fluencySeason()): "BELOW" | "ON" | "ABOVE" => { const r = fluencyBands(grade, season); return wcpm <= r.below ? "BELOW" : wcpm > r.above ? "ABOVE" : "ON"; };
export const fluencyRubricText = (grade: number, season: Season = fluencySeason()) => { const r = fluencyBands(grade, season); return `Grade ${grade}: Below ≤ ${r.below} · On ${r.below + 1}–${r.above} · Above > ${r.above} WCPM`; };
/** The rubric line with its season, e.g. "Grade 5 · winter: Below ≤ 109 · On 110–160 · Above > 160 WCPM". */
export const fluencyRubricSeasonText = (grade: number, season: Season = fluencySeason()) => fluencyRubricText(grade, season).replace(/^Grade (\d+):/, `Grade $1 · ${SEASON_NAME[season]}:`);
