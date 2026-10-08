import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { curriculumMapView } from "../src/server/curriculum-map/view";
import { importActivities, respondOverview, respondPage, saveActivity, studentRespond, studentRespondList } from "../src/server/curriculum-map/respond";
import { demoDatabase } from "./helpers/db";

const HEAD = ["Curriculum Map ID", "Title", "Prompt", "Instructions", "Word Bank", "Sentence Starters", "Checklist", "Hint"];
const row = (code: string, t: string) => [code, `${t} title`, `${t} prompt about the text?`, "Reread the text.\nFind two details.", "compare — tell how things are alike\ncontrast — tell how they differ", "One difference is ____.", "I used two details.\nI checked my periods.", `${t} hint`];

describe("✍️ Respond to Reading: three level pages per Text Set (Below → On → Above)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(actorFor));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0];
    const st = (await repo.findMany("Student", { schoolId: admin.schoolId, gradeId: g4.id }))[0];
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
  });

  test("the map lists every level Below → On → Above", async () => {
    const v = await curriculumMapView(repo, admin, 4);
    const ts1 = v.book!.children[0].children[0];
    const rtr = ts1.children.find((c) => c.categoryType === "RESPOND_TO_READING")!;
    assert.deepEqual(rtr.children.map((l) => l.level), ["BELOW", "ON", "ABOVE"]);
    assert.deepEqual(ts1.children.find((c) => c.categoryType === "ANALYZE_CRAFT_AND_STRUCTURE")!.children.map((l) => l.level), ["BELOW", "ON", "ABOVE"]);
  });

  test("import: one row per level; bad rows are reported; teachers cannot import", async () => {
    const table = [HEAD, row("G4.U1.TS1.RTR.BELOW", "Below"), row("G4.U1.TS1.RTR.ON", "On"), row("G4.U1.TS1.RTR.ABOVE", "Above"), row("G4.U1.TS1.ACS.ON", "Wrong"), row("G4.U9.TS1.RTR.ON", "Missing")];
    await assert.rejects(importActivities(repo, teacher, table), ForbiddenError);
    const r = await importActivities(repo, admin, table);
    assert.equal(r.saved, 3);
    assert.deepEqual(r.errors.map((e) => e.row), [5, 6]);
    const p = await respondPage(repo, teacher, "G4.U1.TS1.RTR");
    assert.deepEqual(p.levels.map((l) => [l.level, l.activity?.title]), [["BELOW", "Below title"], ["ON", "On title"], ["ABOVE", "Above title"]]);
    const below = p.levels[0].activity!;
    assert.deepEqual([below.instructions.length, below.wordBank[0], below.sentenceStarters, below.checklist.length, below.hint], [2, "compare — tell how things are alike", ["One difference is ____."], 2, "Below hint"]);
    assert.equal(p.sharedRead, "“A World of Change”");
    const again = await importActivities(repo, admin, [HEAD, row("G4.U1.TS1.RTR.ON", "On v2")]);
    assert.equal(again.saved, 1);
    assert.equal((await respondPage(repo, admin, "G4.U1.TS1.RTR")).levels[1].activity?.title, "On v2 title", "importing again replaces that level");
    assert.equal(await repo.count("RespondActivity", {}), 3);
    const ov = await respondOverview(repo, admin);
    assert.deepEqual(ov.find((g) => g.grade === 4)!.units[0].sets[0].levels, { BELOW: true, ON: true, ABOVE: true });
  });

  test("admins edit one level; empty prompts are refused", async () => {
    await saveActivity(repo, admin, "G4.U1.TS2.RTR.ABOVE", { title: "Plot", prompt: "How does the conflict change the character?", instructions: ["Plan"], wordBank: [], sentenceStarters: [], checklist: ["I used evidence."], hint: null });
    assert.equal((await respondPage(repo, admin, "G4.U1.TS2.RTR")).levels[2].activity?.title, "Plot");
    await assert.rejects(saveActivity(repo, admin, "G4.U1.TS2.RTR.ON", { title: "x", prompt: " ", instructions: [], wordBank: [], sentenceStarters: [], checklist: [] }), /Write the prompt/);
    await assert.rejects(saveActivity(repo, teacher, "G4.U1.TS2.RTR.ON", { title: "x", prompt: "y", instructions: [], wordBank: [], sentenceStarters: [], checklist: [] }), ForbiddenError);
  });

  test("a student opens the activity of THEIR level (On by default, their Respond to Reading level when known)", async () => {
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Student", { id: student.studentId! }))!.gradeId }))!.level);
    assert.equal(grade, 4);
    const first = await studentRespond(repo, student, "G4.U1.TS1.RTR");
    assert.deepEqual([first.level, first.activity?.title], ["ON", "On v2 title"]);
    await repo.create("StudentCategoryLevel", { studentId: student.studentId!, category: "RTR", level: "BELOW", source: "ADAPTIVE", updatedAt: new Date() });
    const low = await studentRespond(repo, student, "G4.U1.TS1.RTR");
    assert.deepEqual([low.level, low.activity?.title, low.activity?.hint], ["BELOW", "Below title", "Below hint"]);
    const list = await studentRespondList(repo, student);
    assert.ok(list.units[0].sets.some((x) => x.setCode === "G4.U1.TS1.RTR"));
    await assert.rejects(studentRespond(repo, student, "G5.U1.TS1.RTR"), ForbiddenError, "another grade's activity");
    await assert.rejects(respondPage(repo, student, "G4.U1.TS1.RTR"), ForbiddenError, "the staff page is for staff");
  });
});
