/**
 * 👩‍🏫 A teacher of TWO classes (demo school in memory; never a real database):
 *   - the assign dialog lists every class the teacher teaches (teacherRoster), and the Curriculum Map roster too
 *   - one skill can be assigned to several classes at once (one assignment per class); picked students are matched
 *     to their own class; a class the teacher does not teach is refused
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkillToClasses, teacherCurriculum, teacherRoster } from "../src/server/teacher/assign";
import { rosterForGrade } from "../src/server/curriculum-map/levels";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("a teacher of two classes", () => {
  let repo: SqliteRepo; let teacher: Actor; let c1 = ""; let c2 = ""; let other = ""; let skillId = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 3, studentsPerClass: 3 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    c1 = view.classId;
    const k1 = (await repo.findUnique("Class", { id: c1 }))!;
    const same = (await repo.findMany("Class", { gradeId: k1.gradeId })).filter((c) => s(c.id) !== c1);
    c2 = s(same[0].id); other = s(same[1].id);
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    await repo.create("ClassTeacher", { classId: c2, teacherId: t.id });
    skillId = view.units.flatMap((u) => u.skills).find((k) => k.questions > 0)!.id;
  });

  test("the assign dialog and the Curriculum Map list BOTH classes", async () => {
    const roster = await teacherRoster(repo, teacher);
    assert.deepEqual(roster.map((c) => c.id).sort(), [c1, c2].sort());
    assert.ok(roster.every((c) => c.students.length === 3));
    const map = await rosterForGrade(repo, teacher, 4);
    assert.deepEqual(map.map((c) => c.id).sort(), [c1, c2].sort());
  });

  test("one skill → both classes at once; picked students go to their own class; another teacher's class is refused", async () => {
    const r = await assignSkillToClasses(repo, teacher, { classIds: [c1, c2], skillId });
    assert.equal(r.classes, 2);
    assert.equal(r.students, 6);
    const rows = await repo.findMany("Assignment", { id: { in: r.assignmentIds } });
    assert.deepEqual(rows.map((a) => s(a.classId)).sort(), [c1, c2].sort());
    const roster = await teacherRoster(repo, teacher);
    const pick = [roster[0].students[0].id, roster[1].students[1].id];
    const r2 = await assignSkillToClasses(repo, teacher, { classIds: [c1, c2], skillId, studentIds: pick });
    assert.deepEqual([r2.classes, r2.students], [2, 2]);
    const before = await repo.count("Assignment", {});
    await assert.rejects(assignSkillToClasses(repo, teacher, { classIds: [c1, other], skillId }), /do not teach/);
    assert.equal(await repo.count("Assignment", {}), before, "nothing written");
  });
});
