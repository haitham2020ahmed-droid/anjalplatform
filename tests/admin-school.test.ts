import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { verifyPassword } from "../src/server/auth/password";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { moveStudent } from "../src/server/admin/users";
import { addClass, addGrade, addStudentsToClass, createTeacherWithClasses, resetClassPasswords, schoolTree } from "../src/server/admin/school";
import { cleanupCounts } from "../src/server/admin/data-cleanup";
import { cleanPath, listFeedback, saveFeedback, setFeedbackResolved } from "../src/server/admin/feedback";
import { nightlySort, sortBatch } from "../src/server/questions/link-bank-run";
import { unclassifiedSkillId } from "../src/server/curriculum-map/questions";
import { classesByGrade, parseNewClasses, roleAfterResult } from "../src/app/admin/users/form-state";
import { matchesSearch } from "../src/app/admin/school/search";
import { demoDatabase } from "./helpers/db";

const now = new Date("2026-10-11T08:00:00Z");
const s = (v: unknown) => String(v ?? "");

describe("admin School page, sort questions, data cleanup, feedback", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let schoolId: string;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("the tree: grades → classes → teachers → students", async () => {
    const t = await schoolTree(repo, admin);
    assert.ok(t.grades.length >= 1);
    const g4 = t.grades.find((g) => g.level === 4)!;
    assert.ok(g4.classes.length >= 1);
    assert.ok(g4.classes.some((c) => c.teachers.length > 0 && c.students.length > 0));
    assert.ok(matchesSearch("ليان", "Layan", "ليان أحمد"));
    assert.ok(matchesSearch("احمد", "ليان أحمد"), "alef with hamza = alef");
    assert.ok(matchesSearch("OMAR", "omar.alharbi"));
    assert.ok(!matchesSearch("zzz", "omar"));
    assert.ok(matchesSearch("", "anything"));
  });

  test("add a grade (1–12 only, once) and a class under it", async () => {
    await assert.rejects(addGrade(repo, admin, 13, now), ValidationError);
    const gid = await addGrade(repo, admin, 9, now);
    assert.equal(Number((await repo.findUnique("Grade", { id: gid }))!.level), 9);
    await assert.rejects(addGrade(repo, admin, 9, now), /already exists/);
    const cid = await addClass(repo, admin, { name: "9A", gradeLevel: 9 }, now);
    assert.equal(s((await repo.findUnique("Class", { id: cid }))!.gradeId), gid);
    assert.ok((await schoolTree(repo, admin)).grades.find((g) => g.level === 9)!.classes.some((c) => c.id === cid));
  });

  test("new teacher with classes in one step (password = username), including a new class", async () => {
    const t = await schoolTree(repo, admin);
    const existing = t.grades.find((g) => g.level === 4)!.classes[0].id;
    const r = await createTeacherWithClasses(repo, admin, { username: "t.noura", displayName: "Noura Saleh", title: "Ms", classIds: [existing], newClasses: [{ name: "9B", gradeLevel: 9 }] }, now);
    assert.equal(r.classes, 2);
    const u = (await repo.findUnique("User", { id: r.userId }))!;
    assert.equal(u.role, "TEACHER");
    assert.ok(await verifyPassword("t.noura", s(u.passwordHash)));
    const tr = (await repo.findUnique("Teacher", { userId: r.userId }))!;
    assert.equal(await repo.count("ClassTeacher", { teacherId: tr.id }), 2);
    await assert.rejects(createTeacherWithClasses(repo, admin, { username: "t.noura", displayName: "Again" }, now), /already taken/);
  });

  test("add students to a class, move one, reset the class's passwords to the username", async () => {
    const t = await schoolTree(repo, admin);
    const [a, b] = t.grades.find((g) => g.level === 4)!.classes;
    const added = await addStudentsToClass(repo, admin, a.id, "Hessa Al Qahtani\nFaisal Omar", now);
    assert.equal(added.created.length, 2);
    const hessa = (await repo.findUnique("User", { username: added.created[0].username }))!;
    await moveStudent(repo, admin, s(hessa.id), b.id, now);
    const after = await schoolTree(repo, admin);
    const g4 = after.grades.find((g) => g.level === 4)!;
    assert.ok(g4.classes.find((c) => c.id === b.id)!.students.some((x) => x.userId === s(hessa.id)));
    assert.ok(!g4.classes.find((c) => c.id === a.id)!.students.some((x) => x.userId === s(hessa.id)));
    const n = await resetClassPasswords(repo, admin, b.id, now);
    assert.ok(n >= 1);
    const h2 = (await repo.findUnique("User", { id: hessa.id }))!;
    assert.ok(await verifyPassword(s(h2.username), s(h2.passwordHash)));
    // only this class: the school-wide "password = username" setting is not switched on
    assert.equal(await repo.count("SchoolSetting", { schoolId, key: "students.passwordMode" }), 0);
  });

  test("teachers and students are refused", async () => {
    const t = await schoolTree(repo, admin);
    const cls = t.grades[0].classes[0].id;
    await assert.rejects(schoolTree(repo, teacher), ForbiddenError);
    await assert.rejects(addGrade(repo, teacher, 10, now), ForbiddenError);
    await assert.rejects(createTeacherWithClasses(repo, teacher, { username: "t.x123", displayName: "X" }, now), ForbiddenError);
    await assert.rejects(resetClassPasswords(repo, teacher, cls, now), ForbiddenError);
    await assert.rejects(addStudentsToClass(repo, student, cls, "Someone", now), ForbiddenError);
    await assert.rejects(cleanupCounts(repo, teacher), ForbiddenError);
    await assert.rejects(sortBatch(repo, teacher, { after: null, apply: false }), ForbiddenError);
    await assert.rejects(listFeedback(repo, teacher), ForbiddenError);
  });

  test("sort questions: preview counts write nothing; run links sure ones, lists the rest; nothing deleted or published", async () => {
    const hidden = await unclassifiedSkillId(repo, schoolId, 4);
    const type = (await repo.findMany("QuestionType", {}))[0] ?? (await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "Multiple choice" }));
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const realSkill = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true }, { select: ["id", "name", "code"] })).find((k) => !s(k.code).includes("unclassified"))!;
    const mk = async (stem: string, tags: unknown) => s((await repo.create("Question", { skillId: hidden, typeId: type.id, stem, content: {}, tags, difficultyLevel: 4, irtB: 0, status: "DRAFT", createdAt: now, updatedAt: now })).id);
    const sure = await mk("SORT which word tells the main idea?", { skill: s(realSkill.name) });
    const unsure = await mk("SORT a question about rain clouds?", null);
    const before = await repo.count("Question", {});

    const preview = await sortBatch(repo, admin, { after: null, apply: false }, now);
    assert.equal(preview.total, 2);
    assert.equal(preview.processed, 2);
    assert.equal(preview.linked, 1);
    assert.equal(preview.review, 1);
    assert.equal(s((await repo.findUnique("Question", { id: sure }))!.skillId), hidden, "preview: nothing moved");
    assert.equal(await repo.count("SkillLinkReview", {}), 0, "preview: nothing filed");

    const cleanup = await cleanupCounts(repo, admin);
    assert.equal(cleanup.unclassified, 2);
    assert.ok(cleanup.drafts >= 2);

    let after: string | null = null, linked = 0;
    const review: string[] = [];
    for (;;) { const r = await sortBatch(repo, admin, { after, apply: true }, now); linked += r.linked; review.push(...r.reviewItems.map((x) => x.questionId)); if (r.done || !r.next) break; after = r.next; }
    assert.equal(linked, 1);
    assert.deepEqual(review, [unsure]);
    assert.equal(s((await repo.findUnique("Question", { id: sure }))!.skillId), s(realSkill.id));
    assert.equal(s((await repo.findUnique("Question", { id: unsure }))!.skillId), hidden);
    assert.equal(await repo.count("Question", {}), before, "never deletes");
    assert.equal(s((await repo.findUnique("Question", { id: sure }))!.status), "DRAFT", "never publishes");
    assert.equal(await repo.count("SkillLinkReview", { kind: "QUESTION", subjectId: unsure, status: "OPEN" }), 1);

    // nightly: once per day
    const n1 = await nightlySort(repo, schoolId, now);
    assert.equal(n1.ran, true);
    const n2 = await nightlySort(repo, schoolId, new Date(now.getTime() + 60_000));
    assert.equal(n2.ran, false);
  });

  test("data cleanup counts", async () => {
    const c = await cleanupCounts(repo, admin);
    assert.ok(c.classesWithoutTeacher >= 1, "9A has no teacher");
    assert.ok(c.studentsWithoutMap >= 1);
    assert.equal(typeof c.skillsWithoutQuestions, "number");
    assert.equal(c.studentsWithoutClass, (await schoolTree(repo, admin)).withoutClass.length);
  });

  test("feedback: anyone saves, only the school's admins list and resolve", async () => {
    assert.equal(cleanPath("/teacher/classes/abc?student=1#x"), "/teacher/classes/abc");
    await assert.rejects(saveFeedback(repo, student, { message: "   " }, now), ValidationError);
    const id = await saveFeedback(repo, student, { message: "The game button is hard to find.", path: "/student/games?x=1" }, now);
    await saveFeedback(repo, teacher, { message: "Please add a print button.", path: "/teacher" }, now);
    const list = await listFeedback(repo, admin);
    assert.equal(list.length, 2);
    const mine = list.find((f) => f.id === id)!;
    assert.equal(mine.path, "/student/games");
    assert.equal(mine.role, "STUDENT");
    assert.equal(mine.resolved, false);
    await setFeedbackResolved(repo, admin, id, true);
    assert.equal((await listFeedback(repo, admin, { resolved: false })).length, 1);
    assert.equal((await listFeedback(repo, admin)).at(-1)!.id, id, "resolved notes go last");
    await assert.rejects(setFeedbackResolved(repo, teacher, id, false), ForbiddenError);
  });

  test("create-user form: the role resets with the form; classes grouped by grade; new class rows", () => {
    assert.equal(roleAfterResult({ ok: true }, "TEACHER"), "STUDENT");
    assert.equal(roleAfterResult({ error: "Username taken" }, "TEACHER"), "TEACHER");
    assert.equal(roleAfterResult(null, "TEACHER"), "TEACHER");
    const g = classesByGrade([{ id: "1", name: "4B", grade: 4 }, { id: "2", name: "4A", grade: 4 }, { id: "3", name: "10A", grade: 10 }, { id: "4", name: "X", grade: 13 }]);
    assert.deepEqual(g.map((x) => [x.grade, x.classes.map((c) => c.name)]), [[4, ["4A", "4B"]], [10, ["10A"]]]);
    assert.deepEqual(parseNewClasses(["5|5C", "0|bad", "7|", "12|12 Science"]), [{ gradeLevel: 5, name: "5C" }, { gradeLevel: 12, name: "12 Science" }]);
  });
});
