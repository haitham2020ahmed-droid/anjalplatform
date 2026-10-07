import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import {
  DuplicateWarning, createGrade, createSkill, createStandard, createUnit, curriculumTree, deleteGrade, deleteSkill, deleteStandard, deleteUnit,
  listStandards, moveSkillInUnit, moveUnit, placeSkillInUnit, setSkillActive, setUnitActive, updateGrade, updateStandard,
} from "../src/server/curriculum-manage";
import { loadCurriculumIndex } from "../src/server/admin/question-import";
import { editorOptions } from "../src/app/admin/questions/editor-data";
import { templateXlsx } from "../src/imports/questions/template-files";
import { readXlsx } from "../src/imports/xlsx";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

describe("curriculum management (admin)", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
  });

  test("nothing is created automatically: only the grades that exist are listed", async () => {
    const tree = await curriculumTree(repo, admin);
    assert.deepEqual(tree.grades.map((g) => g.level), [4, 5, 6]);
    assert.ok(tree.grades[0].units.length > 0 && tree.grades[0].units[0].skills.length > 0, "the existing curriculum is shown");
  });

  test("an admin creates a grade manually; it appears in the editor, importer and template at once", async () => {
    const g = await createGrade(repo, admin, { level: 7 });
    assert.equal(g.name, "Grade 7");
    await assert.rejects(createGrade(repo, admin, { level: 7 }), /Grade 7 already exists/);
    await assert.rejects(createGrade(repo, admin, { level: 13 }), /0 \(KG\) to 12/);
    const unit = await createUnit(repo, admin, { gradeId: String(g.id), title: "Myths and Legends" });
    assert.equal(unit.number, 1);
    await createStandard(repo, admin, { framework: "SCHOOL_OBJECTIVE", code: "SCH.7.1", description: "Explain how a myth reflects a culture.", gradeLevel: 7 });
    const skill = await createSkill(repo, admin, { gradeId: String(g.id), unitId: String(unit.id), name: "Myth Structure", domain: "READING", category: "LITERATURE", standardCodes: ["SCH.7.1"] });
    assert.equal(skill.code, "G7.myth-structure");
    const tree = await curriculumTree(repo, admin);
    const g7 = tree.grades.find((x) => x.level === 7)!;
    assert.deepEqual(g7.units[0].skills.map((k) => [k.name, k.standards]), [["Myth Structure", ["SCH.7.1"]]]);
    const idx = await loadCurriculumIndex(repo, admin);
    assert.equal(idx.grades.get(7)?.[0].name, "Myth Structure", "the importer knows the new skill");
    const opts = await editorOptions(repo, admin.schoolId!);
    assert.ok(opts.skills.some((k) => k.name === "Myth Structure" && k.grade === 7), "the question editor offers it");
    const book = readXlsx(Buffer.from(templateXlsx(idx)), { sheet: "Curriculum" });
    assert.ok(book.some((r) => r[0] === "7" && r[2] === "Myth Structure"), "the downloadable Curriculum sheet lists it");
  });

  test("duplicates are refused with a warning; confirming creates anyway (where allowed)", async () => {
    const g4 = (await curriculumTree(repo, admin)).grades.find((x) => x.level === 4)!;
    const existingSkill = g4.units[0].skills[0];
    const err = await createSkill(repo, admin, { gradeId: g4.id, name: existingSkill.name.toUpperCase(), domain: "READING", category: "COMPREHENSION" }).catch((e) => e);
    assert.ok(err instanceof DuplicateWarning, String(err));
    const again = await createSkill(repo, admin, { gradeId: g4.id, name: existingSkill.name, domain: "READING", category: "COMPREHENSION", confirmDuplicate: true });
    assert.notEqual(again.code, existingSkill.code, "a confirmed duplicate gets its own code");
    await assert.rejects(createUnit(repo, admin, { gradeId: g4.id, title: g4.units[0].title }), DuplicateWarning);
    await assert.rejects(createStandard(repo, admin, { framework: "CCSS_ELA", code: "CCSS.ELA-LITERACY.RL.4.1" }), /already exists/);
    await assert.rejects(createStandard(repo, admin, { framework: "SCHOOL_OBJECTIVE", code: "RL.4.1" }), DuplicateWarning, "same short code in another framework warns");
    await assert.rejects(createGrade(repo, admin, { level: 8, name: "Grade 4" }), /already exists/);
  });

  test("reorder units and skills; activate and deactivate", async () => {
    const g7 = (await curriculumTree(repo, admin)).grades.find((x) => x.level === 7)!;
    const u2 = await createUnit(repo, admin, { gradeId: g7.id, title: "Poetry Around the World" });
    await moveUnit(repo, admin, String(u2.id), "up");
    let tree = (await curriculumTree(repo, admin)).grades.find((x) => x.level === 7)!;
    assert.deepEqual(tree.units.map((u) => [u.number, u.title]), [[1, "Poetry Around the World"], [2, "Myths and Legends"]]);
    const myths = tree.units[1];
    const s2 = await createSkill(repo, admin, { gradeId: g7.id, unitId: myths.id, name: "Hero's Journey", domain: "READING", category: "LITERATURE" });
    await moveSkillInUnit(repo, admin, myths.id, String(s2.id), "up");
    tree = (await curriculumTree(repo, admin)).grades.find((x) => x.level === 7)!;
    assert.deepEqual(tree.units[1].skills.map((k) => k.name), ["Hero's Journey", "Myth Structure"]);
    await setUnitActive(repo, admin, myths.id, false);
    await setSkillActive(repo, admin, String(s2.id), false);
    tree = (await curriculumTree(repo, admin)).grades.find((x) => x.level === 7)!;
    assert.equal(tree.units[1].isActive, false);
    assert.equal(tree.units[1].skills[0].isActive, false);
    assert.ok(!(await loadCurriculumIndex(repo, admin)).grades.get(7)!.some((k) => k.name === "Hero's Journey"), "inactive skills get no new questions");
    await updateGrade(repo, admin, g7.id, { isActive: false });
    assert.ok(!(await loadCurriculumIndex(repo, admin)).grades.has(7), "an inactive grade is hidden from the importer");
    assert.ok(!(await editorOptions(repo, admin.schoolId!)).skills.some((k) => k.grade === 7), "and from the editor");
    await updateGrade(repo, admin, g7.id, { isActive: true });
  });

  test("delete only when safe; otherwise a message says to deactivate", async () => {
    const tree = await curriculumTree(repo, admin);
    const g4 = tree.grades.find((x) => x.level === 4)!;
    const used = g4.units.flatMap((u) => u.skills).find((k) => k.questions > 0)!;
    await assert.rejects(deleteSkill(repo, admin, used.id), /cannot be deleted because it has .*question.*Deactivate it instead/);
    await assert.rejects(deleteGrade(repo, admin, g4.id), /class.*Deactivate it instead/);
    await assert.rejects(deleteStandard(repo, admin, (await listStandards(repo, admin)).find((s) => s.code.endsWith("RL.4.1"))!.id), /cannot be deleted/);
    // an unused skill, unit and grade can be removed
    const g7 = tree.grades.find((x) => x.level === 7)!;
    const spare = await createSkill(repo, admin, { gradeId: g7.id, name: "Spare Skill", domain: "GRAMMAR", category: "GRAMMAR" });
    await placeSkillInUnit(repo, admin, String(spare.id), g7.units[0].id);
    await deleteSkill(repo, admin, String(spare.id));
    assert.ok(!(await curriculumTree(repo, admin)).grades.find((x) => x.level === 7)!.units[0].skills.some((k) => k.name === "Spare Skill"));
    const g9 = await createGrade(repo, admin, { level: 9 });
    const u = await createUnit(repo, admin, { gradeId: String(g9.id), title: "Empty" });
    const k9 = await createSkill(repo, admin, { gradeId: String(g9.id), unitId: String(u.id), name: "Temporary Skill", domain: "READING", category: "LITERATURE" });
    await assert.rejects(deleteGrade(repo, admin, String(g9.id)), /1 unit\(s\), 1 skill\(s\)/);
    await deleteSkill(repo, admin, String(k9.id));
    await deleteUnit(repo, admin, String(u.id));
    await deleteGrade(repo, admin, String(g9.id));
    assert.ok(!(await curriculumTree(repo, admin)).grades.some((x) => x.level === 9));
    const std = await createStandard(repo, admin, { framework: "SCHOOL_OBJECTIVE", code: "SCH.TMP" });
    await updateStandard(repo, admin, String(std.id), { description: "Temporary", isActive: false });
    assert.equal((await listStandards(repo, admin)).find((s) => s.code === "SCH.TMP")!.isActive, false);
    await deleteStandard(repo, admin, String(std.id));
  });

  test("permissions are enforced on the server", async () => {
    await assert.rejects(createGrade(repo, teacher, { level: 10 }), ForbiddenError);
    await assert.rejects(createSkill(repo, teacher, { gradeId: "x", name: "y", domain: "READING", category: "LITERATURE" }), ForbiddenError);
    const g4 = (await curriculumTree(repo, admin)).grades.find((x) => x.level === 4)!;
    const otherSchool: Actor = { ...admin, schoolId: "another-school" };
    await assert.rejects(createUnit(repo, otherSchool, { gradeId: g4.id, title: "Intruder" }), ForbiddenError);
    await assert.rejects(deleteGrade(repo, otherSchool, g4.id), ForbiddenError);
  });
});
