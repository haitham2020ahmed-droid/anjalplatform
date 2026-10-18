/**
 * 🚩 Owner r68 (2): a question the admin deleted / hid / archived must leave Flagged Questions “To check” — its open
 * reports are resolved as “Removed” (kept, listed under the Removed tab). In-memory SQLite only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { archiveQuestions, deleteQuestions } from "../src/server/admin/question-delete";
import { flagList, flagQuestion } from "../src/server/teacher/classroom";
import { sweepRemovedFlags } from "../src/server/questions/flags-removed";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");

describe("🚩 flags of removed questions leave “To check”", () => {
  let repo: SqliteRepo;
  let admin: Actor, student: Actor;
  let q: string[] = [];

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    const teacher = await actorFor("demo.teacher.4a");
    const teacherRow = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    const classId = s((await repo.findMany("ClassTeacher", { teacherId: teacherRow.id }))[0].classId);
    const studentId = s((await repo.findMany("ClassMembership", { classId }))[0].studentId);
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
    q = (await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: 6 })).map((x) => s(x.id));
    for (const id of q) await flagQuestion(repo, student, id, "UNCLEAR", "I do not understand");
  });

  test("bug reproduced: a question hidden before this fix (deletedAt set, report still OPEN) was listed in “To check”", async () => {
    // the state the live site is in: hidden without touching its report
    await repo.updateMany("Question", { id: q[0] }, { deletedAt: new Date(), status: "ARCHIVED" });
    assert.equal((await repo.findUnique("QuestionFlag", { questionId: q[0], studentId: student.studentId }))!.status, "OPEN", "the stored report is still open");
    const open = await flagList(repo, admin, "OPEN");
    assert.ok(!open.some((r) => r.questionId === q[0]), "the flag list no longer shows it");
    assert.equal((await repo.findUnique("QuestionFlag", { questionId: q[0], studentId: student.studentId }))!.status, "REMOVED", "resolved as Removed");
  });

  test("delete (unanswered: erased), delete (soft), archive: their reports are resolved as Removed at once", async () => {
    await deleteQuestions(repo, admin, [q[1]]);
    await deleteQuestions(repo, admin, [q[2]], new Date(), { soft: true });
    await archiveQuestions(repo, admin, [q[3]], "Wrong key");
    for (const id of [q[1], q[2], q[3]]) {
      const f = await repo.findUnique("QuestionFlag", { questionId: id, studentId: student.studentId });
      assert.equal(f?.status, "REMOVED", id);
      assert.ok(f?.resolvedAt, "with the date");
    }
    const open = (await flagList(repo, admin, "OPEN")).map((r) => r.questionId);
    assert.deepEqual(open.sort(), [q[4], q[5]].sort(), "only questions still in use are to check");
    const removed = (await flagList(repo, admin, "REMOVED")).map((r) => r.questionId);
    for (const id of [q[0], q[1], q[2], q[3]]) assert.ok(removed.includes(id), `${id} under Removed`);
  });

  test("the sweep (Fix stuck questions) is idempotent and leaves live questions alone", async () => {
    assert.equal(await sweepRemovedFlags(repo, admin.schoolId!), 0);
    assert.equal(await repo.count("QuestionFlag", { status: "OPEN" }), 2);
  });

  test("the page has a Removed tab", () => {
    const page = readFileSync(join(ROOT, "src/app/admin/question-flags/page.tsx"), "utf8");
    assert.match(page, /\["REMOVED", "Removed"\]/);
  });
});
