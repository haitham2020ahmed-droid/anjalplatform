/**
 * Admin Quick Add Students (/admin/quick-students): src/server/admin/quick-students.ts — paste a class's names
 * (one per line) → accounts with a generated username, a student number and a temporary password. Admin
 * (students:manage) only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { nextNumbers, parseQuickLines, pickUsername, quickAddStudents, usernameCandidates } from "../src/server/admin/quick-students";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin Quick Add Students", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId: string; let schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin"); teacher = await a("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    classId = s((await repo.findMany("Class", { schoolId }))[0].id);
  });

  test("usernameCandidates / pickUsername: Arabic family particles are joined, taken names get a number suffix", () => {
    assert.deepEqual(usernameCandidates("Abdulaziz Al Mulhim"), ["abdulaziz.almulhim"]);
    assert.deepEqual(usernameCandidates("Abdulaziz Abdullah Al Mulhim"), ["abdulaziz.almulhim", "abdulaziz.abdullah.almulhim"]);
    const taken = new Set(["layan.ahmed"]);
    assert.equal(pickUsername("Layan Ahmed", taken), "layan.ahmed2");
    assert.ok(taken.has("layan.ahmed2"));
  });

  test("nextNumbers: continues after the highest already used, skips ones already taken", () => {
    assert.deepEqual(nextNumbers(["AJ26-001", "AJ26-003"], 2, 2026), ["AJ26-004", "AJ26-005"]);
    assert.deepEqual(nextNumbers([], 2, 2026), ["AJ26-001", "AJ26-002"]);
  });

  test("parseQuickLines: name / name,number / numbered list / blank lines", () => {
    assert.deepEqual(parseQuickLines("Layan Ahmed\n1. Omar Al Harbi, 1023\n\n  Faisal; AJ26-050  "), [
      { name: "Layan Ahmed", number: null },
      { name: "Omar Al Harbi", number: "1023" },
      { name: "Faisal", number: "AJ26-050" },
    ]);
  });

  test("teachers are refused: students:manage only", async () => {
    await assert.rejects(quickAddStudents(repo, teacher, { classId, text: "Someone New" }), ForbiddenError);
  });

  test("a bad class id, and an empty paste, are refused", async () => {
    await assert.rejects(quickAddStudents(repo, admin, { classId: "no-such-class", text: "Someone" }), ValidationError);
    await assert.rejects(quickAddStudents(repo, admin, { classId, text: "   \n\n  " }), ValidationError);
    await assert.rejects(quickAddStudents(repo, admin, { classId, text: Array.from({ length: 61 }, (_, i) => `Student ${i}`).join("\n") }), ValidationError, "at most 60 at a time");
  });

  test("adds students with usernames, numbers and temporary passwords; a name already in the class is skipped", async () => {
    const r = await quickAddStudents(repo, admin, { classId, text: "Hessa Al Qahtani\nFaisal Omar" }, new Date("2026-10-24T08:00:00Z"));
    assert.equal(r.created.length, 2);
    for (const c of r.created) {
      assert.ok(c.username);
      assert.ok(/^AJ26-\d{3}$/.test(c.number));
      assert.ok(c.password);
      const u = (await repo.findUnique("User", { username: c.username }))!;
      assert.equal(u.role, "STUDENT");
      assert.equal(s(u.displayName), c.name);
    }
    assert.equal(new Set(r.created.map((c) => c.number)).size, 2, "distinct student numbers");

    // adding the same name again (same class) is skipped as a duplicate, not re-created
    const again = await quickAddStudents(repo, admin, { classId, text: "Hessa Al Qahtani" });
    assert.equal(again.created.length, 0);
    assert.equal(again.skipped.length, 1);
    assert.match(again.skipped[0].reason, /already in this class/);
  });

  test("a clashing student number is skipped with the clash reason, the rest of the paste still goes through", async () => {
    const existing = (await repo.findMany("Student", { schoolId }))[0];
    const r = await quickAddStudents(repo, admin, { classId, text: `Someone Clashing, ${existing.studentNumber}\nSomeone Else` });
    const clash = r.skipped.find((x) => x.name === "Someone Clashing")!;
    assert.ok(clash, "the clashing line is skipped");
    assert.ok(r.created.some((c) => c.name === "Someone Else"), "the other line still goes through");
  });
});
