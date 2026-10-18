/**
 * Taxonomy fixes and the reading / word-study tags:
 *   family mappings (no "Homographs" → text-features), Grade 6 lesson skills, QAR / thinking / clue-type estimators,
 *   spelling patterns, the added misconception codes and their tutor templates, the AI tag validator, and the
 *   database side (analyzeQuestions fills the tags, keeps a person's value; accuracyByTag).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { planCurriculum, type GradeFile, type Taxonomy } from "../src/imports/curriculum/plan";
import {
  detectSpellingPatterns, estimateClueType, estimateLiteracyTags, estimateQar, estimateThinking, inflectionRule, mergeLiteracyTags, metadataGaps, META_FIELDS, spellingPattern,
} from "../src/questions/intelligence";
import { classifyMisconception, MISCONCEPTIONS } from "../src/insights/misconceptions";
import { tutorFeedback, tutorLeaksAnswer } from "../src/tutor/tutor";
import { tagValidator, tagPrompt } from "../src/server/ai/tools";
import { accuracyByTag, analyzeQuestions } from "../src/server/questions/intelligence";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { resolveActor } from "../src/server/auth/actor";

const ROOT = join(__dirname, "..");
const dataDir = join(ROOT, "data", "curriculum");
const tax = JSON.parse(readFileSync(join(dataDir, "taxonomy.json"), "utf8")) as Taxonomy;
const grades = [4, 5, 6].map((g) => JSON.parse(readFileSync(join(dataDir, `grade-${g}.json`), "utf8")) as GradeFile);
const ixl = JSON.parse(readFileSync(join(dataDir, "ixl-reference.json"), "utf8")) as { externalName: string; familyCode: string | null }[];

describe("📚 curriculum family mappings", () => {
  const links = grades.flatMap((g) => g.units.flatMap((u) => [...u.lessons.flatMap((l) => l.skills), ...(u.unitSkills ?? [])]));

  test("no vocabulary strategy is mapped to text features (substring matches like homoGRAPHs, paraGRAPH)", () => {
    const bad = links.filter((l) => l.familyCode === "text-features" && /homograph|homophone|context clue|paragraph clue/i.test(l.label));
    assert.deepEqual(bad.map((l) => l.label), []);
    const label = (x: string) => links.filter((l) => l.label === x).map((l) => l.familyCode);
    assert.ok(label("Homographs").length >= 3 && label("Homographs").every((f) => f === "homographs-homophones"));
    assert.deepEqual([...new Set(label("Homophones and Homographs"))], ["homographs-homophones"]);
    assert.deepEqual([...new Set(label("Context Clues: Paragraph Clues"))], ["context-clues"]);
    assert.deepEqual([...new Set(label("Commands and Exclamations"))], ["sentences"], "“commands” is not “commas”");
    assert.ok(links.filter((l) => l.familyCode === "text-features").every((l) => /diagram|heading|caption|photograph|graph|chart|map|sidebar|primary|print|pronunciation/i.test(l.label)));
  });

  test("IXL names are matched on whole words too", () => {
    const fam = (n: string) => ixl.find((r) => r.externalName === n)?.familyCode;
    assert.equal(fam("What does the punctuation suggest?"), "commas", "punctuation is not a pun");
    assert.equal(fam("Form and use irregular plurals"), "plural-nouns", "“form and” is not poetry");
    assert.equal(fam("Capitalizing the names of places and geographic features"), "capitalization", "geoGRAPHic");
    assert.ok(!ixl.some((r) => r.familyCode === "poetry-elements" && /^form and use/i.test(r.externalName)));
  });

  test("the committed data matches the fixed matcher (re-running the remap changes nothing)", (t) => {
    let out: string;
    try { out = execFileSync("python3", ["-I", join(ROOT, "scripts/normalize/remap_families.py"), "--check"], { encoding: "utf8" }); }
    catch (e) { const err = e as { code?: string; stdout?: string }; if (err.code === "ENOENT") return t.skip("python3 not installed"); out = String(err.stdout ?? ""); }
    assert.match(out, /^0 change\(s\)/m, out);
  });
});

describe("📚 Grade 6 lesson skills", () => {
  test("every Grade 6 lesson has at least one skill, all from its own unit", () => {
    const g6 = grades[2];
    for (const u of g6.units) {
      const pool = new Set((u.unitSkills ?? []).map((s) => s.familyCode));
      for (const l of u.lessons) {
        assert.ok(l.skills.length >= 1, `${l.code} has no skills`);
        for (const s of l.skills) assert.ok(pool.has(s.familyCode), `${l.code}: ${s.familyCode} is not in unit ${u.number}`);
      }
    }
    // curriculum-map skills are used where the selection appears there (Amigo Brothers: theme, text evidence)
    const amigo = g6.units.flatMap((u) => u.lessons).find((l) => l.title === "Amigo Brothers")!;
    assert.ok(["theme", "text-evidence"].every((f) => amigo.skills.some((s) => s.familyCode === f)));
    // genre-only skills land on a poem / play, not on a random selection
    const poetry = g6.units.flatMap((u) => u.lessons).filter((l) => l.skills.some((s) => s.familyCode === "poetry-elements")).map((l) => l.title);
    assert.ok(poetry.includes("Famous") && !poetry.includes("The Treasure of Lemon Brown"), poetry.join(" | "));
  });

  test("the planner rejects a lesson with zero skills and accepts the real files", () => {
    for (const f of grades) assert.deepEqual(planCurriculum(tax, f).errors, [], `grade ${f.grade}`);
    const g6 = grades[2];
    const broken: GradeFile = { ...g6, units: [{ ...g6.units[0], lessons: [{ ...g6.units[0].lessons[0], skills: [] }] }] };
    assert.match(planCurriculum(tax, broken).errors.join("\n"), /G6-U1-L1 .* has no skills/);
    const plan = planCurriculum(tax, g6);
    assert.ok(plan.lessonSkills.length >= plan.lessons.length);
  });
});

describe("🏷️ QAR, thinking and context-clue estimators (original example stems)", () => {
  test("QAR from the wording and the skill", () => {
    assert.equal(estimateQar("G4.ask-answer-questions", "According to paragraph 2, where did the turtles lay their eggs?"), "RIGHT_THERE");
    assert.equal(estimateQar("G4.text-features", "Which heading tells where the market is?"), "RIGHT_THERE");
    assert.equal(estimateQar("G5.central-idea", "What is the central idea of the article about desert gardens?"), "THINK_AND_SEARCH");
    assert.equal(estimateQar("G5.sequence", "Which event happens after the storm passes?"), "THINK_AND_SEARCH");
    assert.equal(estimateQar("G4.inference", "What can the reader infer about why Noor hid the letter?"), "AUTHOR_AND_ME");
    assert.equal(estimateQar("G6.theme", "Which sentence best states the lesson Faris learns?"), "AUTHOR_AND_ME");
    assert.equal(estimateQar("G4.inference", "Have you ever had to wait a long time for something you wanted? Explain."), "ON_MY_OWN");
    assert.equal(estimateQar("G4.verbs", "Which word is a verb?"), null, "grammar items get no QAR");
    assert.equal(estimateQar("G5.context-clues", "What does sturdy mean?"), null);
  });

  test("level of thinking", () => {
    assert.equal(estimateThinking("G4.ask-answer-questions", "According to the article, how many eggs does the turtle lay?"), "LOCATE");
    assert.equal(estimateThinking("G5.summarize", "Which TWO details belong in a summary of the story?"), "COMBINE");
    assert.equal(estimateThinking("G4.character", "How does Sami feel when his friend moves away?"), "CONNECT");
    assert.equal(estimateThinking("G6.author-purpose", "Why does the author begin the article with a question?"), "ANALYZE");
    assert.equal(estimateThinking("G5.compare-contrast", "How is the second paragraph organized?"), "ANALYZE");
  });

  test("context-clue type", () => {
    const c = (stem: string, passage?: string) => estimateClueType("G5.context-clues", stem, { passage });
    assert.equal(c("Read: “A nomad, or a person who moves from place to place, does not live in one house.” What does nomad mean?"), "RESTATEMENT");
    assert.equal(c("Read: “Citrus fruits, such as lemons, limes and oranges, grow well here.” What does citrus mean?"), "EXAMPLE");
    assert.equal(c("Read: “Unlike his timid brother, Yusuf was bold and spoke first.” What does timid mean?"), "ANTONYM");
    assert.equal(c("Read: “The road was so treacherous that three cars slid off it.” What does treacherous mean?"), "CAUSE_EFFECT");
    assert.equal(c("Read: “A fossil is the hardened remains of a plant or animal from long ago.” What does fossil mean?"), "DEFINITION");
    assert.equal(c("Read: “Just as a bee is busy all day, the industrious baker never stopped working.” What does industrious mean?"), "COMPARISON");
    assert.equal(c("Which sentence in the paragraph helps you understand the word scarce? Use the paragraph clues."), "PARAGRAPH");
    assert.equal(c("In the article, what does drought mean?", "Farmers waited for rain. Because of the drought, the wells were empty and the crops dried up."), "CAUSE_EFFECT", "the passage sentence holding the word");
    assert.equal(c("Read: “Her grandmother was very elderly.” What does elderly mean?"), "NONE");
    assert.equal(estimateClueType("G4.verbs", "What does ran mean?"), null);
  });

  test("tags are listed as metadata and only required where they apply", () => {
    for (const k of ["qar", "thinking", "clueType", "pattern"]) assert.ok(META_FIELDS.some((f) => f.key === k), k);
    const q = { skillId: "s", standardId: "x", mapInstructionalArea: "a", difficultyLevel: 4, dok: 2, lexile: null, textLevel: 600, tags: null, stem: "What is the theme?" };
    assert.deepEqual(metadataGaps(q, [], true), [], "no context: unchanged behaviour");
    assert.deepEqual(metadataGaps(q, [], true, { family: "G4.theme" }), ["qar", "thinking"]);
    assert.deepEqual(metadataGaps({ ...q, tags: { qar: "AUTHOR_AND_ME", thinking: "CONNECT" } }, [], true, { family: "G4.theme" }), []);
    assert.deepEqual(metadataGaps(q, [], true, { family: "G4.context-clues" }), ["clueType"]);
    assert.deepEqual(metadataGaps(q, [], true, { family: "G4.spelling" }), ["pattern"]);
    assert.deepEqual(metadataGaps(q, [], true, { family: "G4.adverbs" }), []);
  });

  test("a person's value is never replaced by the rules", () => {
    const person = mergeLiteracyTags({ qar: "RIGHT_THERE", dok: 2 }, { qar: "AUTHOR_AND_ME", thinking: "CONNECT" });
    assert.equal(person.tags.qar, "RIGHT_THERE");
    assert.equal(person.tags.thinking, "CONNECT");
    assert.equal(person.tags.dok, 2, "other tags are kept");
    const rule = mergeLiteracyTags(person.tags, { thinking: "ANALYZE" });
    assert.equal(rule.tags.thinking, "ANALYZE", "a rule value can be refreshed by the rules");
    assert.deepEqual(mergeLiteracyTags(rule.tags, { thinking: "ANALYZE" }).changed, [], "idempotent");
    assert.equal(mergeLiteracyTags(rule.tags, { qar: "nonsense" }).changed.length, 0, "invalid values are ignored");
  });
});

describe("🔤 spelling patterns", () => {
  test("words → patterns", () => {
    const main = (w: string) => detectSpellingPatterns(w)[0];
    assert.equal(main("cat"), "SHORT_VOWEL");
    assert.equal(main("cake"), "LONG_VOWEL");
    assert.equal(main("rain"), "VOWEL_TEAM");
    assert.equal(main("snow"), "VOWEL_TEAM");
    assert.equal(main("bird"), "R_CONTROLLED");
    assert.equal(main("coin"), "DIPHTHONG");
    assert.equal(main("cloud"), "DIPHTHONG");
    assert.equal(main("town"), "DIPHTHONG");
    assert.equal(main("knee"), "SILENT_LETTER");
    assert.equal(main("lamb"), "SILENT_LETTER");
    assert.equal(main("city"), "SOFT_C_G");
    assert.equal(main("giant"), "SOFT_C_G");
    assert.equal(main("napkin"), "SYLLABLE_TYPES");
    assert.equal(main("skipping"), "INFLECTION_CHANGE");
    assert.equal(main("babies"), "INFLECTION_CHANGE");
  });

  test("inflection rules and item-level pattern", () => {
    assert.deepEqual(["skip,ing", "bake,ing", "pony,es", "play,ed", "jump,ed", "knife,s"].map((x) => inflectionRule(...(x.split(",") as [string, string]))), ["DOUBLING_RULE", "DROP_E", "Y_TO_I", null, null, "F_TO_V"]);
    assert.equal(spellingPattern({ stem: "Add -ed to the word plan: “We ____ a picnic.”", answers: ["planned"] }), "INFLECTION_CHANGE");
    assert.equal(spellingPattern({ stem: "Which word is spelled correctly?", options: [{ text: "trane", correct: false }, { text: "train", correct: true }, { text: "trayn", correct: false }] }), "VOWEL_TEAM");
    assert.equal(spellingPattern({ stem: "Which sentence has every word spelled correctly?", options: [{ text: "I wrote a note.", correct: true }, { text: "I rote a note.", correct: false }] }), "SILENT_LETTER");
    assert.deepEqual(estimateLiteracyTags({ skillCode: "G4.spelling", stem: "Which word is spelled correctly?", options: [{ text: "berd", correct: false }, { text: "bird", correct: true }] }), { pattern: "R_CONTROLLED" });
  });
});

describe("🧩 added misconception codes", () => {
  const NEW = ["EVIDENCE_MISMATCH", "WRONG_SENSE", "FALSE_SPLIT", "POS_MISMATCH", "CONNOTATION_POLARITY", "EXAMPLE_NOT_CATEGORY",
    "L1_THIRD_PERSON_S", "L1_MISSING_BE", "L1_ARTICLE", "L1_ADJ_ORDER", "L1_PLURAL_AFTER_NUMBER", "L1_TENSE_PRESENT_FOR_FUTURE", "L1_PREPOSITION", "L1_PRESENT_PERFECT",
    "L1_P_B", "L1_V_F", "L1_SHORT_VOWEL", "L1_CLUSTER", "L1_SILENT_LETTER", "VOWEL_TEAM", "R_CONTROLLED", "DOUBLING_RULE", "DROP_E", "Y_TO_I"];

  test("exist with a label and a teaching move; codes are unique", () => {
    for (const c of NEW) assert.ok(MISCONCEPTIONS.some((m) => m.code === c && m.label && m.fix.length > 20), c);
    assert.equal(new Set(MISCONCEPTIONS.map((m) => m.code)).size, MISCONCEPTIONS.length);
    assert.ok(MISCONCEPTIONS.some((m) => m.code === "LITERAL_MEANING"), "literal idioms reuse LITERAL_MEANING");
    assert.ok(MISCONCEPTIONS.every((m) => m.code.length <= 40), "fits QuestionOption.misconception");
  });

  test("classified from rationale cues", () => {
    const cases: [string, string, string][] = [
      ["G5.text-evidence", "This sentence is about the same topic but does not prove the answer in Part A.", "EVIDENCE_MISMATCH"],
      ["G4.multiple-meaning", "That is another meaning of the word, not the one in this sentence.", "WRONG_SENSE"],
      ["G4.prefixes", "The letters “un” in uncle are not a prefix here.", "FALSE_SPLIT"],
      ["G5.context-clues", "In this sentence the word is used as a verb, not a noun.", "POS_MISMATCH"],
      ["G5.synonyms-antonyms", "Nosy has a negative feeling; the writer admires her.", "CONNOTATION_POLARITY"],
      ["G4.synonyms-antonyms", "A hammer is only an example of a tool.", "EXAMPLE_NOT_CATEGORY"],
      ["G4.idioms-adages", "This reads the phrase word for word.", "LITERAL_MEANING"],
      ["G4.subject-verb-agreement", "With he/she/it the verb needs an -s ending.", "L1_THIRD_PERSON_S"],
      ["G4.verbs", "The sentence is missing “is” — English needs a verb here.", "L1_MISSING_BE"],
      ["G4.adjectives", "This has an extra article before a general noun.", "L1_ARTICLE"],
      ["G4.adjectives", "In English the adjective comes before the noun, not after the noun.", "L1_ADJ_ORDER"],
      ["G4.plural-nouns", "After a number like three, the noun must be plural.", "L1_PLURAL_AFTER_NUMBER"],
      ["G5.verb-tenses", "Tomorrow is in the future, so the sentence needs “will”.", "L1_TENSE_PRESENT_FOR_FUTURE"],
      ["G5.prepositions", "Wrong preposition: we say good at, not good in.", "L1_PREPOSITION"],
      ["G6.verb-tenses", "With since, use the present perfect.", "L1_PRESENT_PERFECT"],
      ["G4.spelling", "This writes b instead of p.", "L1_P_B"],
      ["G4.spelling", "This uses f instead of v.", "L1_V_F"],
      ["G4.spelling", "The short vowel is missing.", "L1_SHORT_VOWEL"],
      ["G4.spelling", "An extra vowel was added between the consonants of the blend.", "L1_CLUSTER"],
      ["G4.spelling", "The silent k is missing.", "L1_SILENT_LETTER"],
      ["G4.spelling", "Wrong vowel team: ai is used in the middle of a word.", "VOWEL_TEAM"],
      ["G5.spelling", "This uses ir instead of ur.", "R_CONTROLLED"],
      ["G4.spelling", "Double the final consonant before -ing.", "DOUBLING_RULE"],
      ["G4.spelling", "Drop the silent e before adding -ing.", "DROP_E"],
      ["G4.spelling", "Change y to i before adding -es.", "Y_TO_I"],
    ];
    for (const [fam, why, code] of cases) assert.equal(classifyMisconception(fam, why), code, `${fam}: ${why}`);
  });

  test("every existing family still classifies as before (defaults and cues)", () => {
    assert.equal(classifyMisconception("G4.theme", "This is a detail about wind, not the lesson of the story."), "DETAIL_NOT_MAIN");
    assert.equal(classifyMisconception("G5.context-clues", "Height is not mentioned."), "CONTEXT_IGNORED");
    assert.equal(classifyMisconception("pronouns", "Students and they are both third person."), "PRONOUN_REFERENCE", "“third person” alone is not the -s error");
    assert.equal(classifyMisconception("G5.fragments-run-ons", "This has no verb."), "SENTENCE_BOUNDARY");
    assert.equal(classifyMisconception("G6.spelling", "Misspelled."), "SPELLING");
    assert.equal(classifyMisconception("G4.multiple-meaning", null), "WRONG_SENSE", "family default");
    for (const f of tax.families) assert.ok(classifyMisconception(`G4.${f.code}`, null) !== undefined);
  });

  test("a tutor template for every code, which never gives the answer away", () => {
    const answers = ["She is happy.", "walks", "skipping", "a red car", "will visit", "good at", "has lived", "knee", "bird", "rain", "the outer covering of a tree", "unhappy", "curious"];
    for (const m of MISCONCEPTIONS) {
      const fb = tutorFeedback({ misconception: m.code, band: "ON", repeated: 1, rationale: null, tip: null, hint: null, hasPassage: false, correctTexts: answers });
      assert.notEqual(fb.message, "Not this one — let's look again together.", `${m.code} has its own template`);
      assert.ok(fb.guidingQuestion.length > 10 && fb.example.length > 10, m.code);
      assert.equal(tutorLeaksAnswer(fb, answers), false, m.code);
    }
  });
});

describe("🤖 AI tag prompt and validator", () => {
  const ctx = { grade: 4, skills: [{ code: "G4.theme", title: "Theme" }], standards: [{ code: "RL.4.2", text: "" }], goalAreas: ["Literary Text"] };
  const q = { id: "q1", type: "MULTIPLE_CHOICE", stem: "What is the theme?", options: [], passage: null, skillId: "s", standardId: null, difficulty: 4, status: "DRAFT" };
  test("asks for qar / thinking / clueType / pattern and keeps only allowed values", () => {
    const p = tagPrompt(ctx, [{ ...q, currentSkill: "G4.theme", currentStandard: null }]);
    assert.match(p.system, /THINK_AND_SEARCH/);
    assert.ok(Array.isArray((p.user.allowed as Record<string, unknown>).clueTypes));
    const base = { id: "q1", skillCode: "G4.theme", standard: "RL.4.2", goalArea: "Literary Text", level: "ON", difficulty: 4 };
    const ok = tagValidator(ctx, [q])({ results: [{ ...base, qar: "author_and_me", thinking: "CONNECT", clueType: "MAGIC" }] });
    assert.ok(ok.ok);
    if (ok.ok) { assert.equal(ok.value[0].qar, "AUTHOR_AND_ME"); assert.equal(ok.value[0].thinking, "CONNECT"); assert.equal(ok.value[0].clueType, undefined, "unknown value dropped"); }
  });
});

describe("🗄️ analyzeQuestions fills the tags; accuracy per QAR type", () => {
  let repo: SqliteRepo; let schoolId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "light" as never });
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    schoolId = String(admin.schoolId);
  });

  test("rules fill the tags, a person's value stays", async () => {
    const theme = (await repo.findMany("Skill", { code: "G4.theme" })).map((k) => k.id);
    const q0 = (await repo.findMany("Question", { skillId: { in: theme } }))[0];
    await repo.updateMany("Question", { id: q0.id }, { tags: { qar: "RIGHT_THERE" } });
    const r = await analyzeQuestions(repo, schoolId, { limit: 10000, force: true });
    assert.ok(r.analysed > 100 && (r.literacyTagged ?? 0) > 50, JSON.stringify(r));
    const after = (await repo.findUnique("Question", { id: q0.id }))!;
    const t = (typeof after.tags === "string" ? JSON.parse(after.tags) : after.tags) as Record<string, unknown>;
    assert.equal(t.qar, "RIGHT_THERE", "the person's value is kept");
    assert.ok(t.thinking, "the missing tag is filled");
    const all = await repo.findMany("Question", {}, { select: ["tags"] });
    const tagged = (k: string) => all.filter((x) => { const v = (typeof x.tags === "string" ? JSON.parse(x.tags) : x.tags) as Record<string, unknown> | null; return v && v[k]; }).length;
    assert.ok(tagged("qar") > 50 && tagged("clueType") > 3 && tagged("pattern") > 3, `qar ${tagged("qar")} clue ${tagged("clueType")} pattern ${tagged("pattern")}`);
  });

  test("accuracyByTag reports accuracy per QAR type", async () => {
    const students = (await repo.findMany("Student", {}, { select: ["id"] })).map((x) => String(x.id));
    const rows = await accuracyByTag(repo, students, "qar");
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.ok(["RIGHT_THERE", "THINK_AND_SEARCH", "AUTHOR_AND_ME", "ON_MY_OWN"].includes(r.value));
      assert.ok(r.accuracy >= 0 && r.accuracy <= 100 && r.correct <= r.answers && r.students >= 1);
    }
    assert.deepEqual(await accuracyByTag(repo, [], "qar"), []);
  });
});
