/**
 * End-to-end scenarios on the Test School (200 students), through the same server functions the pages use:
 * Admin → Teacher → Student → Teacher, in order, like a real school day.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createGrade, createSkill, createStandard, createUnit, curriculumTree, setSkillActive, updateGrade } from "../src/server/curriculum-manage";
import { getQuestion, listQuestions, updateDraft } from "../src/server/admin/questions";
import { saveQuestionImage } from "../src/server/admin/question-images";
import { archiveQuestions, deleteQuestions } from "../src/server/admin/question-delete";
import { analyzeImport, commitImportChunk, getImportJob } from "../src/server/admin/question-import";
import { assignSkill, assignmentDetail, teacherCurriculum, weeklyAssignments } from "../src/server/teacher/assign";
import { assignedSkills, assignmentReport, isAssignedSkill } from "../src/server/student/assigned";
import { listNotifications, openNotification, unreadCount } from "../src/server/notifications";
import { assignmentUpdatesSettled, startPractice, submitAnswer } from "../src/server/practice/session";
import { loadSkillItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";
import { TEMPLATE_HEADERS } from "../src/imports/questions/template";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"));

describe("end to end: admin → teacher → student → teacher", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  let classId: string, skillId: string, assignmentId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60) });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher, student] = await Promise.all([a("test.admin"), a("test.teacher.1"), a("test.student.020")]);
  });

  test("ADMIN: curriculum management, editing questions (passage, image), delete, archive, import", async () => {
    const g = await createGrade(repo, admin, { level: 3 });
    const u = await createUnit(repo, admin, { gradeId: String(g.id), title: "Animals" });
    await createStandard(repo, admin, { framework: "SCHOOL_OBJECTIVE", code: "SCH.3.1", gradeLevel: 3 });
    const k = await createSkill(repo, admin, { gradeId: String(g.id), unitId: String(u.id), name: "Animal Facts", domain: "READING", category: "INFORMATIONAL", standardCodes: ["SCH.3.1"] });
    await setSkillActive(repo, admin, String(k.id), false);
    await setSkillActive(repo, admin, String(k.id), true);
    await updateGrade(repo, admin, String(g.id), { name: "Grade Three" });
    assert.ok((await curriculumTree(repo, admin)).grades.some((x) => x.name === "Grade Three" && x.units[0].skills[0].standards[0] === "SCH.3.1"));
    const qs = (await listQuestions(repo, admin, { status: "PUBLISHED", limit: 5 })).items;
    const d = await getQuestion(repo, admin, qs[0].id);
    const img = await saveQuestionImage(repo, admin, PNG, "a dot");
    await updateDraft(repo, admin, qs[0].id, { ...d.input, stem: d.input.stem + " (edited)", passageText: "A Short Story\n\nSomething happened.", imageId: img.id });
    let e = (await getQuestion(repo, admin, qs[0].id)).input;
    assert.deepEqual([e.passageText, e.imageId, e.stem.endsWith("(edited)")], ["A Short Story\n\nSomething happened.", img.id, true]);
    await updateDraft(repo, admin, qs[0].id, { ...e, passageText: "", imageId: null });
    e = (await getQuestion(repo, admin, qs[0].id)).input;
    assert.deepEqual([e.passageText, e.imageId], ["", null]);
    assert.equal((await deleteQuestions(repo, admin, [qs[1].id])).deleted, 1);
    assert.equal((await deleteQuestions(repo, admin, [qs[2].id, qs[3].id])).deleted, 2);
    assert.equal((await archiveQuestions(repo, admin, [qs[4].id], "old")).archived, 1);
    const row: Record<string, string> = { "Question Text": "Which animal has feathers?", "Question Type": "Multiple Choice", "Option A": "A bird", "Option B": "A fish", "Correct Answer": "A", Explanation: "Birds have feathers.", Grade: "3", Skill: "Animal Facts", Standard: "SCH.3.1", "Difficulty Level": "2" };
    const csv = [TEMPLATE_HEADERS.join(","), TEMPLATE_HEADERS.map((h) => row[h] ?? "").join(",")].join("\n") + "\n";
    const job = await analyzeImport(repo, admin, { fileName: "new.csv", bytes: new TextEncoder().encode(csv) });
    assert.equal((await getImportJob(repo, admin, job)).totals.valid, 1, "import accepts the admin's new grade and skill at once");
    let p; do { p = await commitImportChunk(repo, admin, job, { publish: true }); } while (!p.done);
    assert.equal(p.counts.imported, 1);
  });

  test("TEACHER: sees own class, assigns to class, selected students and one student", async () => {
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    assert.equal(view.classes.length, 1);
    const assigned = new Set((await assignedSkills(repo, student)).items.map((i) => i.skillId));
    const usable: string[] = [];
    for (const k of view.units.flatMap((x) => x.skills)) if (!assigned.has(k.id) && !usable.includes(k.id) && (await loadSkillItems(repo, k.id)).length >= 5) usable.push(k.id);
    skillId = usable[0];
    const before = await unreadCount(repo, student.userId);
    assignmentId = (await assignSkill(repo, teacher, { classId, skillId, dueAt: new Date(Date.now() + 5 * 86_400_000), note: "Do your best!" })).assignmentId;
    assert.equal((await assignSkill(repo, teacher, { classId, skillId: usable[1], studentIds: view.students.slice(0, 3).map((x) => x.id) })).students, 3);
    assert.equal((await assignSkill(repo, teacher, { classId, skillId: usable[2], studentIds: [view.students[5].id] })).students, 1);
    assert.equal(await unreadCount(repo, student.userId), before + 1, "the student got a notification");
  });

  test("STUDENT: only assigned skills, notification link, start, complete, report, still visible", async () => {
    const home = await assignedSkills(repo, student);
    assert.ok(home.items.some((i) => i.assignmentId === assignmentId && i.status === "NOT_STARTED"));
    assert.ok(home.summary.assigned === home.items.length);
    const n = (await listNotifications(repo, student)).find((x) => x.link === `/student/assignments/${assignmentId}`)!;
    assert.match(n.body, /Do your best!/);
    assert.equal(await openNotification(repo, student, n.id), `/student/assignments/${assignmentId}`);
    assert.equal(await isAssignedSkill(repo, student, skillId), true);
    const items = new Map((await loadSkillItems(repo, skillId)).map((i) => [i.questionId, i]));
    let v = await startPractice(repo, student, skillId);
    // with 5–7 questions per skill, reaching 75% mastery takes about 35 correct answers (repeats count less)
    for (let i = 0; i < 50; i++) {
      const it = items.get(v.question!.questionId)!;
      const r = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.find((o) => o.correct)!.label) : it.type === "TRUE_FALSE" ? it.answer : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p) => [p.left, p.right])) : it.answers?.[0] ?? it.sequence ?? it.errorIndex;
      ({ view: v } = await submitAnswer(repo, student, { sessionId: v.sessionId, questionId: it.questionId, response: r }));
      await assignmentUpdatesSettled();
      const row = (await repo.findMany("AssignmentStudent", { assignmentId, studentId: student.studentId! }))[0];
      if (row.status === "COMPLETED") break;
      if (!v.question) v = await startPractice(repo, student, skillId);
    }
    const after = await assignedSkills(repo, student);
    const mine = after.items.find((i) => i.assignmentId === assignmentId)!;
    assert.equal(mine.status, "COMPLETED", "completed, and still on the home page");
    const rep = await assignmentReport(repo, student, assignmentId);
    assert.ok(rep.answered >= 10 && rep.accuracy === 100 && rep.score >= 75 && rep.completedAt, JSON.stringify(rep));
  });

  test("TEACHER: weekly view and per-student results reflect the student's work", async () => {
    const week = await weeklyAssignments(repo, teacher, new Date(Date.now() - 2 * 86_400_000));
    const row = week.find((r) => r.id === assignmentId)!;
    assert.equal(row.counts.COMPLETED, 1);
    assert.equal(row.assigned, 34);
    const det = await assignmentDetail(repo, teacher, assignmentId);
    const me = det.students.find((x) => x.studentId === student.studentId)!;
    assert.equal(me.status, "COMPLETED");
    assert.equal((await assignmentReport(repo, teacher, assignmentId, student.studentId!)).answered, me.answered);
  });
});
