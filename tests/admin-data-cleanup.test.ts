/**
 * 🧹 Admin "Data Cleanup" (src/app/admin/data-cleanup): cleanupCounts() is already exercised by
 * admin-school.test.ts for the basic counts and the teacher-forbidden gate. New here: the emptySkills sample (sorted,
 * capped at 8), the explicit STUDENT refusal, the "choose a school first" guard for an actor with no school, and
 * exact draft / under-review counts.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { cleanupCounts } from "../src/server/admin/data-cleanup";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("🧹 admin Data Cleanup", () => {
  let repo: SqliteRepo;
  let admin: Actor, student: Actor;
  let schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("students are refused outright (not only lacking students:manage)", async () => {
    await assert.rejects(cleanupCounts(repo, student), ForbiddenError);
  });

  test("an admin with no school at all is refused with a clear reason, not a crash", async () => {
    const noSchool: Actor = { ...admin, schoolId: null };
    await assert.rejects(cleanupCounts(repo, noSchool), /Choose a school first/);
  });

  test("skills with no live (draft/review/published) question are listed up to 8, sorted by grade then name", async () => {
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const emptySkill = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true }, { select: ["id", "name", "code"] })).find((k) => !s(k.code).includes("unclassified"))!;
    // this skill starts with no live question in the fresh curriculum, but make sure, then give every other
    // skill at least a draft so only ours (plus whatever else is genuinely empty) stays interesting
    const c = await cleanupCounts(repo, admin);
    const before = c.skillsWithoutQuestions;
    assert.ok(before >= 1, "a brand-new curriculum has skills with no questions at all");
    assert.ok(c.emptySkills.length <= 8, "capped at 8 for the card's small text");
    for (let i = 1; i < c.emptySkills.length; i++) {
      const a = c.emptySkills[i - 1], b = c.emptySkills[i];
      assert.ok(a.grade < b.grade || (a.grade === b.grade && a.name.localeCompare(b.name) <= 0));
    }
    // give the picked skill a draft question: it drops out of "without questions" (a draft counts as live)
    const type = (await repo.findMany("QuestionType", {}))[0] ?? (await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "Multiple choice" }));
    await repo.create("Question", { skillId: emptySkill.id, typeId: type.id, stem: "A new draft", content: {}, tags: null, difficultyLevel: 4, irtB: 0, status: "DRAFT", createdAt: new Date(), updatedAt: new Date() });
    const after = await cleanupCounts(repo, admin);
    assert.equal(after.skillsWithoutQuestions, before - 1, "one fewer skill without questions");
    assert.ok(!after.emptySkills.some((k) => k.id === s(emptySkill.id)));
    assert.equal(after.drafts, c.drafts + 1);
  });

  test("underReview vs drafts are counted separately", async () => {
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skill = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true }, { take: 1 }))[0];
    const type = (await repo.findMany("QuestionType", {}))[0];
    const before = await cleanupCounts(repo, admin);
    await repo.create("Question", { skillId: skill.id, typeId: type.id, stem: "Awaiting review", content: {}, difficultyLevel: 4, irtB: 0, status: "UNDER_REVIEW", createdAt: new Date(), updatedAt: new Date() });
    const after = await cleanupCounts(repo, admin);
    assert.equal(after.underReview, before.underReview + 1);
    assert.equal(after.drafts, before.drafts, "the new row is UNDER_REVIEW, not a draft");
  });
});
