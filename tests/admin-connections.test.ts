/**
 * 🔗 Admin "Connections" (src/app/admin/connections): is everything on the platform joined up, from the Curriculum
 * Map to students and MAP plans (connections()), kept 10 minutes per school so the admin home page never builds it
 * while anyone waits (connectionsCached / connectionsKept).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { connections, connectionsCached, connectionsKept } from "../src/server/admin/connections";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("🔗 admin Connections", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  let schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("every stage of the learning thread is checked, each share within its total, the score 0–100", async () => {
    const v = await connections(repo, admin);
    assert.deepEqual(v.stages.map((x) => x.key), ["MAP_PLACES", "SKILLS", "QUESTIONS", "MAP", "CONTINUUM", "PEOPLE", "PLANS"]);
    for (const c of v.stages.flatMap((x) => x.checks)) assert.ok(c.ok >= 0 && c.ok <= c.total, c.id);
    assert.ok(v.score >= 0 && v.score <= 100);
    // the demo school has no Learning Continuum imported yet: that check is BAD
    assert.equal(v.stages.find((x) => x.key === "CONTINUUM")!.checks[0].health, "BAD");
  });

  test("teachers additionally need settings:school (they do not have it): refused; students (no reports:read) also refused", async () => {
    await assert.rejects(connections(repo, teacher), ForbiddenError);
    await assert.rejects(connections(repo, student), ForbiddenError);
  });

  test("connectionsCached: two calls inside the 10-minute window for the same school share one in-flight promise", async () => {
    const p1 = connectionsCached(repo, admin);
    const p2 = connectionsCached(repo, admin);
    assert.equal(p1, p2, "the second call hits the cache, not a fresh build");
    const v = await p1;
    assert.ok(v.stages.length > 0);
  });

  test("connectionsKept: null until the cache has a finished view for this school, then the last finished view", async () => {
    const { repo: fresh } = await demoDatabase();
    const a = await resolveActor(fresh, (await fresh.findUnique("User", { username: "demo.admin" }))!);
    assert.equal(connectionsKept(fresh, a), null, "nothing cached yet for this (fresh) school: never built on the admin's wait");
    const v = await connectionsCached(fresh, a);
    assert.deepEqual(connectionsKept(fresh, a), v, "once built, the admin home reads the kept view without waiting");
  });
});
