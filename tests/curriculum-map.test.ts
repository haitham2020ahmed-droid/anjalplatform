import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { parseCurriculumMap, type MapGrade } from "../src/server/curriculum-map/source";
import { backupCurriculum, expectedNodes, seedCurriculumMap, verifyCurriculumMap } from "../src/server/curriculum-map/seed";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError } from "../src/server/auth/rbac";
import { curriculumMapView } from "../src/server/curriculum-map/view";
import { demoDatabase } from "./helpers/db";

const SOURCE = readFileSync("data/curriculum-map/source.txt", "utf8");

describe("Curriculum Map (Grade → Book → Unit → Text Set/Selection → Category → Level)", () => {
  let repo: SqliteRepo; let map: MapGrade[]; let schoolId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    map = parseCurriculumMap(SOURCE);
    schoolId = String((await repo.findMany("Grade", { level: 4 }))[0].schoolId);
  });

  test("the source gives exactly the expected structure", () => {
    const sum = (g: MapGrade) => expectedNodes(g).filter((n) => n.acceptsQuestions).length;
    assert.deepEqual(map.map((g) => [g.level, g.units.length, g.units.flatMap((u) => u.sets).length, sum(g)]), [[4, 6, 18, 126], [5, 6, 18, 126], [6, 6, 23, 92]]);
    assert.deepEqual(map[2].units.map((u) => u.sets.length), [3, 3, 2, 4, 4, 7], "Grade 6 selections per unit");
    assert.equal(map.reduce((n, g) => n + sum(g), 0), 344);
    assert.throws(() => parseCurriculumMap("Grade 4\nUnit 1\nSomething unexpected"), /line 3: line not understood/);
  });

  test("seed: 344 attachment nodes, exact text, no questions, curriculum tables untouched", async () => {
    const before = await backupCurriculum(repo);
    const r = await seedCurriculumMap(repo, map, { schoolId });
    assert.equal(r.questionsAfter, r.questionsBefore, "no question created");
    assert.deepEqual(r.grades.map((g) => g.level).sort(), [4, 5, 6]);
    const v = await verifyCurriculumMap(repo, map, undefined, { schoolId });
    assert.ok(v.ok, v.problems.join("\n"));
    assert.equal(v.totalAttachment, 344);
    assert.deepEqual(v.grades.map((g) => [g.level, g.units, g.sets, g.conceptVocabulary, g.analyzeLevels, g.respondLevels]).sort(), [[4, 6, 18, 18, 54, 54], [5, 6, 18, 18, 54, 54], [6, 6, 23, 23, 69, 0]]);
    // the existing curriculum is exactly as before
    const after = await backupCurriculum(repo);
    for (const t of ["Grade", "Book", "Curriculum", "Unit", "Lesson", "Skill", "SkillFamily", "UnitSkill", "LessonSkill", "Standard", "SkillStandard"]) assert.deepEqual(after.tables[t], before.tables[t], `${t} unchanged`);
  });

  test("names are stored character for character", async () => {
    const node = async (code: string, level: number) => (await repo.findMany("CurriculumMapNode", { code, gradeId: (await repo.findMany("Grade", { schoolId, level }))[0].id }))[0];
    assert.equal((await node("G4.U3.TS2", 4)).sharedRead, "“Judy’s Appalachia”");
    assert.equal((await node("G4.U3.TS2", 4)).heading, "Text Set 2: Biography");
    assert.equal((await node("G4.U1.TS1.ACS", 4)).skills, "Reread / Diagrams and Headings \\ Compare and Contrast");
    assert.equal((await node("G5.U3.TS3", 5)).sharedRead, "“What Was the Purpose of the Inca’s Knotted Strings?”");
    assert.equal((await node("G6.U1.SEL3", 6)).title, "Cacoon");
    assert.equal((await node("G6.U1.SEL3.CV", 6)).skills, "Multiple Meaning Words");
    assert.equal((await node("G6.U1.SEL1.CV", 6)).skills, null, "no invented skill");
    assert.equal((await node("G6.U2.SEL3", 6)).title, "Personal Statement: Individual Twin");
    assert.equal((await node("G6.U6.SEL6", 6)).title, "I Never Had It Made: An Autobiography of Jackie Robinson");
    assert.equal((await node("G4.BOOK", 4)).title, "Wonders");
    assert.equal((await node("G6.BOOK", 6)).title, "StudySync ELA");
    // Grade 6: no shared read, no Respond to Reading
    const g6 = (await repo.findMany("Grade", { schoolId, level: 6 }))[0].id;
    const g6nodes = await repo.findMany("CurriculumMapNode", { gradeId: g6 });
    assert.ok(g6nodes.filter((n) => n.kind === "SELECTION").every((n) => n.sharedRead === null));
    assert.equal(g6nodes.filter((n) => n.categoryType === "RESPOND_TO_READING").length, 0);
    // only Concept Vocabulary categories and the levels accept questions
    const all = await repo.findMany("CurriculumMapNode", {});
    for (const n of all.filter((x) => Boolean(x.acceptsQuestions))) assert.ok(n.kind === "LEVEL" || n.categoryType === "CONCEPT_VOCABULARY", String(n.code));
    assert.ok(all.filter((n) => n.categoryType === "ANALYZE_CRAFT_AND_STRUCTURE").every((n) => !n.acceptsQuestions), "the ACS category itself takes no questions");
    // one Analyze Craft and Structure category per text set (skills combined)
    assert.equal(all.filter((n) => n.categoryType === "ANALYZE_CRAFT_AND_STRUCTURE").length, 59);
  });

  test("running the seed again changes nothing; verify catches a missing node and a changed name", async () => {
    const again = await seedCurriculumMap(repo, map, { schoolId });
    assert.ok(again.grades.every((g) => g.created === 0 && g.updated === 0), JSON.stringify(again.grades));
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0].id;
    await repo.updateMany("CurriculumMapNode", { gradeId: g4, code: "G4.U2.TS3" }, { sharedRead: "\"Dog\"" });
    await repo.deleteMany("CurriculumMapNode", { gradeId: g4, code: "G4.U6.TS3.RTR.BELOW" });
    const v = await verifyCurriculumMap(repo, map, undefined, { schoolId });
    assert.equal(v.ok, false);
    const g = v.grades.find((x) => x.level === 4)!;
    assert.deepEqual(g.missing, ["G4.U6.TS3.RTR.BELOW"]);
    assert.ok(g.mismatched.some((m) => m.startsWith("G4.U2.TS3.sharedRead")));
    // the seed repairs both
    await seedCurriculumMap(repo, map, { schoolId });
    assert.ok((await verifyCurriculumMap(repo, map, undefined, { schoolId })).ok);
  });

  test("the read-only view: teachers and admins see the tree in order; students cannot", async () => {
    const teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const student = await resolveActor(repo, (await repo.findMany("User", { role: "STUDENT" }))[0]);
    const v = await curriculumMapView(repo, teacher, 4);
    assert.deepEqual(v.grades.map((g) => g.level), [4, 5, 6]);
    assert.equal(v.book!.title, "Wonders");
    assert.deepEqual(v.book!.children.map((u) => u.title), ["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Unit 6"]);
    const ts = v.book!.children[0].children[0];
    assert.deepEqual([ts.heading, ts.sharedRead, ts.genre], ["Text Set 1: Expository Text", "“A World of Change”", "Expository Text"]);
    assert.deepEqual(ts.children.map((c) => c.title), ["1- Concept Vocabulary", "2- Analyze Craft and Structure", "3- Respond to Reading"]);
    assert.deepEqual(ts.children[1].children.map((l) => l.title), ["Above Level", "On Level", "Below Level"]);
    assert.equal(v.attachmentNodes, 126);
    const g6 = await curriculumMapView(repo, teacher, 6);
    assert.deepEqual(g6.book!.children.map((u) => u.children.length), [3, 3, 2, 4, 4, 7]);
    await assert.rejects(curriculumMapView(repo, student), ForbiddenError);
  });
});
