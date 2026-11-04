/**
 * 📚 Test builder — Curriculum Map questions (demo school in memory, never a real database):
 *   Grade → Unit → Text Set / Selection → sections (from attachmentNodes, so a NEW category type appears by itself),
 *   a teacher sees only their own grades, sections are paged and filtered, no duplicate content in a test,
 *   "Preview as student" before Assign (server rule), mixed tests (map + skills), drafts keep map picks, print layout.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { generateDDL, parseSchema } from "../scripts/db/schema-ddl";
import { SqliteRepo } from "../scripts/db/sqlite-repo";
import { hashPassword } from "../src/server/auth/password";
import { seedCurriculum } from "../src/server/seeding/curriculum";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../src/server/seeding/demo";
import { loadBank, loadCurriculumInput } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { clearMapCache } from "../src/server/curriculum-map/questions";
import { assertNoDuplicateQuestions, describePicks, mapSectionQuestions, mapSourceGrades, mapSourceTree, SECTION_PAGE } from "../src/server/tests/map-source";
import { composeTest } from "../src/server/tests/compose";
import { assertPreviewedAsStudent, openStudentPreview, saveStudentPreview } from "../src/server/tests/student-preview";
import { assignTest, listTemplates, openTemplate, saveTemplate } from "../src/server/tests/assessments";
import { previewWork } from "../src/server/teacher/preview";
import { printLayout } from "../src/server/tests/print-layout";
import { loadQuestionItems } from "../src/server/practice/items";
import { testFingerprint } from "../src/lib/test-fingerprint";
import { ar } from "../src/i18n/ar";
import { UI_STRINGS } from "../src/i18n/en";

const ROOT = join(__dirname, "..");
const s = (v: unknown) => String(v ?? "");

/** The demo school, with one extra Curriculum Map category type ("REVIEW") allowed — like a section added later. */
async function database(): Promise<SqliteRepo> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
  const cats = schema.enums.get("MapCategoryType")!;
  if (!cats.includes("REVIEW")) cats.push("REVIEW");
  db.exec(generateDDL(schema, "sqlite"));
  const repo = new SqliteRepo(db, schema);
  await seedCurriculum(repo, loadCurriculumInput(ROOT, DEMO_SCHOOL_CODE, "Demo International School"));
  await seedDemoSchool(repo, { passwordHash: await hashPassword("Demo-Password-2026"), classesPerGrade: 1, studentsPerClass: 2 });
  return repo;
}

describe("📚 Test builder: Curriculum Map questions", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId = ""; let classId = "";
  let mc: string[] = []; let passagePair: string[] = []; let cloneOf = ""; let clone = ""; let reviewCount = 0;
  const node = async (code: string) => (await repo.findMany("CurriculumMapNode", { code }))[0];
  const link = async (code: string, ids: string[]) => { const n = await node(code); await repo.createMany("QuestionMapLink", ids.map((questionId) => ({ questionId, nodeId: n.id, createdAt: new Date() }))); };

  before(async () => {
    repo = await database();
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => s(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = admin.schoolId!;
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId });
    // Update 56: the seed adds a "4- Review" section after every Text Set / Selection (G4.U1.TS1.REV, G5.U1.TS1.REV, …)
    clearMapCache();
    // Grade 4 multiple-choice questions (no passage) and two that share a passage
    const mcType = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const all = (await repo.findMany("Question", { status: "PUBLISHED", typeId: mcType.id, deletedAt: null })).filter((q) => s(q.externalRef).startsWith("G4-"));
    mc = all.filter((q) => !q.passageId).map((q) => s(q.id)).sort().slice(0, 40);
    const byPassage = new Map<string, string[]>();
    for (const q of all.filter((x) => x.passageId)) byPassage.set(s(q.passageId), [...(byPassage.get(s(q.passageId)) ?? []), s(q.id)]);
    passagePair = [...byPassage.values()].find((l) => l.length >= 2)!.slice(0, 2);
    assert.ok(mc.length >= 40 && passagePair.length === 2, "enough Grade 4 questions");
    await link("G4.U1.TS1.CV", mc.slice(0, 25));
    await link("G4.U1.TS1.ACS.ON", mc.slice(25, 30));
    await link("G4.U1.TS1.REV", mc.slice(30, 33));
    reviewCount = 3;
    await link("G5.U1.TS1.REV", mc.slice(33, 35));
    // a copy: same text and same answer, another id (e.g. imported twice)
    cloneOf = mc[36];
    const src = (await repo.findUnique("Question", { id: cloneOf }))!;
    const { id: _id, ...rest } = src;
    clone = s((await repo.create("Question", { ...rest, externalRef: `${s(src.externalRef)}-copy`, createdAt: new Date(), updatedAt: new Date() })).id);
    for (const table of ["QuestionOption", "QuestionAnswer"]) {
      const rows = await repo.findMany(table, { questionId: cloneOf });
      if (rows.length) await repo.createMany(table, rows.map(({ id: _x, ...r }) => ({ ...r, questionId: clone })));
    }
  });

  test("🧭 grade restriction: a teacher browses only their classes' grades; admins every grade", async () => {
    assert.deepEqual(await mapSourceGrades(repo, teacher), [4]);
    assert.deepEqual(await mapSourceGrades(repo, admin), [4, 5, 6]);
    const tree = await mapSourceTree(repo, teacher, 5);
    assert.equal(tree.grade, 4, "asking for Grade 5 still shows the teacher's own grade");
    assert.deepEqual(tree.grades, [4]);
    await assert.rejects(mapSectionQuestions(repo, teacher, { code: "G5.U1.TS1.REV" }), ForbiddenError);
    assert.equal((await mapSectionQuestions(repo, admin, { code: "G5.U1.TS1.REV" })).total, 2, "the admin opens any grade");
    assert.equal((await mapSourceTree(repo, admin, 5)).grade, 5);
    const student = await resolveActor(repo, (await repo.findMany("User", { role: "STUDENT" }))[0]);
    await assert.rejects(mapSourceTree(repo, student), ForbiddenError, "students never browse the builder");
  });

  test("🗂 Unit → Text Set (title + key words) → sections from the map, incl. a new category type, with counts", async () => {
    const tree = await mapSourceTree(repo, teacher);
    const u1 = tree.units.find((u) => u.unit === 1)!;
    const ts1 = u1.sets.find((x) => x.code === "G4.U1.TS1")!;
    assert.equal(ts1.title, "A World of Change", "the selection title from lesson-details.json");
    assert.ok(ts1.keyWords.includes("alter") && ts1.keyWords.includes("hazard"), "its key words");
    assert.match(ts1.heading, /Text Set 1/);
    const labels = ts1.sections.map((x) => x.label);
    assert.equal(labels[0], "Concept Vocabulary");
    assert.ok(labels.includes("Analyze Craft and Structure · Meeting"));
    assert.ok(labels.includes("Respond to Reading · Approaching"));
    const review = ts1.sections.find((x) => x.category === "REVIEW");
    assert.ok(review, "the new Review section appears without any code change");
    assert.equal(review!.label, "Review");
    assert.equal(review!.count, reviewCount);
    assert.equal(labels[labels.length - 1], "Review", "a new category follows the usual ones");
    assert.equal(ts1.sections.find((x) => x.code === "G4.U1.TS1.CV")!.count, 25);
    assert.equal(ts1.count, 25 + 5 + reviewCount);
    assert.equal(u1.count, ts1.count);
    assert.ok(ts1.sections.filter((x) => x.label.startsWith("Analyze Craft")).map((x) => x.level).join() === "BELOW,ON,ABOVE", "levels Below → On → Above");
  });

  test("📄 a section's questions: paged, filtered by type and level, Select all", async () => {
    const p1 = await mapSectionQuestions(repo, teacher, { code: "G4.U1.TS1.CV" });
    assert.equal(p1.total, 25);
    assert.equal(p1.pages, 2);
    assert.equal(p1.questions.length, SECTION_PAGE);
    assert.ok(p1.questions.every((q) => q.stem && q.type === "MULTIPLE_CHOICE" && q.typeLabel && q.contentKey && q.code === "G4.U1.TS1.CV"));
    const p2 = await mapSectionQuestions(repo, teacher, { code: "g4.u1.ts1.cv", page: 2 });
    assert.equal(p2.questions.length, 5);
    assert.equal(new Set([...p1.questions, ...p2.questions].map((q) => q.id)).size, 25, "pages do not overlap");
    assert.deepEqual(p1.types.map((x) => x.code), ["MULTIPLE_CHOICE"]);
    assert.equal((await mapSectionQuestions(repo, teacher, { code: "G4.U1.TS1.CV", type: "TRUE_FALSE" })).total, 0);
    const lv = p1.levels[0].level;
    assert.equal((await mapSectionQuestions(repo, teacher, { code: "G4.U1.TS1.CV", level: lv })).total, p1.levels[0].count);
    const on = await mapSectionQuestions(repo, teacher, { code: "G4.U1.TS1.ACS.ON" });
    assert.ok(on.questions.every((q) => q.level === "ON"), "a level section's questions carry its level");
    const all = await mapSectionQuestions(repo, teacher, { code: "G4.U1.TS1.CV", all: true });
    assert.equal(all.questions.length, 25, "Select all in section");
    await assert.rejects(mapSectionQuestions(repo, teacher, { code: "G4.U9.TS9.CV" }), ValidationError);
    // a draft or deleted question is never offered
    await repo.updateMany("Question", { id: mc[0] }, { status: "DRAFT" });
    assert.equal((await mapSectionQuestions(repo, teacher, { code: "G4.U1.TS1.CV" })).total, 24);
    await repo.updateMany("Question", { id: mc[0] }, { status: "PUBLISHED" });
  });

  test("❌ duplicates: the same question, or the same text and answer, is rejected with a clear message", async () => {
    await assert.rejects(assertNoDuplicateQuestions(repo, [mc[1], mc[2], mc[1]]), /Question 3 is the same question as question 1/);
    await assert.rejects(assertNoDuplicateQuestions(repo, [cloneOf, mc[2], clone]), /Question 3 has the same text and answer as question 1/);
    await assertNoDuplicateQuestions(repo, [mc[1], mc[2], mc[3]]);
    const [a, b] = await describePicks(repo, teacher, [cloneOf, clone]);
    assert.equal(a.contentKey, b.contentKey, "the builder sees the same content key (rejected at once in the browser too)");
    await assert.rejects(composeTest(repo, teacher, { skills: [], levelMode: "SAME", mapQuestionIds: [cloneOf, clone] }), /same text and answer/);
    await assert.rejects(saveStudentPreview(repo, teacher, { title: "T", levelMode: "SAME", questions: { SAME: [mc[1], mc[1]] } }), ValidationError);
  });

  test("🧩 one test mixes Curriculum Map picks (in order) with skills; the platform's picks never repeat them", async () => {
    const q = (await repo.findUnique("Question", { id: mc[5] }))!;
    const p = await composeTest(repo, teacher, { skills: [{ skillId: s(q.skillId), count: 20 }], levelMode: "SAME", seed: "x", mapQuestionIds: [mc[5], mc[6]] });
    const ids = p.versions.SAME!.map((x) => x.id);
    assert.deepEqual(ids.slice(0, 2), [mc[5], mc[6]], "the teacher's picks first, in their order");
    assert.equal(new Set(ids).size, ids.length, "no question twice");
    assert.ok(ids.length > 2, "skill questions were added");
    const lv = await composeTest(repo, teacher, { skills: [], levelMode: "LEVEL", mapQuestionIds: [mc[7], mc[8]] });
    for (const k of ["BELOW", "ON", "ABOVE"] as const) assert.deepEqual(lv.versions[k]!.map((x) => x.id), [mc[7], mc[8]], "map picks go to every level version");
    await assert.rejects(composeTest(repo, teacher, { skills: [], levelMode: "SAME" }), /Choose questions first/);
  });

  test("👀 Assign only after Preview as student of exactly these questions (server rule)", async () => {
    const questions = { SAME: [mc[10], mc[11], mc[12]] };
    await assert.rejects(assertPreviewedAsStudent(repo, teacher, { levelMode: "SAME", questions }), /Preview as student/, "no preview yet");
    const id = await saveStudentPreview(repo, teacher, { title: "Unit 1 quiz", levelMode: "SAME", questions });
    await assert.rejects(assertPreviewedAsStudent(repo, teacher, { levelMode: "SAME", questions }), /Preview as student/, "saved but not opened yet");
    // another teacher cannot open it; the preview page (existing component) shows the test as students see it
    const other = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.5a" }))!);
    await assert.rejects(openStudentPreview(repo, other, id), ForbiddenError);
    const v = await previewWork(repo, teacher, { test: id });
    assert.equal(v.test, true);
    assert.deepEqual(v.questions.map((x) => x.id), questions.SAME, "in the test's order");
    assert.ok(v.questions.every((x) => x.options.length > 0), "choices shown");
    assert.equal(v.counts.BELOW, 3, "same questions for every level");
    await assertPreviewedAsStudent(repo, teacher, { levelMode: "SAME", questions });
    await assertPreviewedAsStudent(repo, teacher, { levelMode: "SAME", questions: { SAME: [mc[12], mc[10], mc[11]] } }); // moved: still fine
    await assert.rejects(assertPreviewedAsStudent(repo, teacher, { levelMode: "SAME", questions: { SAME: [mc[10], mc[11]] } }), /Preview as student/, "a removed question needs a new preview");
    await assert.rejects(assertPreviewedAsStudent(repo, other, { levelMode: "SAME", questions }), /Preview as student/, "another teacher's preview does not count");
    await assert.rejects(assertPreviewedAsStudent(repo, teacher, { levelMode: "SAME", questions }, new Date(Date.now() + 2 * 86_400_000)), /Preview as student/, "a preview counts for a day");
    assert.equal(testFingerprint({ SAME: [mc[11], mc[10]] }), testFingerprint({ SAME: [mc[10], mc[11]], ON: [] }));
    // previews are never listed as templates; sending still uses the existing assignment flow
    assert.ok(!(await listTemplates(repo, teacher)).some((x) => x.title === "Unit 1 quiz"));
    const r = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "WEEKLY_QUIZ", title: "Unit 1 quiz", levelMode: "SAME", questions });
    assert.equal(r.sets, 1);
  });

  test("💾 drafts (templates) keep the Curriculum Map picks, even with no skills", async () => {
    const id = await saveTemplate(repo, teacher, { title: "Lesson draft", type: "CHAPTER_TEST", spec: { skills: [], levelMode: "SAME", timeLimitMin: null, shuffle: false, questions: { SAME: [mc[14], mc[15]] }, mapQuestionIds: [mc[14], mc[15]] } });
    const tpl = await openTemplate(repo, teacher, id);
    assert.deepEqual(tpl.spec.mapQuestionIds, [mc[14], mc[15]]);
    assert.deepEqual((await describePicks(repo, teacher, tpl.spec.mapQuestionIds!)).map((x) => [x.id, x.section]), [[mc[14], "Text Set 1: Expository Text · Concept Vocabulary"], [mc[15], "Text Set 1: Expository Text · Concept Vocabulary"]]);
    assert.ok((await listTemplates(repo, teacher)).some((x) => x.id === id));
    await assert.rejects(saveTemplate(repo, teacher, { title: "Empty", type: "CUSTOM", spec: { skills: [], levelMode: "SAME", timeLimitMin: null, shuffle: false, questions: {} } }), /Choose at least one skill/);
  });

  test("🖨 print layout: numbered questions, a shared passage printed once above its questions, answer spaces", async () => {
    const items = await loadQuestionItems(repo, [passagePair[0], mc[20], passagePair[1], mc[21]]);
    const groups = printLayout(items);
    const withPassage = groups.filter((g) => g.passage);
    assert.equal(withPassage.length, 1, "the passage once");
    assert.deepEqual(withPassage[0].questions.map((q) => q.id), passagePair, "its questions together under it");
    assert.deepEqual(groups.flatMap((g) => g.questions.map((q) => q.n)), [1, 2, 3, 4], "numbered 1…4");
    assert.ok(groups.flatMap((g) => g.questions).every((q) => q.answer.kind === "CHOICES" && q.key), "choices and an answer key");
    const page = readFileSync(join(ROOT, "src/app/teacher/assessments/print/page.tsx"), "utf8");
    assert.match(page, /@media print/);
    assert.match(page, /t\("Name"\)[\s\S]*t\("Class"\)[\s\S]*t\("Date"\)/, "name, class and date lines");
    assert.match(page, /Answer key/);
  });

  test("🌐 every new interface string has an Arabic version", () => {
    const known = new Set<string>(UI_STRINGS);
    const files = ["src/app/teacher/assessments/new/test-builder.tsx", "src/app/teacher/assessments/new/map-source.tsx", "src/app/teacher/assessments/print/page.tsx"];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
        assert.ok(known.has(m[1]), `${f}: "${m[1]}" is in en.ts`);
        assert.match(ar[m[1] as keyof typeof ar] ?? "", /[؀-ۿ]/, m[1]);
      }
    }
  });
});
