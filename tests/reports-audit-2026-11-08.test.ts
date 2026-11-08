/**
 * 📊 Reports audit (8 Nov 2026) — fictional demo school only:
 *  - possible duplicate students (the same child twice in a class: "Jalawi" / "BIN FAISAL, JALAWI");
 *  - adding by name ignores commas ("FAHAD, ABDULAZIZ" is "Abdulaziz Fahad");
 *  - the student file's effort uses every answer table, like Practice and time.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { looksLikeSameName, nameWords, possibleDuplicateStudents } from "../src/server/admin/duplicate-students";
import { studentEffortAll } from "../src/server/analytics/practice";
import { demoDatabase } from "./helpers/db";

let repo: SqliteRepo; let admin: Actor;
before(async () => {
  ({ repo } = await demoDatabase());
  admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
});

describe("reports audit 8 Nov 2026", () => {
  test("look-alike names", () => {
    assert.deepEqual(nameWords("Abdullah Al-Salman, Mohammed"), ["abdullah", "alsalman", "mohammed"]);
    for (const [a, b] of [["Jalawi", "BIN FAISAL, JALAWI"], ["Hassan Moayad", "MOAYYED, HASSAN"], ["Hussien Ali", "ALI, HUSSEIN"], ["Jawad Mahmoud", "MAHMUOD, JAWAD"]]) assert.ok(looksLikeSameName(a, b), `${a} / ${b}`);
    for (const [a, b] of [["Adam Taha", "Ibrahim, Adam"], ["Mohammed Basel", "Mohammed Essa"], ["Ahmed Ali", "Ahmed Almajed"]]) assert.ok(!looksLikeSameName(a, b), `${a} / ${b}`);
  });

  test("a second account of a student in the same class is listed", async () => {
    const klass = (await repo.findMany("Class", { schoolId: admin.schoolId, deletedAt: null }))[0];
    const member = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }))[0];
    const st = (await repo.findUnique("Student", { id: member.studentId }))!;
    const u = (await repo.findUnique("User", { id: st.userId }))!;
    const words = String(u.displayName).split(/\s+/);
    const twin = `${words.slice(1).join(" ").toUpperCase() || "X"}, ${words[0].toUpperCase()}`;
    const nu = await repo.create("User", { username: "dup.audit.1", displayName: twin, role: "STUDENT", schoolId: admin.schoolId, passwordHash: "x".repeat(60), isActive: true, createdAt: new Date(), updatedAt: new Date() });
    const ns = await repo.create("Student", { userId: nu.id, schoolId: admin.schoolId, gradeId: st.gradeId, studentNumber: "DUP-AUDIT-1", createdAt: new Date() });
    await repo.create("ClassMembership", { classId: klass.id, studentId: ns.id, joinedAt: new Date() });
    const pairs = await possibleDuplicateStudents(repo, admin);
    const p = pairs.find((x) => [x.a.studentId, x.b.studentId].includes(String(ns.id)));
    assert.ok(p, `the pair ${u.displayName} / ${twin} is listed`);
    assert.equal(p!.className, String(klass.name));
  });

  test("effort over every answer table (a number or none)", async () => {
    const st = (await repo.findMany("Student", { schoolId: admin.schoolId }))[0];
    const e = await studentEffortAll(repo, String(st.id));
    assert.ok(e.effort === null || (e.effort >= 0 && e.effort <= 100));
    assert.ok(e.unreliableSessions >= 0);
  });
});
