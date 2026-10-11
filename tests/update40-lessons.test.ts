/**
 * Update 40 · intervention lessons for every focus skill: every skill family of the curriculum (grammar, language,
 * spelling and writing included) and every Grammar-bank skill has a complete, original lesson; the answer key of each
 * worked example agrees with its clue sentences; the RTI weekly plan no longer falls back for grammar or vocabulary.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { GRAMMAR_NAME_LESSONS, LESSONS, LESSON_BY_FAMILY, ORGANIZERS, lessonFor, lessonForSkill } from "../src/server/lessons/content";
import { LANGUAGE_LESSONS } from "../src/server/lessons/content-language";
import { WRITING_LESSONS } from "../src/server/lessons/content-writing";
import { modelSentences, organizerCompleteness, cleanOrganizer, openLesson, answerModel, beginGuided } from "../src/server/lessons/run";
import { classLessonSkills, scriptCard } from "../src/server/lessons/teacher";
import { rtiWeeklyPlan } from "../src/server/tiers/weekly-plan";
import { loadSkillItems } from "../src/server/practice/items";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const NEW = [...LANGUAGE_LESSONS, ...WRITING_LESSONS];
const norm = (x: string) => x.replace(/\s+/g, " ").trim();

describe("Update 40 · lesson content", () => {
  let repo: SqliteRepo;
  before(async () => { ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 })); });

  test("every skill family of the curriculum (all domains) has a lesson, and families are unique", async () => {
    const fams = await repo.findMany("SkillFamily", {});
    assert.ok(fams.length >= 70, `${fams.length} families`);
    const missing = fams.filter((f) => !s(f.code).startsWith("gr.") && !LESSON_BY_FAMILY.has(s(f.code))).map((f) => s(f.code));
    assert.deepEqual(missing, [], "families without a lesson");
    assert.equal(new Set(LESSONS.map((l) => l.family)).size, LESSONS.length, "one lesson per family");
    for (const f of ["gr.grammar-usage", "gr.mechanics", "gr.writing-revision"]) assert.ok(lessonFor(f), `general lesson for ${f}`);
  });

  test("every assignable focus skill (active skill of a grade's active curriculum) resolves to a lesson", async () => {
    const curs = await repo.findMany("Curriculum", { isActive: true });
    const skills = await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => s(c.id)) }, deletedAt: null });
    const fams = new Map((await repo.findMany("SkillFamily", {})).map((f) => [s(f.id), s(f.code)]));
    const active = skills.filter((k) => k.isActive !== false);
    assert.ok(active.length >= 150, `${active.length} assignable skills`);
    const without = active.filter((k) => !lessonForSkill({ familyCode: fams.get(s(k.familyId)), code: s(k.code), name: s(k.name) })).map((k) => s(k.code));
    assert.deepEqual(without, [], "assignable skills without a lesson");
    const grammar = active.filter((k) => ["GRAMMAR", "LANGUAGE", "VOCABULARY", "WORD_STUDY"].includes(s(k.domain)));
    assert.ok(grammar.length >= 60, "grammar, language and vocabulary skills are covered");
  });

  test("each new lesson is structurally complete (the same checks as the reading lessons) and English only", () => {
    assert.ok(NEW.length >= 35, `${NEW.length} new lessons`);
    for (const l of NEW) {
      const where = `lesson ${l.family}`;
      assert.ok(l.definition.length > 30 && l.steps.length >= 3 && l.steps.length <= 5, where);
      assert.ok(l.thinkAloud.length >= 4 && l.thinkAloud.length <= 6, `${where}: think-aloud`);
      assert.ok(l.signalWords.length >= 3, where);
      const words = l.passage.text.split(/\s+/).length;
      assert.ok(words >= 70 && words <= 170, `${where}: passage of ${words} words`);
      assert.ok(l.passage.clues.length >= 1 && l.passage.clues.every((c) => l.passage.text.includes(c)), `${where}: clues are sentences of the passage`);
      assert.ok(l.worked.question && l.worked.answer && l.worked.why, where);
      assert.ok(l.organizer === "NONE" || ORGANIZERS[l.organizer], where);
      assert.notEqual(l.reteach[0].title, l.reteach[1].title, `${where}: two different re-teach approaches`);
      assert.ok(l.frames.length === 2 && l.frames.every((f) => f.includes("___")), `${where}: sentence frames`);
      assert.ok(l.warmUp.length > 20, where);
      const all = JSON.stringify(l);
      assert.doesNotMatch(all, /[؀-ۿ]/, `${where}: no Arabic script in the lesson UI`);
      assert.doesNotMatch(all, /lexile/i, where);
      assert.doesNotMatch(all, /wonders|mcgraw/i, `${where}: no publisher material`);
    }
  });

  test("answer keys agree with the clue sentences: each clue is one choosable sentence; a quoted sentence in the answer is a clue", () => {
    for (const l of NEW) {
      const where = `lesson ${l.family}`;
      const choices = modelSentences(l).map(norm);
      for (const c of l.passage.clues) assert.ok(choices.includes(norm(c)), `${where}: the clue “${c}” is exactly one of the choices`);
      // the worked answer quotes the right choice (or names the antecedent found in it)
      const quoted = choices.filter((x) => x.length > 12 && norm(l.worked.answer).includes(x.replace(/^"|"$/g, "")));
      assert.ok(quoted.length >= 1 || l.family === "pronouns", `${where}: the answer quotes the clue sentence`);
      for (const q of quoted) assert.ok(l.passage.clues.map(norm).includes(q), `${where}: “${q}” in the answer is also a clue`);
      // a wrong pick exists (the worked example is a real choice)
      assert.ok(choices.length - l.passage.clues.length >= 5, `${where}: enough wrong choices`);
    }
    // the pronoun lesson: the antecedent named in the answer is in the clue sentence
    const pr = lessonFor("pronouns")!;
    assert.ok(pr.passage.clues[0].includes(pr.worked.answer));
  });

  test("the two new organizers work like the others", () => {
    for (const k of ["RULE_EXAMPLES", "SENTENCE_FIX"] as const) {
      const spec = ORGANIZERS[k];
      assert.equal(organizerCompleteness(spec, cleanOrganizer(spec, {})).complete, false);
      const full = cleanOrganizer(spec, { head: "Use is with one", rows: [spec.columns.map(() => "an example"), spec.columns.map(() => "another one")] });
      assert.equal(organizerCompleteness(spec, full).complete, true, k);
    }
    assert.ok(NEW.some((l) => l.organizer === "RULE_EXAMPLES") && NEW.some((l) => l.organizer === "SENTENCE_FIX"));
  });

  test("Grammar-bank skills get the lesson their name points to; unknown names get their kind's general lesson", () => {
    const cases: [string, string, string][] = [
      ["gr.grammar-usage", "Irregular Verbs: Past Tense", "irregular-verbs"],
      ["gr.grammar-usage", "Subject-Verb Agreement", "subject-verb-agreement"],
      ["gr.grammar-usage", "Order of Adjectives", "adjectives"],
      ["gr.grammar-usage", "Articles a, an, the", "adjectives"],
      ["gr.grammar-usage", "Adverbs That Tell How, When, Where", "adverbs"],
      ["gr.grammar-usage", "Comparing with Good (better, best)", "comparatives"],
      ["gr.grammar-usage", "Statements, Questions, Commands, and Exclamations", "sentences"],
      ["gr.grammar-usage", "Pronoun Homophones (its/it's, their/there/they're, your/you're)", "pronoun-homophones"],
      ["gr.grammar-usage", "Present Perfect Tense", "verb-tenses"],
      ["gr.grammar-usage", "Prepositions and Prepositional Phrases", "prepositions"],
      ["gr.grammar-usage", "Linking Verbs", "verbs"],
      ["gr.grammar-usage", "Irregular Plural Nouns", "plural-nouns"],
      ["gr.grammar-usage", "Complete Sentences", "sentences"],
      ["gr.mechanics", "Commas in a Series", "commas"],
      ["gr.mechanics", "Capital Letters", "capitalization"],
      ["gr.mechanics", "Quotation Marks for Direct Speech", "quotations-dialogue"],
      ["gr.mechanics", "Punctuating Titles", "titles-abbreviations"],
      ["gr.mechanics", "Contractions with Verbs", "apostrophes-contractions"],
      ["gr.writing-revision", "Avoiding Double Negatives", "negatives"],
      ["gr.writing-revision", "Correcting Fragments and Run-Ons", "fragments-run-ons"],
      ["gr.writing-revision", "Formal and Informal English", "precise-language"],
      ["gr.writing-revision", "Revising and Editing a Draft", "gr.writing-revision"],
      ["gr.mechanics", "Something New", "gr.mechanics"],
    ];
    for (const [fam, name, want] of cases) assert.equal(lessonForSkill({ familyCode: fam, code: "G4.grammar.g4-u9w9-s1", name })?.family, want, name);
    assert.equal(lessonForSkill({ familyCode: "gr.grammar-usage", code: "G5.grammar.x", name: "TEST Complete Sentences" })?.family, "sentences", "the sim's TEST prefix is ignored");
    // a curriculum skill keeps its own family's lesson, whatever its name says
    assert.equal(lessonForSkill({ familyCode: "theme", code: "G4.theme", name: "Commas and verbs" })?.family, "theme");
    assert.equal(lessonForSkill({ familyCode: "nope", code: "G4.nope", name: "Commas" }), null, "no name guessing outside the Grammar bank");
    for (const [, f] of GRAMMAR_NAME_LESSONS) assert.ok(lessonFor(f), `alias target ${f} has a lesson`);
  });
});

describe("Update 40 · lessons in use (student, teacher, RTI plan)", () => {
  let repo: SqliteRepo; let teacher: Actor; let student: Actor; let classId: string; let schoolId: string;
  const NOW = new Date("2026-10-12T08:00:00Z");
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [student, teacher] = await Promise.all(["test.student.001", "test.teacher.1"].map(a));
    classId = s((await repo.findMany("ClassMembership", { studentId: student.studentId!, leftAt: null }))[0].classId);
    schoolId = s((await repo.findUnique("Class", { id: classId }))!.schoolId);
  });


  const gradeSkill = async (suffix: string) => {
    const klass = await repo.findUnique("Class", { id: classId });
    const curs = await repo.findMany("Curriculum", { gradeId: klass!.gradeId, isActive: true });
    return (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => s(c.id)) } })).find((k) => s(k.code).endsWith(suffix))!;
  };

  test("teachers can assign and print a script card for grammar and vocabulary skills", async () => {
    const list = await classLessonSkills(repo, teacher, classId);
    for (const f of ["subject-verb-agreement", "adjectives", "prepositions", "commas", "context-clues", "prefixes"]) assert.ok(list.some((k) => k.family === f), `${f} is in the class's lesson list`);
    const sva = await gradeSkill(".subject-verb-agreement");
    const card = await scriptCard(repo, teacher, classId, s(sva.id));
    assert.match(card.model.definition, /agree/);
    assert.equal(card.check.reteach.length, 2);
  });

  test("a student can take a grammar lesson: worked example (clue sentence) → guided practice with bank items of the skill", async () => {
    // the first grammar skill of the grade that has published bank questions
    const klass = await repo.findUnique("Class", { id: classId });
    const curs = await repo.findMany("Curriculum", { gradeId: klass!.gradeId, isActive: true });
    const grammar = (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => s(c.id)) }, domain: "GRAMMAR" })).sort((a, b) => s(a.code).localeCompare(s(b.code)));
    let sk = grammar[0];
    for (const k of grammar) if ((await loadSkillItems(repo, s(k.id))).length) { sk = k; break; }
    assert.ok((await loadSkillItems(repo, s(sk.id))).length, "a grammar skill with bank questions");
    const v = await openLesson(repo, student, s(sk.id), NOW);
    assert.equal(v.phase, "MODEL");
    const l = lessonForSkill({ code: s(sk.code), name: s(sk.name) })!;
    assert.ok(LANGUAGE_LESSONS.includes(l), `${s(sk.code)} uses a new grammar lesson`);
    const pick = v.model.sentences.findIndex((x) => norm(x) === norm(l.passage.clues[0]));
    assert.ok(pick >= 0);
    const after = await answerModel(repo, student, v.runId, pick, NOW);
    assert.equal(after.model.correct, true);
    const g = await beginGuided(repo, student, v.runId, NOW);
    assert.equal(g.phase, "GUIDED");
    const q = await repo.findUnique("Question", { id: g.question!.questionId });
    assert.equal(s(q!.skillId), s(sk.id), "guided practice uses the skill's own bank questions");
  });

  test("RTI weekly plan: grammar and vocabulary focus skills get a lesson, no fallback", async () => {
    const studs = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => s(m.studentId));
    const focus = [await gradeSkill(".subject-verb-agreement"), await gradeSkill(".commas"), await gradeSkill(".greek-latin-roots")];
    for (const [i, st] of studs.slice(0, 3).entries()) await repo.upsert("StudentTier", { studentId: st }, { schoolId, tier: 2, source: "AUTO", reason: "TEST reason", focusSkillId: s(focus[i].id), since: NOW, reviewAt: NOW, monitorEveryDays: 14 }, { tier: 2, focusSkillId: s(focus[i].id) });
    const p = await rtiWeeklyPlan(repo, teacher, classId, NOW);
    const withFocus = p.groups.filter((g) => g.focusSkillId);
    assert.equal(withFocus.length, 3);
    for (const g of withFocus) { assert.ok(g.lesson, g.label); assert.equal(g.fallback, null, g.label); }
  });
});
