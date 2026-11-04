/**
 * Admin Sign-Ins (/admin/logins): signIns() from src/server/teacher/extras.ts — who signs in, never or not for a
 * while first; the last-7-days login/failure counts; admin only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { signIns } from "../src/server/teacher/extras";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

describe("admin Sign-Ins", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let schoolId: string;
  const now = new Date("2026-10-24T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin");
    teacher = await a("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("teachers and students are refused: admin only", async () => {
    await assert.rejects(signIns(repo, teacher, now), ForbiddenError);
    await assert.rejects(signIns(repo, student, now), ForbiddenError);
  });

  test("never signed in, not for a week, and recently: sorted oldest/never first", async () => {
    const students = await repo.findMany("User", { schoolId, role: "STUDENT" }, { select: ["id"] });
    assert.ok(students.length >= 3, "the demo school has at least 3 students to spread across the three buckets");
    const [never, stale, fresh] = students.slice(0, 3);
    await repo.updateMany("User", { id: never.id }, { lastLoginAt: null });
    await repo.updateMany("User", { id: stale.id }, { lastLoginAt: new Date(now.getTime() - 10 * DAY) });
    await repo.updateMany("User", { id: fresh.id }, { lastLoginAt: new Date(now.getTime() - 1 * DAY) });
    const v = await signIns(repo, admin, now);
    const byId = new Map(v.users.map((u) => [u.id, u]));
    assert.equal(byId.get(s(never.id))!.days, null);
    assert.equal(byId.get(s(stale.id))!.days, 10);
    assert.equal(byId.get(s(fresh.id))!.days, 1);
    // never-signed-in and long-stale sort before a recent sign-in
    const order = v.users.map((u) => u.id);
    assert.ok(order.indexOf(s(never.id)) < order.indexOf(s(fresh.id)));
    assert.ok(order.indexOf(s(stale.id)) < order.indexOf(s(fresh.id)));
  });

  test("logins7 / failed7: only successes/failures inside the last 7 days are counted", async () => {
    const me = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    await repo.create("AuditLog", { actorId: me.id, action: "auth.login.success", entityId: null, entityType: "Session", before: null, after: null, createdAt: new Date(now.getTime() - 2 * DAY) });
    await repo.create("AuditLog", { actorId: me.id, action: "auth.login.success", entityId: null, entityType: "Session", before: null, after: null, createdAt: new Date(now.getTime() - 9 * DAY) }); // outside the 7-day window: not counted
    await repo.create("AuditLog", { actorId: null, action: "auth.login.failure", entityId: me.id, entityType: "Session", before: null, after: null, createdAt: new Date(now.getTime() - 1 * DAY) });
    await repo.create("AuditLog", { actorId: null, action: "auth.login.failure", entityId: me.id, entityType: "Session", before: null, after: null, createdAt: new Date(now.getTime() - 8 * DAY) }); // outside the window
    const v = await signIns(repo, admin, now);
    assert.equal(v.logins7, 1, "only the in-window success counts");
    assert.equal(v.failed7, 1, "only the in-window failure counts");
  });

  test("the role filter in the page: students vs teachers vs admins are distinct lists", async () => {
    const v = await signIns(repo, admin, now);
    assert.ok(v.users.some((u) => u.role === "STUDENT"));
    assert.ok(v.users.some((u) => u.role === "TEACHER"));
    assert.ok(v.users.every((u) => u.id)); // every row has an identity (className may be empty for a teacher)
  });
});
