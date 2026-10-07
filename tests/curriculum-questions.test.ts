import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { attachmentNodes, resolveMapLocation } from "../src/server/curriculum-map/questions";
import { analyzeImport, commitImportChunk, getImportJob } from "../src/server/admin/question-import";
import { createDraft, getQuestion, listQuestions, updateDraft } from "../src/server/admin/questions";
import { deleteQuestions } from "../src/server/admin/question-delete";
import { CURRICULUM_TEMPLATE_HEADERS, TEMPLATE_HEADERS } from "../src/imports/questions/template";
import { CURRICULUM_SHEET_HEADERS, curriculumTemplateRows, curriculumTemplateXlsx } from "../src/imports/questions/template-files";
import { extract } from "../src/imports/questions/extract";
import { demoDatabase } from "./helpers/db";

const WORDS = ["river", "lantern", "meadow", "harbor", "canyon", "orchard", "glacier", "market", "village", "forest", "desert", "island", "valley", "bridge", "castle", "garden", "pebble", "thunder", "compass", "feather", "marble", "violin", "rocket", "saddle", "tunnel", "whistle", "anchor", "basket", "cactus", "dolphin", "engine"];
const csvOf = (headers: readonly string[], rows: Record<string, string>[]) =>
  new TextEncoder().encode([headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n");
const base = { "Question Type": "Multiple Choice", "Option A": "first", "Option B": "second", "Option C": "third", "Option D": "fourth", "Correct Answer": "A", Explanation: "Because the text says so." };

describe("questions on the Curriculum Map: import to Curriculum, import to Bank (with uses), editor", () => {
  let repo: SqliteRepo; let admin: Actor; let schoolId: string;
  const linksOf = async (qid: string) => {
    const l = await repo.findMany("QuestionMapLink", { questionId: qid });
    return l.length ? String((await repo.findUnique("CurriculumMapNode", { id: l[0].nodeId }))!.code) : null;
  };
  const commitAll = async (jobId: string) => { for (let i = 0; i < 20; i++) { const p = await commitImportChunk(repo, admin, jobId, { publish: true }); if (p.done) return p; } throw new Error("not done"); };
  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = admin.schoolId!;
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId });
  });

  test("the place is found from numbers, titles or the ID; wrong places are explained", async () => {
    const nodes = await attachmentNodes(repo, schoolId);
    assert.equal(nodes.length, 344);
    const r = (grade: number, x: Record<string, string>) => resolveMapLocation(nodes, grade, x);
    assert.equal(r(4, { unit: "1", set: "1", category: "Concept Vocabulary" }).node?.code, "G4.U1.TS1.CV");
    assert.equal(r(4, { unit: "Unit 1", set: "Realistic Fiction", category: "2- Analyze Craft and Structure", level: "On Level" }).node?.code, "G4.U1.TS2.ACS.ON");
    assert.equal(r(6, { unit: "1", set: "Cacoon", category: "ACS", level: "below" }).node?.code, "G6.U1.SEL3.ACS.BELOW");
    assert.equal(r(5, { code: "g5.u3.ts3.rtr.above" }).node?.code, "G5.U3.TS3.RTR.ABOVE");
    assert.match(r(4, { unit: "1", set: "1", category: "Concept Vocabulary", level: "On" }).errors.join(), /no levels/);
    assert.match(r(6, { unit: "1", set: "1", category: "Respond to Reading", level: "On" }).errors.join(), /Grade 6 has no Respond to Reading/);
    assert.match(r(4, { unit: "9", set: "1", category: "CV" }).errors.join(), /no Unit 9/);
    assert.match(r(4, { unit: "1", set: "1", category: "ACS" }).errors.join(), /Map Level is required/);
    assert.match(r(4, { code: "G4.U1.TS1.ACS" }).errors.join(), /not found/, "the category itself takes no questions");
  });

  test("Import to Curriculum: questions land on the map AND in the bank; errors per row", async () => {
    const before = await repo.count("Question", {});
    const rows = [
      { ...base, "Question Text": "Which word has two meanings?", Grade: "4", Unit: "1", "Text Set / Selection": "1", Category: "Concept Vocabulary" },
      { ...base, "Question Text": "Why does the author use headings here?", Grade: "4", Unit: "1", "Text Set / Selection": "Realistic Fiction", Category: "Analyze Craft and Structure", "Map Level": "Above" },
      { ...base, "Question Text": "What is the theme of Cacoon?", Grade: "6", Unit: "1", "Text Set / Selection": "3", Category: "ACS", "Map Level": "On" },
      { ...base, "Question Text": "Bad: vocabulary with a level", Grade: "4", Unit: "1", "Text Set / Selection": "1", Category: "Concept Vocabulary", "Map Level": "On" },
      { ...base, "Question Text": "Bad: grade 6 respond", Grade: "6", Unit: "1", "Text Set / Selection": "1", Category: "Respond to Reading", "Map Level": "On" },
    ];
    const jobId = await analyzeImport(repo, admin, { fileName: "curriculum.csv", bytes: csvOf(CURRICULUM_TEMPLATE_HEADERS, rows), target: "CURRICULUM" });
    const job = await getImportJob(repo, admin, jobId);
    assert.deepEqual(job.rows.map((x) => x.status), ["VALID", "VALID", "VALID", "INVALID", "INVALID"]);
    await commitAll(jobId);
    assert.equal(await repo.count("Question", {}), before + 3);
    const made = (await repo.findMany("Question", {})).filter((q) => rows.slice(0, 3).some((r) => r["Question Text"] === q.stem));
    const byStem = new Map(made.map((q) => [String(q.stem), q]));
    assert.equal(await linksOf(String(byStem.get("Which word has two meanings?")!.id)), "G4.U1.TS1.CV");
    assert.equal(await linksOf(String(byStem.get("Why does the author use headings here?")!.id)), "G4.U1.TS2.ACS.ABOVE");
    assert.equal(await linksOf(String(byStem.get("What is the theme of Cacoon?")!.id)), "G6.U1.SEL3.ACS.ON");
    // no skill given → the grade's Unclassified skill (inactive); no standard; difficulty from the map level
    const q = byStem.get("Why does the author use headings here?")!;
    const sk = (await repo.findUnique("Skill", { id: q.skillId }))!;
    assert.deepEqual([sk.name, Boolean(sk.isActive), q.standardId ?? null, Number(q.difficultyLevel)], ["Unclassified (Curriculum Map)", false, null, 5]);
    assert.equal(Number(byStem.get("What is the theme of Cacoon?")!.difficultyLevel), 4);
    // and they are in the Question Bank
    const bank = (await listQuestions(repo, admin, { status: "PUBLISHED", q: "Cacoon" })).items;
    assert.ok(bank.some((x) => x.stem === "What is the theme of Cacoon?"));
  });

  test("Import to Question Bank: stays off the map; Use column sets Placement and MAP", async () => {
    const skill = (await repo.findMany("Skill", { isActive: true }))[0];
    const std = (await repo.findMany("SkillStandard", { skillId: skill.id }))[0];
    const stdCode = std ? String((await repo.findUnique("Standard", { id: std.standardId }))!.code).replace(/^CCSS\.ELA-LITERACY\./, "") : "";
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Curriculum", { id: skill.curriculumId }))!.gradeId }))!.level);
    const rows = [
      { ...base, "Question Text": "Bank question used for both tests", Grade: String(grade), Skill: String(skill.code), Standard: stdCode, "Difficulty Level": "4", "Cognitive Level": "Understand", Use: "Placement, MAP" },
      { ...base, "Question Text": "Bank question for practice only", Grade: String(grade), Skill: String(skill.code), Standard: stdCode, "Difficulty Level": "3", "Cognitive Level": "Remember" },
    ];
    const jobId = await analyzeImport(repo, admin, { fileName: "bank.csv", bytes: csvOf(TEMPLATE_HEADERS, rows) });
    const job = await getImportJob(repo, admin, jobId);
    assert.deepEqual(job.rows.map((x) => x.status), ["VALID", "VALID"], JSON.stringify(job.rows.map((r) => r.errors)));
    await commitAll(jobId);
    const both = (await repo.findMany("Question", { stem: "Bank question used for both tests" }))[0];
    const plain = (await repo.findMany("Question", { stem: "Bank question for practice only" }))[0];
    assert.deepEqual((await repo.findMany("QuestionUse", { questionId: both.id })).map((u) => String(u.use)).sort(), ["MAP_TEST", "PLACEMENT"]);
    assert.equal(await repo.count("QuestionUse", { questionId: plain.id }), 0);
    assert.equal(await linksOf(String(both.id)), null, "bank questions are not on the map");
  });

  test("the editor: place on the map, move, remove, set uses; delete cleans everything", async () => {
    const id = await createDraft(repo, admin, { skillId: "", type: "TRUE_FALSE", stem: "A suffix comes at the end of a word.", level: 3, whyCorrect: "Suffixes are added at the end.", answer: true, mapNodeCode: "G4.U1.TS3.CV", uses: ["PLACEMENT"] });
    assert.equal(await linksOf(id), "G4.U1.TS3.CV");
    let d = await getQuestion(repo, admin, id);
    assert.deepEqual([d.input.mapNodeCode, d.input.uses], ["G4.U1.TS3.CV", ["PLACEMENT"]]);
    await updateDraft(repo, admin, id, { ...d.input, mapNodeCode: "G4.U1.TS3.RTR.BELOW", uses: ["PLACEMENT", "MAP_TEST"] });
    assert.equal(await linksOf(id), "G4.U1.TS3.RTR.BELOW");
    await updateDraft(repo, admin, id, { ...d.input, mapNodeCode: null, uses: [] });
    assert.equal(await linksOf(id), null, "now a bank-only question");
    d = await getQuestion(repo, admin, id);
    await updateDraft(repo, admin, id, { ...d.input, mapNodeCode: "G4.U1.TS1.CV", uses: ["MAP_TEST"] });
    await assert.rejects(createDraft(repo, admin, { skillId: "", type: "TRUE_FALSE", stem: "x", level: 3, whyCorrect: "y", answer: true, mapNodeCode: "G4.U1.TS1.ACS" }), /does not exist or does not accept questions/);
    const r = await deleteQuestions(repo, admin, [id]);
    assert.equal(r.deleted, 1);
    assert.equal(await repo.count("QuestionMapLink", { questionId: id }), 0);
    assert.equal(await repo.count("QuestionUse", { questionId: id }), 0);
  });

  test("advanced Curriculum template: ready rows for all 344 places; one question per place imports in bulk", async () => {
    const places = await attachmentNodes(repo, schoolId);
    const xlsx = curriculumTemplateXlsx(places, 5);
    const { table } = extract("curriculum-import-template.xlsx", xlsx);
    assert.deepEqual(table[0], [...CURRICULUM_SHEET_HEADERS], "the Excel file reads back with the same columns");
    assert.equal(table.length, 1 + 2 + 344 * 5, "header + 2 examples + 5 ready rows per place");
    // fill one ready row per place (drop the examples), keep the other ready rows empty
    const rows = curriculumTemplateRows(places, 5);
    const H = rows[0];
    const ci = (h: string) => H.indexOf(h);
    const filled: string[][] = [H];
    const seen = new Set<string>();
    for (const r of rows.slice(3)) {
      const code = r[ci("Curriculum Map ID")];
      const out = [...r];
      if (!seen.has(code)) {
        seen.add(code);
        // genuinely different questions (near-identical ones are flagged as duplicates by the importer)
        const k = seen.size, w = (n: number) => WORDS[(k * 7 + n * 13) % WORDS.length] + WORDS[(k * 3 + n * 5) % WORDS.length];
        out[ci("Question Text")] = `Bulk question for ${code}: which ${w(1)} best fits the ${w(2)} near the ${w(3)}?`; out[ci("Question Type")] = "Multiple Choice";
        out[ci("Option A")] = `${w(4)} ${k}`; out[ci("Option B")] = `${w(5)} ${k}`; out[ci("Option C")] = `${w(6)} ${k}`; out[ci("Option D")] = `${w(7)} ${k}`;
        out[ci("Correct Answer")] = "A"; out[ci("Explanation")] = "Because.";
      }
      filled.push(out);
    }
    const csv = new TextEncoder().encode(filled.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n");
    const jobId = await analyzeImport(repo, admin, { fileName: "bulk.csv", bytes: csv, target: "CURRICULUM" });
    const job = await getImportJob(repo, admin, jobId);
    assert.equal(job.rows.length, 344, "empty ready rows are skipped");
    assert.ok(job.rows.every((x) => x.status === "VALID"), JSON.stringify(job.rows.filter((x) => x.status !== "VALID").slice(0, 3).map((x) => x.errors)));
    await commitAll(jobId);
    const made = await repo.findMany("Question", {}).then((qs) => qs.filter((q) => String(q.stem).startsWith("Bulk question for ")));
    assert.equal(made.length, 344);
    for (const q of made.slice(0, 40)) assert.equal(await linksOf(String(q.id)), String(q.stem).replace("Bulk question for ", "").split(":")[0]);
    // every attachment node now has a question
    const nodesWithQ = new Set((await repo.findMany("QuestionMapLink", {})).map((l) => String(l.nodeId)));
    assert.ok(places.every((p) => nodesWithQ.has(p.id)));
  });

  test("the ID and the place columns must agree", async () => {
    const nodes = await attachmentNodes(repo, schoolId);
    const r = resolveMapLocation(nodes, 4, { code: "G4.U1.TS1.CV", unit: "2", set: "1", category: "Concept Vocabulary" });
    assert.match(r.errors.join(), /do not match/);
    assert.equal(resolveMapLocation(nodes, 4, { code: "G4.U2.TS1.CV", unit: "2", set: "1", category: "Concept Vocabulary" }).node?.code, "G4.U2.TS1.CV");
  });

  test("➕ Add questions on one place: its own template (30 rows), and an upload there puts rows without a place on it", async () => {
    const places = (await attachmentNodes(repo, schoolId)).filter((p) => p.code === "G4.U1.TS3.ACS.BELOW");
    const rows = curriculumTemplateRows(places, 30);
    const H = rows[0], ci = (h: string) => H.indexOf(h);
    const body = rows.slice(1).filter((r) => !String(r[ci("Question Text")]).startsWith("[Example]"));   // the ready rows
    assert.equal(body.length, 30);
    assert.ok(body.every((r) => r[ci("Curriculum Map ID")] === "G4.U1.TS3.ACS.BELOW"));
    assert.equal(curriculumTemplateRows(places, 500).slice(1).filter((r) => !String(r[ci("Question Text")]).startsWith("[Example]")).length, 100, "at most 100 rows");
    // a sheet with only question columns, uploaded from that place
    const QH = ["Question Text", "Question Type", "Option A", "Option B", "Option C", "Option D", "Correct Answer", "Explanation"];
    const STEMS = ["Which detail best supports the central idea of the text about rivers?", "Why does the author describe the flood season in the second paragraph about rivers?", "What is the main purpose of the heading that introduces the section on river animals and the text about rivers?"];
    const q = (n: number) => [STEMS[n - 1], "Multiple Choice", ["the water rises each spring", "the farmers plant early", "the fish swim upstream"][n - 1], ["a dog barks loudly", "the market opens late", "the birds fly south"][n - 1], ["a car stops suddenly", "the teacher reads aloud", "the snow melts quickly"][n - 1], ["a bell rings twice", "the bridge is painted", "the wind changes direction"][n - 1], "A", "It supports the idea."];
    const csv = new TextEncoder().encode([QH, q(1), q(2), q(3)].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n") + "\n");
    const jobId = await analyzeImport(repo, admin, { fileName: "place.csv", bytes: csv, target: "CURRICULUM", defaultMapCode: "G4.U1.TS3.ACS.BELOW" });
    const job = await getImportJob(repo, admin, jobId);
    assert.ok(job.rows.length === 3 && job.rows.every((r) => r.status === "VALID"), JSON.stringify(job.rows.map((r) => r.errors)));
    await commitAll(jobId);
    const made = (await repo.findMany("Question", {})).filter((x) => String(x.stem).includes("about rivers") && STEMS.includes(String(x.stem)));
    assert.equal(made.length, 3);
    for (const m of made) assert.equal(await linksOf(String(m.id)), "G4.U1.TS3.ACS.BELOW");
  });
});
