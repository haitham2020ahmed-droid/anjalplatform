/**
 * 🇸🇦 The NAFS section's framework (owner's spec): the NAFS reading skills with stable codes, their four domains,
 * the PIRLS processes, the links to the platform's skill families (by family name), the facts shown on "About NAFS"
 * and the "NAFS simulation" blueprint. Pure data + one seeding function (ensureNafsFramework). English source
 * strings; the pages translate them.
 */
import type { Repo } from "../seeding/repo";

export type NafsDomain = "RC" | "IAE" | "V" | "PIRLS";
export type NafsProcess = "P1" | "P2" | "P3" | "P4";
export const PROCESSES: NafsProcess[] = ["P1", "P2", "P3", "P4"];

export const NAFS_DOMAINS: { code: NafsDomain; n: number; name: string; about: string }[] = [
  { code: "RC", n: 1, name: "Reading Comprehension", about: "Understanding what the text says." },
  { code: "IAE", n: 2, name: "Inferring, Analyzing and Evaluating", about: "Thinking about the text beyond what it says." },
  { code: "V", n: 3, name: "Vocabulary", about: "Word meanings, word forms and using words in new contexts." },
  { code: "PIRLS", n: 4, name: "The four PIRLS reading processes", about: "How the reader works with the text (every question has one)." },
];

export interface NafsSkillDef {
  code: string; domain: NafsDomain; name: string; about: string;
  /** the default PIRLS process of a question of this skill (P-skills: themselves) */
  process: NafsProcess;
  /** typical question stems (shown on the Skills tab and given to the AI as models) */
  stems: string[];
  /** platform skill families linked automatically (by name) */
  families: RegExp;
}

export const NAFS_SKILLS: NafsSkillDef[] = [
  { code: "NAFS.RC.MAIN", domain: "RC", name: "Main idea", about: "The big point of the whole text or of a paragraph.", process: "P3", stems: ["What is the main idea of the text?", "What is paragraph 2 mostly about?"], families: /central idea|main idea|summari[sz]e|^theme$/i },
  { code: "NAFS.RC.DETAIL", domain: "RC", name: "Supporting details", about: "Facts, examples and reasons that explain the main idea.", process: "P1", stems: ["Which detail supports the idea that…?", "According to the text, why…?"], families: /relevant details|key details|supporting details|cite text evidence/i },
  { code: "NAFS.RC.IMPLIED", domain: "RC", name: "Implied ideas", about: "Ideas the text suggests but does not say directly.", process: "P2", stems: ["What does the writer suggest about…?", "What can the reader tell about…?"], families: /make inferences|implied/i },
  { code: "NAFS.IAE.INFER", domain: "IAE", name: "Inferring", about: "Text clues + what the reader knows → a conclusion the text does not state.", process: "P2", stems: ["Why did the character…?", "What will most likely happen next?"], families: /make predictions|character traits|character perspective|draw conclusions/i },
  { code: "NAFS.IAE.ANALYZE", domain: "IAE", name: "Analyzing", about: "How the parts connect: cause and effect, sequence, comparison, why a detail is included.", process: "P3", stems: ["What caused…?", "Why does the writer include the detail about…?"], families: /cause and effect|sequence|compare and contrast|problem and solution|plot: conflict|text features/i },
  { code: "NAFS.IAE.EVAL", domain: "IAE", name: "Evaluating", about: "The author's purpose, fact and opinion, the best title.", process: "P4", stems: ["What is the writer's purpose?", "Which sentence is an opinion?", "Which is the best title for the text?"], families: /author'?s purpose|author'?s claim|fact and opinion|author'?s perspective|point of view/i },
  { code: "NAFS.V.SYNANT", domain: "V", name: "Synonyms and antonyms in context", about: "A word with the same or the opposite meaning, as used in the text.", process: "P2", stems: ["What is a synonym for the word 'fleeting'?", "Which word means the opposite of 'calm' in paragraph 3?"], families: /synonyms|antonyms/i },
  { code: "NAFS.V.NEAR", domain: "V", name: "Near-synonyms and precise word choice", about: "Choosing the exact word: look, stare, glance.", process: "P3", stems: ["Which word best shows that Sara looked quickly?"], families: /connotation|shades of meaning|precise word/i },
  { code: "NAFS.V.FORMS", domain: "V", name: "Word forms and word families", about: "Singular and plural (child → children); word families (happy, happiness, happily).", process: "P1", stems: ["What is the plural of 'child'?", "Which word completes the sentence: She smiled ___ ."], families: /plural|suffixes|prefixes|roots|word famil/i },
  { code: "NAFS.V.CONTEXT", domain: "V", name: "Using words in new contexts", about: "Using a word correctly in a new sentence.", process: "P2", stems: ["Which sentence uses the word 'fleeting' correctly?"], families: /context clues|multiple-meaning|academic and domain|figurative language|idioms/i },
  { code: "NAFS.P1", domain: "PIRLS", name: "Retrieve explicitly stated information", about: "Find information the text states directly.", process: "P1", stems: ["According to the text, where did the family go?"], families: /cite text evidence|ask and answer questions|key details|text features/i },
  { code: "NAFS.P2", domain: "PIRLS", name: "Make straightforward inferences", about: "Connect two ideas the text gives (coat and gloves → it is cold).", process: "P2", stems: ["Why did Omar put on his coat?"], families: /make inferences|make predictions|context clues/i },
  { code: "NAFS.P3", domain: "PIRLS", name: "Interpret and integrate ideas and information", about: "A character's changing feelings, the overall message, comparing ideas.", process: "P3", stems: ["How do Lina's feelings change in the story?", "What is the message of the story?"], families: /^theme$|summari[sz]e|character traits|compare and contrast texts|central idea/i },
  { code: "NAFS.P4", domain: "PIRLS", name: "Evaluate and critique content and textual elements", about: "Judge the content, the language and the structure.", process: "P4", stems: ["Why did the writer start with a question?", "Is this text convincing? Why?"], families: /author'?s purpose|author'?s claim|text structure: description|point of view|imagery/i },
];

export const SKILL_BY_CODE = new Map(NAFS_SKILLS.map((k) => [k.code, k]));
export const isNafsCode = (c: unknown): c is string => SKILL_BY_CODE.has(String(c ?? ""));
export const isProcess = (p: unknown): p is NafsProcess => PROCESSES.includes(String(p ?? "") as NafsProcess);
/** The skills a question is tagged with (domains 1–3); the PIRLS skills are its process. */
export const CONTENT_SKILLS = NAFS_SKILLS.filter((k) => k.domain !== "PIRLS");
export const PROCESS_SKILL: Record<NafsProcess, string> = { P1: "NAFS.P1", P2: "NAFS.P2", P3: "NAFS.P3", P4: "NAFS.P4" };
export const PROCESS_NAME: Record<NafsProcess, string> = { P1: "Retrieve explicitly stated information", P2: "Make straightforward inferences", P3: "Interpret and integrate ideas and information", P4: "Evaluate and critique content and textual elements" };
/** A question linked only through a PIRLS process gets this content skill. */
export const SKILL_OF_PROCESS: Record<NafsProcess, string> = { P1: "NAFS.RC.DETAIL", P2: "NAFS.IAE.INFER", P3: "NAFS.RC.MAIN", P4: "NAFS.IAE.EVAL" };
export const domainOf = (code: string): NafsDomain => SKILL_BY_CODE.get(code)?.domain ?? "RC";

// ------------------------------------------------------------------ difficulty (the NAFS center shows it, never a grade)

/** 1 = Easy · 2 = Medium · 3 = Hard (inside the NAFS center every question has one; grades are never shown). */
export type Difficulty = 1 | 2 | 3;
export const DIFFICULTIES: Difficulty[] = [1, 2, 3];
export const DIFFICULTY_NAME: Record<Difficulty, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
export const isDifficulty = (v: unknown): v is Difficulty => v === 1 || v === 2 || v === 3;
/** A question's authoring level (1–7) → Easy (1–3) / Medium (4) / Hard (5–7). */
export function difficultyOfLevel(level: unknown): Difficulty {
  const n = Number(level);
  if (!Number.isFinite(n)) return 2;
  return n <= 3 ? 1 : n >= 5 ? 3 : 2;
}
/** Statistics win once a question has enough answers: 75%+ correct = Easy, 40% or less = Hard. */
export const STATS_MIN_ATTEMPTS = 30;
export function difficultyOfStats(attempts: unknown, pValue: unknown): Difficulty | null {
  const a = Number(attempts), p = Number(pValue);
  if (!(a >= STATS_MIN_ATTEMPTS) || pValue === null || pValue === undefined || !Number.isFinite(p)) return null;
  return p >= 0.75 ? 1 : p <= 0.4 ? 3 : 2;
}
/** The authoring level written for a NAFS question of this difficulty (Easy 2, Medium 4, Hard 6). */
export const LEVEL_OF_DIFFICULTY: Record<Difficulty, number> = { 1: 2, 2: 4, 3: 6 };

/** A difficulty mix for a test: percentages of Easy / Medium / Hard (one at 100 = only that difficulty). */
export interface DifficultyMix { 1: number; 2: number; 3: number }

// ------------------------------------------------------------------ the simulation blueprint (PIRLS + ETEC facts)

/** PIRLS framework targets for the four processes (percent of the questions). */
export const PROCESS_TARGET: Record<NafsProcess, number> = { P1: 20, P2: 30, P3: 30, P4: 20 };
export interface SimulationSettings {
  questions: number; minutes: number; passages: number; perPassageMin: number; perPassageMax: number;
  /** vocabulary questions placed with the passages (percent of the questions) */
  vocabularyPct: number;
  process: Record<NafsProcess, number>;
}
export const SIMULATION_DEFAULT: SimulationSettings = { questions: 20, minutes: 35, passages: 3, perPassageMin: 5, perPassageMax: 8, vocabularyPct: 20, process: { ...PROCESS_TARGET } };
export const MAX_NAFS_QUESTIONS = 60;
export const MAX_NAFS_MINUTES = 120;

/** Literary or informational, from a passage's genre text. */
export function textTypeOf(genre: unknown): "LIT" | "INFO" | null {
  const g = String(genre ?? "").toLowerCase();
  if (!g) return null;
  if (/informational|nonfiction|non-fiction|expository|article|biography|report|science|history|procedural|persuasive/.test(g)) return "INFO";
  if (/literary|fiction|story|poem|poetry|drama|narrative|fable|folk|myth|legend|play/.test(g)) return "LIT";
  return null;
}

// ------------------------------------------------------------------ About NAFS (researched facts, teacher-facing)

export const NAFS_SOURCES: { label: string; href: string }[] = [
  { label: "ETEC School Guide NAFS 2026", href: "https://media.etec.gov.sa/media/25ki10x3/school-guide.pdf" },
  { label: "ETEC Student Guide 2024", href: "https://media.etec.gov.sa/media/yh5opvj3/student-guide.pdf" },
  { label: "nafs.etec.gov.sa", href: "https://nafs.etec.gov.sa" },
  { label: "PIRLS framework (IEA / Boston College)", href: "https://pirls2026.org/frameworks" },
];
export const NAFS_FACTS: { title: string; lines: string[] }[] = [
  { title: "Format", lines: ["The Grade 6 NAFS booklet has Reading, Mathematics and Science sections.", "Paper booklet (2026 cycle).", "Multiple choice only, options A–D."] },
  { title: "Language", lines: ["Arabic and/or English depending on the school type: private and international schools can sit it in English.", "This section is the English Reading simulation."] },
  { title: "Timing", lines: ["Each section takes about 35 minutes, with 5-minute breaks.", "Reading section: about 15–20 questions (a setting here: 20 questions, 35 minutes by default)."] },
  { title: "Reading content", lines: ["Reading skills and comprehension.", "Vocabulary meanings, including synonyms and antonyms.", "Classifying words by meaning and form (singular and plural, word families).", "Using words correctly in meaningful sentences and new contexts."] },
  { title: "On the day", lines: ["Students follow the supervisor, read carefully and answer every question (no blanks).", "The online simulation warns about unanswered questions before submitting."] },
  { title: "Results", lines: ["Results are reported to schools and families (Tarteeb scale, the Mustaqbalahum app).", "Here: percentage correct and mastery per skill and process only — no official score bands."] },
];
export const NAFS_SAMPLE = { stem: "What is a synonym for the word 'fleeting'?", options: ["Fixed", "Transitory", "Disturbed", "Authentic"], correct: 1 };

// ------------------------------------------------------------------ seeding

/** Creates the NAFS skills that are missing and links them to the platform families by name (AUTO; ADMIN kept). */
/** One run at a time per data source: two first page views at once must not both insert the same rows. */
const ensuring = new WeakMap<object, Promise<{ skills: number; links: number }>>();
export function ensureNafsFramework(repo: Repo, now = new Date()): Promise<{ skills: number; links: number }> {
  const running = ensuring.get(repo);
  if (running) return running;
  const p = ensureFrameworkOnce(repo, now).finally(() => ensuring.delete(repo));
  ensuring.set(repo, p);
  return p;
}
/** A row another server process inserted meanwhile is not an error. */
const dup = (e: unknown) => /unique|duplicate|P2002/i.test(String((e as Error)?.message ?? e) + String((e as { code?: string })?.code ?? ""));
async function ensureFrameworkOnce(repo: Repo, now: Date): Promise<{ skills: number; links: number }> {
  const have = new Set((await repo.findMany("NafsSkill", {}, { select: ["code"] })).map((r) => String(r.code)));
  let skills = 0;
  for (const [i, k] of NAFS_SKILLS.entries()) if (!have.has(k.code)) {
    try { await repo.create("NafsSkill", { code: k.code, domain: k.domain, name: k.name, process: k.process, sortOrder: i + 1, isActive: true }); skills++; } catch (e) { if (!dup(e)) throw e; }
  }
  const [fams, links] = await Promise.all([
    repo.findMany("SkillFamily", {}, { select: ["id", "name"] }),
    repo.findMany("NafsSkillFamily", {}, { select: ["nafsCode", "familyId"] }),
  ]);
  const linked = new Set(links.map((l) => `${l.nafsCode}|${l.familyId}`));
  const add: { nafsCode: string; familyId: string; source: string; updatedAt: Date }[] = [];
  for (const k of NAFS_SKILLS) for (const f of fams) {
    if (!k.families.test(String(f.name ?? "").trim())) continue;
    if (!linked.has(`${k.code}|${f.id}`)) add.push({ nafsCode: k.code, familyId: String(f.id), source: "AUTO", updatedAt: now });
  }
  if (add.length) {
    try { await repo.createMany("NafsSkillFamily", add); }
    catch (e) { if (!dup(e)) throw e; for (const row of add) { try { await repo.create("NafsSkillFamily", row); } catch (e2) { if (!dup(e2)) throw e2; } } }
  }
  return { skills, links: add.length };
}

// ------------------------------------------------------------------ the Ministry of Education guide (دليل المهارات المستهدفة)

/**
 * Ministry of Education — NAFS target skills guide (دليل المهارات المستهدفة), Grade 6 reading: three content areas and
 * thirteen standards (S01–S13) in the guide's order, adapted for international English Grade 6 reading. The English
 * wording is the source string; the Arabic is the guide's own wording (src/i18n/ar.ts).
 */
export const MOE_CITATION = "Ministry of Education — NAFS target skills guide (دليل المهارات المستهدفة)";
export type MoeArea = "VOC" | "CA" | "EV";
export const MOE_AREAS: { code: MoeArea; n: number; name: string; about: string }[] = [
  { code: "VOC", n: 1, name: "Vocabulary", about: "Infer synonyms and meanings of words in the text; distinguish words of similar meaning with examples; use words, their synonyms and antonyms in meaningful sentences." },
  { code: "CA", n: 2, name: "Comprehension and analysis", about: "Main and supporting ideas, infer facts, interpret, analyze; identify the text type, purpose and function." },
  { code: "EV", n: 3, name: "Evaluation", about: "Evaluate and critique the text, give an opinion on the writer's view, values and attitudes, propose alternatives, use persuasion and reasoning." },
];
export const MOE_AREA_NAME: Record<MoeArea, string> = { VOC: "Vocabulary", CA: "Comprehension and analysis", EV: "Evaluation" };

export interface MoeStandard {
  code: string; n: number; short: string; area: MoeArea; text: string;
  /** the NAFS skills and PIRLS processes this standard is measured with */
  nafs: string[]; pirls: NafsProcess[];
  /** questions per text in the guide's booklet (3; S11 and S12: 1) */
  perBooklet: number;
  /** the guide's sample question types (English adaptation) */
  samples: string[];
}
export const MOE_STANDARDS: MoeStandard[] = [
  { code: "MOE.S01", n: 1, short: "S01", area: "VOC", perBooklet: 3, text: "Identifies synonyms and antonyms of words in the text and explains their meanings.", nafs: ["NAFS.V.SYNANT", "NAFS.V.NEAR"], pirls: ["P1", "P2"], samples: ["Which word is closest in meaning to “…” as it is used in paragraph 2?", "Which word means the opposite of “…”?", "What does the word “…” mean in the text?"] },
  { code: "MOE.S02", n: 2, short: "S02", area: "VOC", perBooklet: 3, text: "Classifies words by meaning, type and number.", nafs: ["NAFS.V.FORMS"], pirls: ["P1"], samples: ["Which word is a noun?", "Is the word “…” singular or plural?", "Which word belongs to the same word family as “…”?"] },
  { code: "MOE.S03", n: 3, short: "S03", area: "VOC", perBooklet: 3, text: "Uses words in meaningful sentences and new contexts.", nafs: ["NAFS.V.CONTEXT", "NAFS.V.FORMS"], pirls: ["P2", "P3"], samples: ["Use the word “…” in a sentence of your own. (short written answer)", "What is the plural of “…”?", "Which sentence is exclamatory?"] },
  { code: "MOE.S04", n: 4, short: "S04", area: "CA", perBooklet: 3, text: "Infers the overall purpose of the text and the main idea of a paragraph.", nafs: ["NAFS.RC.MAIN", "NAFS.IAE.EVAL"], pirls: ["P3", "P4"], samples: ["Which is another good title for the text?", "What is the writer's main purpose?", "What is the main idea of the first paragraph?"] },
  { code: "MOE.S05", n: 5, short: "S05", area: "CA", perBooklet: 3, text: "Answers detail and “why” questions about directly stated information and identifies the text type.", nafs: ["NAFS.RC.DETAIL", "NAFS.P1"], pirls: ["P1"], samples: ["Why did …? (a reason stated in the text)", "What type of text is this (article, story, poem, dialogue)?"] },
  { code: "MOE.S06", n: 6, short: "S06", area: "CA", perBooklet: 3, text: "Identifies the components and elements of the text and orders events, ideas or information as they occur.", nafs: ["NAFS.IAE.ANALYZE", "NAFS.RC.DETAIL"], pirls: ["P1", "P3"], samples: ["What happened before …?", "Who is the narrator of the story?", "Which detail must be considered?"] },
  { code: "MOE.S07", n: 7, short: "S07", area: "CA", perBooklet: 3, text: "Identifies causes, effects and relationships; describes characters' motives and actions.", nafs: ["NAFS.IAE.ANALYZE", "NAFS.IAE.INFER", "NAFS.RC.IMPLIED"], pirls: ["P2", "P3"], samples: ["What caused …?", "Why does the reader want to keep reading?", "How would you describe how … felt?"] },
  { code: "MOE.S08", n: 8, short: "S08", area: "CA", perBooklet: 3, text: "Infers similarities and differences and links causes to effects.", nafs: ["NAFS.IAE.ANALYZE"], pirls: ["P3"], samples: ["How is X different from Y?", "What is the effect of …?", "What do X and Y have in common?"] },
  { code: "MOE.S09", n: 9, short: "S09", area: "EV", perBooklet: 3, text: "Distinguishes given statements, identifies expressive and figurative phrases and gives an opinion on them.", nafs: ["NAFS.IAE.EVAL", "NAFS.V.NEAR"], pirls: ["P4"], samples: ["What do you think of the way the writer presents the ideas?", "Which sentence is exclamatory?", "What does the phrase “…” show?"] },
  { code: "MOE.S10", n: 10, short: "S10", area: "EV", perBooklet: 3, text: "Gives an opinion about the topic and the viewpoints in the text.", nafs: ["NAFS.IAE.EVAL", "NAFS.P4"], pirls: ["P4"], samples: ["Which is the most useful …?", "What made the writer write this text?", "Which feeling is strongest in the text?"] },
  { code: "MOE.S11", n: 11, short: "S11", area: "EV", perBooklet: 1, text: "Judges a given opinion about the completeness or clarity of the information in the text.", nafs: ["NAFS.IAE.EVAL"], pirls: ["P4"], samples: ["Which information is the least clear, in your opinion?"] },
  { code: "MOE.S12", n: 12, short: "S12", area: "EV", perBooklet: 1, text: "Evaluates whether events described by the writer could really happen.", nafs: ["NAFS.IAE.EVAL", "NAFS.IAE.INFER"], pirls: ["P4"], samples: ["Which of these events could really happen?"] },
  { code: "MOE.S13", n: 13, short: "S13", area: "EV", perBooklet: 3, text: "Proposes a title, a different ending and solutions to problems or ideas in the text.", nafs: ["NAFS.RC.MAIN", "NAFS.IAE.EVAL"], pirls: ["P3", "P4"], samples: ["Which title best describes the events?", "Suggest a different ending for the story. (short written answer)", "How can we solve …?"] },
];
export const MOE_CODES = MOE_STANDARDS.map((x) => x.code);
export const MOE_BY_CODE = new Map(MOE_STANDARDS.map((x) => [x.code, x]));
export const isMoeCode = (c: unknown): c is string => MOE_BY_CODE.has(String(c ?? ""));
/** The guide's booklet: 35 questions per text (3 per standard; S11 and S12 one each). */
export const GUIDE_BOOKLET_SIZE = MOE_STANDARDS.reduce((a, x) => a + x.perBooklet, 0);
/** NAFS skill → Ministry standard where the match is sure (the others: a clear stem, or the teacher). */
export const STANDARD_OF_SKILL: Record<string, string> = {
  "NAFS.V.SYNANT": "MOE.S01", "NAFS.V.NEAR": "MOE.S01", "NAFS.V.FORMS": "MOE.S02", "NAFS.V.CONTEXT": "MOE.S03",
  "NAFS.RC.MAIN": "MOE.S04", "NAFS.RC.DETAIL": "MOE.S05",
};
const STEM_RULES: [RegExp, string][] = [
  [/could (really|actually) happen|happen in real life/i, "MOE.S12"],
  [/least clear|not clear enough|information is missing/i, "MOE.S11"],
  [/different ending|another ending|new ending/i, "MOE.S13"],
  [/\b(differ|different from|similar|in common|alike)\b/i, "MOE.S08"],
  [/\b(narrator|who is telling|happened (first|last|before|after)|which event happened|in what order)\b/i, "MOE.S06"],
  [/\b(exclamatory|figurative|simile|metaphor)\b/i, "MOE.S09"],
  [/\b(what caused|cause of|motive)\b/i, "MOE.S07"],
];
/** A question's standard: the teacher's / booklet's choice, else the skill's sure mapping, else a clear stem, else null. */
export function standardFor(explicit: unknown, nafsCode: string, stem?: string | null): string | null {
  if (isMoeCode(explicit)) return String(explicit);
  if (STANDARD_OF_SKILL[nafsCode]) return STANDARD_OF_SKILL[nafsCode];
  const st = String(stem ?? "");
  for (const [re, code] of STEM_RULES) if (re.test(st)) return code;
  return null;
}
export const areaOfStandard = (code: string | null | undefined): MoeArea | null => (code ? MOE_BY_CODE.get(code)?.area ?? null : null);

/** The guide's booklet model, its official option styles, NAFS goals and target grades (About NAFS). */
export const MOE_BOOKLET_MODEL: string[] = [
  "Each model booklet has two texts: an informational text and a literary text (a story with dialogue).",
  "35 questions per text, grouped under the 13 standards in the guide's order: 3 per standard, 1 for S11 and S12.",
  "Multiple choice with options A–D, plus 2 short written answers (S03 “use the word in a sentence”, S13 “suggest a different ending”).",
  "The answer key follows each question in the guide.",
];
export const MOE_OPTION_STYLES = ["All of the above", "A and B", "None of the above"] as const;
export const MOE_GOALS: string[] = [
  "Evaluate students' achievement.",
  "Motivate excellence and positive competition between schools and education offices.",
  "Give detailed reports on achievement and the factors that affect it.",
  "Enable scientific analysis to improve performance.",
  "Measure the indicators of the Human Capability Development Program.",
];
export const MOE_TARGETS: string[] = ["Grade 3 (a sample of schools)", "Grade 6 (all schools)", "Grade 9 (all schools)"];
