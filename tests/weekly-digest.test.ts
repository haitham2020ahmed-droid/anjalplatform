/**
 * 📅 Weekly teacher reminder — demo school in memory, never a real database: one notification per teacher with
 * 1+ open alert in their own classes, once per ISO week (a second run the same week sends nothing more), a
 * teacher with no open alerts gets nothing, and another teacher's alerts never count towards mine.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { weeklyTeacherDigests } from "../src/server/insights/weekly-digest";

const s = (v: unknown) => String(v ?? "");

describe("📅 Weekly teacher reminder", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor;
  let classId = ""; let otherClassId = "";
  const now = new Date();

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 3 }));
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await actor("demo.teacher.4a"); other = await actor("demo.teacher.5a");
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    const t2 = await repo.findUnique("Teacher", { userId: other.userId });
    otherClassId = s((await repo.findMany("ClassTeacher", { teacherId: t2!.id }))[0].classId);
    const students = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
    // one open alert in the first teacher's class only
    await repo.create("StudentAlert", { schoolId: teacher.schoolId, classId, studentId: students[0], kind: "NO_PRACTICE", key: "NO_PRACTICE|seed", detail: "No practice for 7 days.", status: "OPEN", createdAt: now });
  });

  test("sends one reminder to the teacher with an open alert, naming the count; the other teacher gets nothing", async () => {
    const sent = await weeklyTeacherDigests(repo, teacher.schoolId!, now);
    assert.equal(sent, 1);
    const mine = await repo.findMany("Notification", { userId: teacher.userId, type: "DAILY_DIGEST" });
    assert.equal(mine.length, 1);
    assert.match(s(mine[0].title), /1 student needs attention this week/);
    assert.match(s(mine[0].link), /^\/teacher\/alerts\?week=\d{4}-W\d{2}$/);
    const theirs = await repo.findMany("Notification", { userId: other.userId, type: "DAILY_DIGEST" });
    assert.equal(theirs.length, 0, "another teacher's class has no open alert, so no reminder");
  });

  test("running again the same week sends nothing more (idempotent)", async () => {
    const sent = await weeklyTeacherDigests(repo, teacher.schoolId!, now);
    assert.equal(sent, 0);
    const mine = await repo.findMany("Notification", { userId: teacher.userId, type: "DAILY_DIGEST" });
    assert.equal(mine.length, 1, "still just the one reminder");
  });

  test("a new ISO week sends again, once", async () => {
    const nextWeek = new Date(now.getTime() + 8 * 86_400_000);
    const sent = await weeklyTeacherDigests(repo, teacher.schoolId!, nextWeek);
    assert.equal(sent, 1);
    const mine = await repo.findMany("Notification", { userId: teacher.userId, type: "DAILY_DIGEST" });
    assert.equal(mine.length, 2);
  });

  test("a teacher with no open alert anywhere gets no reminder, ever", async () => {
    const { db: _db, repo: repo2 } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
    const t = (await repo2.findMany("User", { username: "demo.teacher.4a" }))[0];
    const sent = await weeklyTeacherDigests(repo2, s(t.schoolId), now);
    assert.equal(sent, 0);
    const mine = await repo2.findMany("Notification", { userId: s(t.id), type: "DAILY_DIGEST" });
    assert.equal(mine.length, 0);
  });
});
