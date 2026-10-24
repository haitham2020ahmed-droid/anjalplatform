/**
 * 🩺 Admin/teacher "Data Health" (src/app/admin/data-health): dataHealth() is already thoroughly covered by
 * level-story.test.ts and update40-health.test.ts. New here: the roles dataHealth refuses outright (STUDENT /
 * PARENT), and the admin-only "Needs a look" aggregator (failed imports, auto-hidden questions, platform errors,
 * open alerts) — each of those four server functions is checked against a teacher actor, since the page only ever
 * calls them when isAdmin is true, so a teacher reaching them directly would otherwise go unnoticed.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { dataHealth } from "../src/server/insights/level-story";
import { listImports } from "../src/server/imports/pipeline";
import { listAutoHidden } from "../src/server/questions/auto-check";
import { errorList } from "../src/server/teacher/extras";
import { openAlertCount } from "../src/server/insights/alerts";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("🩺 admin/teacher Data Health", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor, parent: Actor;
  let schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
    const stRow = (await repo.findMany("Student", { schoolId }, { take: 1 }))[0];
    const pu = await repo.create("User", { schoolId, role: "PARENT", username: "demo.parent.dh", displayName: "A Parent", passwordHash: "x".repeat(60), mustChangePassword: false, isActive: true });
    await repo.create("ParentStudent", { parentId: s((await repo.create("Parent", { userId: pu.id })).id), studentId: stRow.id });
    parent = await resolveActor(repo, pu);
  });

  test("dataHealth: teachers and admins may read it; students and parents are refused outright", async () => {
    await dataHealth(repo, teacher);
    await dataHealth(repo, admin);
    await assert.rejects(dataHealth(repo, student), ForbiddenError);
    await assert.rejects(dataHealth(repo, parent), ForbiddenError);
  });

  test("the admin-only 'Needs a look' section's own functions refuse a teacher (the page relies on this, not only on isAdmin)", async () => {
    await assert.rejects(listImports(repo, teacher), ForbiddenError, "imports:run is not a teacher permission");
    await assert.rejects(listAutoHidden(repo, teacher), ForbiddenError, "explicit admin-only role check");
    await assert.rejects(errorList(repo, teacher), ForbiddenError, "isAdmin() guard");
    // openAlertCount does not throw for a teacher: it scopes to the teacher's own classes instead (by design)
    const n = await openAlertCount(repo, teacher);
    assert.ok(typeof n === "number" && n >= 0);
    // admins get the whole school's count without throwing
    const nAdmin = await openAlertCount(repo, admin);
    assert.ok(typeof nAdmin === "number" && nAdmin >= 0);
  });

  test("listImports: an admin sees only this school's import jobs (not another school's)", async () => {
    await repo.create("ImportJob", { kind: "MAP_RESULTS", status: "FAILED", fileName: "other-school.csv", uploadedById: admin.userId, options: { schoolId: "some-other-school" } });
    await repo.create("ImportJob", { kind: "MAP_RESULTS", status: "FAILED", fileName: "mine.csv", uploadedById: admin.userId, options: { schoolId } });
    const mine = await listImports(repo, admin);
    assert.ok(mine.some((j) => j.fileName === "mine.csv"));
    assert.ok(!mine.some((j) => j.fileName === "other-school.csv"));
  });
});
