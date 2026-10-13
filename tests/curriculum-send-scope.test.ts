/**
 * 📘 Curriculum Map → Send: one selection / one unit / several units / the whole plan → Preview → Send to the chosen
 * class(es). Reuses sendMapPlan (question parts) and assignRespond (Respond to Reading writing tasks).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { buildSendPreview, sendScope } from "../src/server/curriculum-map/send-scope";
import { sendTargets } from "../src/server/curriculum-map/send-plan";
import { sentMapCodes, sentOn } from "../src/server/curriculum-map/sent";
import { demoDatabase, ROOT } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("📘 Send from the Curriculum Map (scope → preview → send)", () => {
  let repo: SqliteRepo; let teacher: Actor; let teacher5: Actor; let admin: Actor; let student: Actor;
  let classA: string; let classB: string; let studentsA: string[];

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, teacher5, admin] = await Promise.all(["demo.teacher.4a", "demo.teacher.5a", "demo.admin"].map(a));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
    const ids: string[] = [];
    const q = async (code: string, i: number) => ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${code} q ${i}`, level: 4, whyCorrect: "Because.", mapNodeCode: code, options: [{ label: "A", text: `r${code}${i}`, correct: true, rationale: null }, { label: "B", text: `w${code}${i}`, correct: false, rationale: "No." }] } as never));
    for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 2; i++) await q(`G4.U1.TS1.ACS.${lv}`, i);   // 6
    for (let i = 0; i < 3; i++) await q("G4.U1.TS1.CV", i);                                                     // 3
    for (let i = 0; i < 2; i++) await q("G4.U2.TS1.ACS.ON", i);                                                 // 2
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    const r = await teacherRoster(repo, teacher);
    classA = r[0].id; studentsA = r[0].students.map((x: { id: string }) => x.id);
    const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0];
    classB = s((await repo.findMany("Class", { gradeId: g4.id })).find((c) => s(c.id) !== classA)!.id);
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentsA[0] }))!.userId }))!);
  });

  test("each scope builds the right preview (selection · unit · several units · whole plan)", async () => {
    const sel = await buildSendPreview(repo, teacher, { grade: 4, kind: "SELECTION", codes: ["G4.U1.TS1"] });
    assert.equal(sel.selections.length, 1);
    assert.equal(sel.selections[0].name, "A World of Change");
    assert.match(sel.title, /^Grade 4 · Unit 1 · A World of Change$/);
    const byKind = Object.fromEntries(sel.selections[0].sections.map((x) => [x.kind, x]));
    assert.deepEqual(Object.keys(byKind), ["CONCEPT_VOCABULARY", "ANALYZE_CRAFT_AND_STRUCTURE", "RESPOND_TO_READING", "REVIEW"]);
    assert.equal(byKind.ANALYZE_CRAFT_AND_STRUCTURE.questions, 6, "the levels' questions are counted");
    assert.equal(byKind.CONCEPT_VOCABULARY.questions, 3);
    assert.equal(byKind.REVIEW.ready, false, "no questions → not ready");
    assert.equal(byKind.RESPOND_TO_READING.writing, true, "the Grade 4 writing task is there");
    assert.equal(sel.totals.questions, 9);

    const u1 = await buildSendPreview(repo, teacher, { grade: 4, kind: "UNIT", codes: ["G4.U1"] });
    assert.ok(u1.selections.length >= 3 && u1.selections.every((x) => x.unit === "Unit 1"));
    assert.equal(u1.title, "Grade 4 · Unit 1 plan");
    const u12 = await buildSendPreview(repo, teacher, { grade: 4, kind: "UNITS", codes: ["G4.U2", "G4.U1"] });
    assert.deepEqual([...new Set(u12.selections.map((x) => x.unit))], ["Unit 1", "Unit 2"]);
    assert.equal(u12.title, "Grade 4 · Units 1, 2 plan");
    assert.equal(u12.totals.questions, 11);
    const plan = await buildSendPreview(repo, teacher, { grade: 4, kind: "PLAN" });
    assert.equal(plan.selections.length, 18, "all 18 selections of Grade 4");
    assert.equal(plan.title, "Grade 4 Curriculum plan");

    await assert.rejects(buildSendPreview(repo, teacher, { grade: 4, kind: "UNIT", codes: ["G4.U1", "G4.U2"] }), ValidationError);
    await assert.rejects(buildSendPreview(repo, teacher, { grade: 4, kind: "SELECTION", codes: ["G5.U1.TS1"] }), ValidationError);
    await assert.rejects(buildSendPreview(repo, teacher, { grade: 4, kind: "UNITS", codes: [] }), ValidationError);
  });

  test("permissions: own grade and own classes only; admins any grade; students never", async () => {
    await assert.rejects(buildSendPreview(repo, teacher, { grade: 5, kind: "PLAN" }), ForbiddenError, "a Grade 4 teacher cannot send Grade 5");
    await assert.rejects(buildSendPreview(repo, teacher5, { grade: 4, kind: "PLAN" }), ForbiddenError);
    await assert.rejects(buildSendPreview(repo, teacher, { grade: 4, kind: "PLAN" }, [classB]), ForbiddenError, "not the teacher's class");
    await assert.rejects(sendScope(repo, teacher, { grade: 4, kind: "SELECTION", codes: ["G4.U1.TS1"], classIds: [classB] }), ForbiddenError);
    await assert.rejects(buildSendPreview(repo, student, { grade: 4, kind: "PLAN" }), ForbiddenError);
    assert.equal((await buildSendPreview(repo, admin, { grade: 5, kind: "UNIT", codes: ["G5.U1"] })).grade, 5);
    const g5 = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 5 }))[0];
    const class5 = s((await repo.findMany("Class", { gradeId: g5.id }))[0].id);
    await assert.rejects(buildSendPreview(repo, admin, { grade: 4, kind: "PLAN" }, [class5]), ValidationError, "a Grade 5 class does not get the Grade 4 plan");
    assert.ok((await sendTargets(repo, teacher)).every((c) => c.grade === 4));
    // students in one class only
    await assert.rejects(sendScope(repo, admin, { grade: 4, kind: "SELECTION", codes: ["G4.U1.TS1"], classIds: [classA, classB], studentIds: [studentsA[0]] }), ValidationError);
  });

  test("sending makes the plan and the writing task for the chosen class only; unticked parts stay out", async () => {
    const before = new Set((await repo.findMany("Assignment", {})).map((a) => s(a.id)));
    const r = await sendScope(repo, teacher, { grade: 4, kind: "SELECTION", codes: ["G4.U1.TS1"], classIds: [classA], exclude: ["G4.U1.TS1.CV"], dueAt: new Date("2026-11-01T23:59:59") });
    assert.equal(r.classes.length, 1);
    assert.equal(r.parts, 1, "only Analyze Craft and Structure (Vocabulary unticked, Review not ready)");
    assert.equal(r.writing, 1, "the Respond to Reading writing task");
    const made = (await repo.findMany("Assignment", {})).filter((a) => !before.has(s(a.id)));
    assert.ok(made.length >= 1 && made.every((a) => s(a.classId) === classA && a.program === "CURRICULUM" && s(a.curriculumPlanId) === r.classes[0].planId));
    assert.ok(made.every((a) => a.dueAt), "the due date is kept");
    const rows = await repo.findMany("AssignmentStudent", { assignmentId: { in: made.map((a) => a.id) } });
    assert.deepEqual(new Set(rows.map((x) => s(x.studentId))), new Set(studentsA));
    const plan = (await repo.findUnique("SkillPlan", { id: r.classes[0].planId! }))!;
    assert.equal(plan.title, "Grade 4 · Unit 1 · A World of Change");
    const items = await repo.findMany("SkillPlanItem", { planId: plan.id });
    assert.deepEqual(items.map((i) => s(i.code)), ["G4.U1.TS1.ACS"]);
    const ra = await repo.findMany("RespondAssignment", { setCode: "G4.U1.TS1.RTR" });
    assert.deepEqual(ra.map((x) => s(x.classId)), [classA]);
    assert.equal(await repo.count("Assignment", { classId: classB }), 0, "the other class gets nothing");
    // ✓ Sent on the map updates
    assert.ok(sentOn(await sentMapCodes(repo, teacher), "G4.U1.TS1.ACS"));
  });

  test("already-sent parts are marked and skipped; “Send again” sends them; other classes still get them", async () => {
    const pv = await buildSendPreview(repo, teacher, { grade: 4, kind: "SELECTION", codes: ["G4.U1.TS1"] }, [classA]);
    const sec = Object.fromEntries(pv.selections[0].sections.map((x) => [x.kind, x]));
    assert.deepEqual(sec.ANALYZE_CRAFT_AND_STRUCTURE.sentTo.map((c) => c.classId), [classA]);
    assert.deepEqual(sec.RESPOND_TO_READING.sentTo.map((c) => c.classId), [classA]);
    assert.deepEqual(sec.CONCEPT_VOCABULARY.sentTo, []);

    // nothing new when only sent parts are chosen
    await assert.rejects(sendScope(repo, teacher, { grade: 4, kind: "SELECTION", codes: ["G4.U1.TS1"], classIds: [classA], exclude: ["G4.U1.TS1.CV"] }), /already sent/);
    // the unit: the sent parts are skipped, Vocabulary goes now
    const before = await repo.count("SkillPlanItem", {});
    const u = await sendScope(repo, teacher, { grade: 4, kind: "UNIT", codes: ["G4.U1"], classIds: [classA] });
    assert.equal(u.alreadySent, 2);
    const items = (await repo.findMany("SkillPlanItem", { planId: u.classes[0].planId! })).map((i) => s(i.code));
    assert.ok(items.includes("G4.U1.TS1.CV") && !items.includes("G4.U1.TS1.ACS"));
    assert.equal(await repo.count("SkillPlanItem", {}), before + items.length);
    assert.equal((await repo.findMany("RespondAssignment", { classId: classA, setCode: "G4.U1.TS1.RTR" })).length, 1, "the writing task is not sent twice");

    // Send again
    const again = await sendScope(repo, teacher, { grade: 4, kind: "SELECTION", codes: ["G4.U1.TS1"], classIds: [classA], exclude: ["G4.U1.TS1.CV", "G4.U1.TS1.RTR"], resend: true });
    assert.equal(again.parts, 1); assert.equal(again.alreadySent, 0);

    // an admin sends the same selection to both classes: class A skips it, class B gets it
    const both = await sendScope(repo, admin, { grade: 4, kind: "SELECTION", codes: ["G4.U1.TS1"], classIds: [classA, classB], exclude: ["G4.U1.TS1.RTR"] });
    const [a, b] = [both.classes.find((c) => c.classId === classA)!, both.classes.find((c) => c.classId === classB)!];
    assert.equal(a.parts, 0); assert.equal(a.alreadySent, 2); assert.equal(a.planId, null);
    assert.equal(b.parts, 2); assert.ok(b.planId);
    assert.ok((await repo.findMany("Assignment", { classId: classB })).every((x) => s(x.curriculumPlanId) === b.planId));
  });

  test("the page, the window and the card offer the Send options; page exports only page fields", () => {
    const page = readFileSync(join(ROOT, "src/app/admin/curriculum-map/page.tsx"), "utf8");
    assert.match(page, /<SendPlanButton label="Send…" big \/>/);
    assert.match(page, /kind="UNIT"/);
    assert.deepEqual([...page.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:const|function|let)?\s*(\w+)/gm)].map((m) => m[1]).sort(), ["CurriculumMapPage", "metadata"].sort());
    const win = readFileSync(join(ROOT, "src/components/curriculum-map/send-plan.tsx"), "utf8");
    for (const x of ["One selection", "One unit", "Several units", "Whole plan", "Send again the parts already sent", "Preview"]) assert.ok(win.includes(x), x);
    assert.match(readFileSync(join(ROOT, "src/components/curriculum-map/lesson-card.tsx"), "utf8"), /Send this selection/);
    const ar = readFileSync(join(ROOT, "src/i18n/ar.ts"), "utf8");
    for (const x of ["Send this selection", "One selection", "Several units", "Whole plan", "Send again the parts already sent", "Writing task"]) assert.ok(ar.includes(`"${x}":`), `Arabic: ${x}`);
  });
});
