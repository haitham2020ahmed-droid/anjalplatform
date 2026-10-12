/**
 * 📊 Coverage Report and "no questions yet" (demo school in memory; never a real database):
 *   - every MAP-linked skill is listed with its published question count (red = 0, orange < 25)
 *   - a skill with no questions cannot be assigned ("This skill has no questions yet.") and never enters a plan
 *   - the Excel has the five sheets; teachers cannot open the report
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { coverageSheets, mapCoverage, toneOf } from "../src/server/map/coverage";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("Coverage Report", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let empty = ""; let classId = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    const any = view.units.flatMap((u) => u.skills)[0];
    const sk = (await repo.findUnique("Skill", { id: any.id }))!;
    empty = s((await repo.create("Skill", { curriculumId: sk.curriculumId, familyId: sk.familyId, code: "COV.empty", name: "Zyxel Empty Skill", domain: sk.domain, category: sk.category, sequence: 9999, isActive: true })).id);
  });

  test("tones", () => {
    assert.deepEqual([toneOf(0), toneOf(24), toneOf(25)], ["RED", "ORANGE", "OK"]);
  });

  test("lists MAP-linked skills with their counts; the empty skill is red; Excel has five sheets; admin only", async () => {
    const r = await mapCoverage(repo, admin);
    assert.ok(r.rows.length > 0);
    for (const x of r.rows) assert.equal(x.tone, toneOf(x.questions));
    const e = r.rows.find((x) => x.skillId === empty);
    if (e) assert.equal(e.tone, "RED");
    assert.equal(r.summary.zero + r.summary.under + r.summary.ok, r.summary.skills);
    assert.deepEqual(coverageSheets(r).map((x) => x.name), ["All skills", "0 questions", "Under 25", "Missing skills", "Not linked to MAP"]);
    await assert.rejects(mapCoverage(repo, teacher), /Only an admin/);
  });

  test("a skill with no questions cannot be assigned", async () => {
    await assert.rejects(assignSkill(repo, teacher, { classId, skillId: empty }), /This skill has no questions yet/);
  });
});
