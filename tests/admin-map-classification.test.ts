/**
 * Admin Map Classification (/admin/map-classification): src/server/map/question-areas.ts — every bank question gets
 * its NWEA MAP test + instructional area; a clearly wrong standard is fixed, a guessed one is only suggested for
 * review. Admin only. Preview changes nothing; apply never deletes or publishes a question.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { applyClassification, classificationPreview, reviewStandardFix, savedCounts } from "../src/server/map/question-areas";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin Map Classification", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let schoolId: string;
  let mechQuestionId: string;
  const now = new Date("2026-10-24T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin");
    teacher = await a("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);

    // A Grade 4 Punctuation (Mechanics) skill, deliberately given a wrong standard (RL.4.2: a Reading code).
    const type = (await repo.findMany("QuestionType", {}))[0] ?? (await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "Multiple choice" }));
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const mechSkill = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true })).find((k) => /punctuat|capitali|comma|apostrophe/i.test(s(k.name)))!;
    assert.ok(mechSkill, "the demo curriculum has a Mechanics (Punctuation/Capitalization) skill");
    const wrongStd = (await repo.findMany("Standard", { code: { contains: "RL" } }))[0] ?? await repo.create("Standard", { framework: "CCSS_ELA", code: "CCSS.ELA-LITERACY.RL.4.2", gradeLevel: 4, strand: "RL" });
    mechQuestionId = s((await repo.create("Question", { skillId: mechSkill.id, typeId: type.id, standardId: wrongStd.id, stem: "Which sentence uses commas correctly?", content: {}, difficultyLevel: 4, irtB: 0, status: "DRAFT", createdAt: now, updatedAt: now })).id);
  });

  test("teachers and students are refused: admin only", async () => {
    await assert.rejects(classificationPreview(repo, teacher), ForbiddenError);
    await assert.rejects(classificationPreview(repo, student), ForbiddenError);
    await assert.rejects(applyClassification(repo, teacher), ForbiddenError);
    await assert.rejects(reviewStandardFix(repo, teacher, [], true), ForbiddenError);
  });

  test("preview: the Mechanics question is flagged as a sure fix, nothing is saved yet", async () => {
    const { preview, rows } = await classificationPreview(repo, admin);
    assert.ok(preview.total >= 1);
    const row = rows.find((r) => r.id === mechQuestionId)!;
    assert.ok(row, "the question appears in the preview");
    assert.equal(row.area, "MECH");
    assert.ok(row.fix?.sure, "a Mechanics skill with a Reading standard is a SURE fix");
    assert.equal(row.fix!.to, "L.4.2");
    // nothing written by the preview
    assert.equal(await repo.count("QuestionStandardFix", {}), 0);
    const before = (await repo.findUnique("Question", { id: mechQuestionId }))!;
    assert.notEqual(s(before.mapInstructionalArea), "Language: Understand, Edit for Mechanics");
  });

  test("apply: fixes the standard, sets the MAP area, records the fix, never deletes or publishes", async () => {
    const totalBefore = await repo.count("Question", {});
    const r = await applyClassification(repo, admin, now);
    assert.ok(r.fixed >= 1, "the Mechanics question's standard was fixed");
    assert.ok(r.classified >= 1);
    const q = (await repo.findUnique("Question", { id: mechQuestionId }))!;
    assert.equal(s(q.mapInstructionalArea), "Language: Understand, Edit for Mechanics");
    assert.equal(s(q.mapTest), "Language Usage");
    assert.equal(s(q.status), "DRAFT", "apply never publishes a question");
    assert.equal(await repo.count("Question", {}), totalBefore, "apply never deletes a question");
    const std = (await repo.findUnique("Standard", { id: q.standardId }))!;
    assert.equal(s(std.code).replace(/^CCSS\.ELA-LITERACY\./, ""), "L.4.2");
    const fix = (await repo.findMany("QuestionStandardFix", { questionId: mechQuestionId }))[0];
    assert.equal(s(fix.status), "APPLIED");
    assert.equal(s(fix.toCode), "L.4.2");
  });

  test("applying twice is idempotent: an already-fixed question is not fixed again", async () => {
    await applyClassification(repo, admin, now);
    const fixes = await repo.findMany("QuestionStandardFix", { questionId: mechQuestionId });
    assert.equal(fixes.length, 1, "no duplicate fix record for the same question");
  });

  test("review a SUGGESTED standard fix: approve moves the question, reject keeps it, teachers refused", async () => {
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skill = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true }))[0];
    const type = (await repo.findMany("QuestionType", {}))[0];
    const q = await repo.create("Question", { skillId: skill.id, typeId: type.id, stem: "A question with no clear standard to go on.", content: {}, difficultyLevel: 4, irtB: 0, status: "DRAFT", createdAt: now, updatedAt: now });
    const fix = await repo.create("QuestionStandardFix", { schoolId, questionId: q.id, fromCode: null, toCode: "RL.4.5", reason: "Suggested from the wording", status: "SUGGESTED", createdAt: now });

    await assert.rejects(reviewStandardFix(repo, teacher, [s(fix.id)], true), ForbiddenError);

    const nRejected = await reviewStandardFix(repo, admin, [s(fix.id)], false, now);
    assert.equal(nRejected, 1);
    assert.equal(s((await repo.findUnique("QuestionStandardFix", { id: fix.id }))!.status), "REJECTED");
    assert.equal((await repo.findUnique("Question", { id: q.id }))!.standardId, null, "rejected: the question keeps no standard");

    await repo.updateMany("QuestionStandardFix", { id: fix.id }, { status: "SUGGESTED" }); // re-open for the approve path
    const nApproved = await reviewStandardFix(repo, admin, [s(fix.id)], true, now);
    assert.equal(nApproved, 1);
    assert.equal(s((await repo.findUnique("QuestionStandardFix", { id: fix.id }))!.status), "APPROVED");
    const after = (await repo.findUnique("Question", { id: q.id }))!;
    assert.ok(after.standardId, "approved: the question took the standard");
  });

  test("savedCounts reflects what is actually saved per grade and area", async () => {
    const counts = await savedCounts(repo, admin);
    const mech = counts.find((c) => c.grade === 4 && c.area === "Language: Understand, Edit for Mechanics");
    assert.ok(mech && mech.n >= 1);
  });
});
