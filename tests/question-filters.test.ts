import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { createDraft, listQuestions, publishableIds, updateDraft, getQuestion } from "../src/server/admin/questions";
import { needsPassage, possibleMissingPassage } from "../src/lib/passage-detect";
import { parseTemplateTable, readRow, TEMPLATE_HEADERS } from "../src/imports/questions/template";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

describe("possible missing passage (warning only)", () => {
  test("wording that refers to a text is flagged; self-contained questions are not", () => {
    for (const s of ["According to the passage, why did Omar leave?", "In paragraph 3, what does “restore” mean?", "Which detail from the story shows that Mina is brave?", "What does the author mean by “a sea of faces”?", "At the beginning of the story, where is Saad?", "Reread stanza 2."]) assert.ok(needsPassage(s), s);
    for (const s of ["Which word is a noun?", "Read the sentence: “The cat sat.” What is the verb?", "In the sentence “She ran fast,” which word is an adverb?", "Complete the sentence: The children ____ to school.", "What is the plural of “knife”?"]) assert.ok(!needsPassage(s), s);
    assert.equal(possibleMissingPassage("According to the story, who won?", true), false, "a question with a passage is fine");
  });

  test("the importer warns but still accepts the row", () => {
    const t = parseTemplateTable([[...TEMPLATE_HEADERS], TEMPLATE_HEADERS.map((h) => ({ "Question Text": "According to the passage, why did Sara go to the library?", "Question Type": "Multiple Choice", "Option A": "to read", "Option B": "to sleep", "Correct Answer": "A", Explanation: "x", Grade: "4", Skill: "Theme", Standard: "RL.4.2", "Difficulty Level": "3" } as Record<string, string>)[h] ?? "")]);
    if (!t.ok) throw new Error(t.errors.join());
    const r = readRow(t.rows[0].cells);
    assert.deepEqual(r.errors, []);
    assert.match(r.warnings.join(), /seems to refer to a passage/);
  });
});

describe("question bank filters and pages", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  let skillId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    skillId = String((await repo.findMany("Question", { status: "PUBLISHED" }))[0].skillId);
    const mc = (stem: string, passageText?: string) => createDraft(repo, admin, { skillId, type: "MULTIPLE_CHOICE", stem, level: 3, whyCorrect: "Because.", passageText, options: [{ label: "A", text: "yes", correct: true, rationale: null }, { label: "B", text: "no", correct: false, rationale: "No." }] });
    await mc("According to the passage, what did the fox want?");            // possible missing passage
    await mc("In the story, why was the crow proud?", "The Fox and the Crow\n\nA crow sat in a tree with cheese.");  // has passage
    await mc("Which word is a verb?");                                          // standalone
  });

  test("passage filters: has / none / possible missing", async () => {
    const drafts = (f: object) => listQuestions(repo, admin, { status: "DRAFT", ...f });
    const all = await drafts({});
    assert.equal(all.items.length, 3);
    assert.deepEqual((await drafts({ passage: "has" })).items.map((x) => x.stem), ["In the story, why was the crow proud?"]);
    assert.equal((await drafts({ passage: "none" })).items.length, 2);
    const missing = await drafts({ passage: "missing" });
    assert.deepEqual(missing.items.map((x) => [x.stem, x.possibleMissingPassage]), [["According to the passage, what did the fox want?", true]]);
    assert.equal(missing.total, 1);
    assert.ok(all.items.find((x) => x.stem.startsWith("In the story"))!.hasPassage);
    assert.equal((await drafts({ image: "has" })).items.length, 0);
    assert.equal((await drafts({ image: "none" })).items.length, 3);
  });

  test("type, standard, skill and unit filters; Publish All respects them", async () => {
    const pub = await listQuestions(repo, admin, { status: "PUBLISHED" });
    const tf = await listQuestions(repo, admin, { status: "PUBLISHED", typeCode: "TRUE_FALSE" });
    assert.ok(tf.items.every((x) => x.type === "TRUE_FALSE"));
    assert.equal((await listQuestions(repo, admin, { status: "PUBLISHED", typeCode: "NOPE" })).items.length, 0);
    const q = (await repo.findMany("Question", { status: "PUBLISHED", skillId })).find((x) => x.standardId)!;
    const std = (await repo.findUnique("Standard", { id: q.standardId }))!;
    const short = String(std.code).replace(/^CCSS\.ELA-LITERACY\./, "");
    const byStd = await listQuestions(repo, admin, { status: "PUBLISHED", standardCode: short.toLowerCase() });
    assert.ok(byStd.items.length > 0 && byStd.items.length <= pub.items.length);
    const bySkill = await listQuestions(repo, admin, { status: "PUBLISHED", skillId });
    assert.ok(bySkill.items.every((x) => x.skill === bySkill.items[0].skill));
    const unit = (await repo.findMany("UnitSkill", { skillId }))[0];
    const byUnit = await listQuestions(repo, admin, { status: "PUBLISHED", unitId: String(unit.unitId) });
    assert.ok(byUnit.items.some((x) => x.id === q.id));
    const ids = await publishableIds(repo, admin, { status: "DRAFT", passage: "missing" });
    assert.equal(ids.length, 1, "Publish All with a filter only includes what the filter shows");
  });

  test("real pages: page 2 continues page 1, total covers everything", async () => {
    const all = await listQuestions(repo, admin, { status: "PUBLISHED" });
    const p1 = await listQuestions(repo, admin, { status: "PUBLISHED", limit: 10, page: 1 });
    const p2 = await listQuestions(repo, admin, { status: "PUBLISHED", limit: 10, page: 2 });
    assert.deepEqual([...p1.items, ...p2.items].map((x) => x.id), all.items.slice(0, 20).map((x) => x.id));
    assert.equal(p2.total, all.items.length);
    const s1 = await listQuestions(repo, admin, { status: "PUBLISHED", q: "the", limit: 5, page: 2 });
    assert.deepEqual(s1.items.map((x) => x.id), (await listQuestions(repo, admin, { status: "PUBLISHED", q: "the" })).items.slice(5, 10).map((x) => x.id), "search results page too");
  });

  test("editing: adding a passage clears the warning", async () => {
    const id = (await listQuestions(repo, admin, { status: "DRAFT", passage: "missing" })).items[0].id;
    const d = await getQuestion(repo, admin, id);
    await updateDraft(repo, admin, id, { ...d.input, passageText: "The Fox and the Grapes\n\nA fox wanted some grapes." });
    assert.equal((await listQuestions(repo, admin, { status: "DRAFT", passage: "missing" })).items.length, 0);
  });
});
