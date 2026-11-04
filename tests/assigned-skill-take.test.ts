/**
 * 📌 Bug report (a school's ELA lead, Grade 5, translated): the teacher's "Assigned" page showed NO skills at all
 * (they had cancelled everything they could see there), but a student's own "My Work" → SKILLS still showed 2
 * Not-started skills the teacher never got to cancel.
 *
 * Root cause: collect()'s SKILL + PROGRESS_CHECK read (teacher/assigned.ts) took only the newest 400 Assignment rows
 * of the class (TAKE * 2, TAKE = 200) — the most frequent kind, since a class accumulates one of these every time a
 * skill, a set of questions or a progress check is assigned. Once a class passed 400 such rows (routine over a term
 * of daily/weekly assigning), an OLDER, still-live, never-cancelled skill fell out of that window: invisible (and so
 * uncancellable) on the Assigned page. The student's own My Work (student/assigned.ts: every AssignmentStudent row
 * of the student, unbounded) kept showing it forever, "Not started" — permanently out of sync, with no way for the
 * teacher to reach it through the normal Assigned page.
 *
 * Fix: the SKILL + PROGRESS_CHECK read is bounded far higher (SKILL_TAKE = 2000, teacher/assigned.ts), matching
 * ASSIGNED_TAKE already used for the same class-history read elsewhere (skills/assigned-skills.ts). This test floods
 * a class with more rows than the OLD bound (400) but fewer than the new one (2000): an old, never-touched skill
 * must still show on Assigned, and cancelling it there must still remove it from the student's My Work at once (the
 * r78 guarantee: cancelled on Assigned = gone everywhere).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkill } from "../src/server/teacher/assign";
import { assignedList, cancelAssignment } from "../src/server/teacher/assigned";
import { myWorkItems } from "../src/server/plans/wizard";
import { allWorkItems } from "../src/server/student/all-work";

const s = (v: unknown) => String(v ?? "");
const MIN = 60_000;

describe("📌 Assigned: an old skill never drops off the page while it is still live (My Work stays in sync)", () => {
  let repo: SqliteRepo; let teacher: Actor; let student: Actor; let classId = "";
  let old1 = ""; let old2 = "";
  const now = new Date("2026-09-01T09:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 5 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    const schoolId = teacher.schoolId!;
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id }, { select: ["id"] });
    // the skills that actually have published questions (assignSkill refuses an empty one)
    const withQuestions: string[] = [];
    for (const k of skills) {
      if ((await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED" }, { select: ["id"], take: 1 })).length) withQuestions.push(s(k.id));
      if (withQuestions.length >= 3) break;
    }
    assert.ok(withQuestions.length >= 3, "the demo bank needs at least 3 skills with questions");

    // two old skills, assigned first — never touched, never cancelled — followed by a flood of newer rows
    old1 = (await assignSkill(repo, teacher, { classId, skillId: withQuestions[0], source: "CURRICULUM" }, now)).assignmentId;
    old2 = (await assignSkill(repo, teacher, { classId, skillId: withQuestions[1], source: "CURRICULUM" }, new Date(now.getTime() + MIN))).assignmentId;
    // more than the OLD bound (400) of newer SKILL rows, fewer than the fixed one (2000)
    for (let i = 0; i < 450; i++) {
      await assignSkill(repo, teacher, { classId, skillId: withQuestions[2], source: "CURRICULUM" }, new Date(now.getTime() + (i + 2) * MIN));
    }
    const ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId)).sort();
    const u = await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: ids[0] }))!.userId });
    student = await resolveActor(repo, u!);
  });

  const nowAfter = () => new Date(now.getTime() + 500 * MIN);

  test("an old, never-cancelled skill still shows on the Assigned page past 400 newer rows", async () => {
    const list = await assignedList(repo, teacher, {}, nowAfter());
    assert.ok(list.items.length > 400, "the class really has more than the old bound's worth of rows");
    assert.ok(list.items.some((i) => i.id === old1), "the first old skill is still on the Assigned page");
    assert.ok(list.items.some((i) => i.id === old2), "the second old skill is still on the Assigned page");
  });

  test("it is also on the student's My Work, under Skills — until the teacher cancels it there", async () => {
    const before1 = await myWorkItems(repo, student, nowAfter());
    assert.ok(before1.some((w) => w.assignmentId === old1), "old1 is in My Work before the cancel");
    assert.ok(before1.some((w) => w.assignmentId === old2), "old2 is in My Work before the cancel");

    await cancelAssignment(repo, teacher, "SKILL", old1, null, nowAfter());

    const afterList = await assignedList(repo, teacher, {}, nowAfter());
    assert.ok(!afterList.items.some((i) => i.id === old1), "cancelled: gone from the default (ACTIVE) Assigned list");
    assert.ok(afterList.items.some((i) => i.id === old2), "old2 was not touched: still there");

    const afterWork = await allWorkItems(repo, student, nowAfter());
    assert.ok(!afterWork.some((w) => w.assignmentId === old1), "cancelled on Assigned = gone from My Work too (r78)");
    assert.ok(afterWork.some((w) => w.assignmentId === old2), "old2 is still in My Work: it was never cancelled");
  });
});
