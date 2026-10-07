import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveActor } from "../src/server/auth/actor";
import { archiveClass, createClass } from "../src/server/admin/settings";
import { demoDatabase } from "./helpers/db";

describe("classes: an archived name can be used again", () => {
  test("creating a class whose name was archived brings it back in the chosen grade; a live duplicate names its grade", async () => {
    const { repo } = await demoDatabase();
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const id = await createClass(repo, admin, { name: "7Z", gradeLevel: 5 });
    await assert.rejects(createClass(repo, admin, { name: "7Z", gradeLevel: 4 }), /already exists .*Grade 5/);
    await archiveClass(repo, admin, id);
    const again = await createClass(repo, admin, { name: "7Z", gradeLevel: 4 });
    assert.equal(again, id, "the archived class is restored, not duplicated");
    const c = (await repo.findUnique("Class", { id }))!;
    assert.equal(c.deletedAt, null);
    assert.equal(Number((await repo.findUnique("Grade", { id: c.gradeId }))!.level), 4);
  });
});
