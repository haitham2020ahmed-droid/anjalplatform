import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { backupQuestions, backupTemplateRows, cleanupReport, executeCleanup, restoreQuestions, KEPT_TABLES } from "../src/server/admin/question-cleanup";
import { saveQuestionImage } from "../src/server/admin/question-images";
import { getQuestion, updateDraft } from "../src/server/admin/questions";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, submitAnswer } from "../src/server/practice/session";
import { loadSkillItems } from "../src/server/practice/items";
import { workbookXlsx } from "../src/imports/questions/template-files";
import { readXlsx } from "../src/imports/xlsx";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"));

describe("one-time question bank cleanup (rehearsal)", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  let skillId: string;
  let backup: Awaited<ReturnType<typeof backupQuestions>>;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    // like production: an image, a passage, an assignment and some practice
    const q = (await repo.findMany("Question", { status: "PUBLISHED" })).find((x) => !x.passageId)!;
    skillId = String(q.skillId);
    const img = await saveQuestionImage(repo, admin, PNG, "dot");
    await updateDraft(repo, admin, String(q.id), { ...(await getQuestion(repo, admin, String(q.id))).input, imageId: img.id, passageText: "A Story\n\nOnce upon a time." });
    const view = (await teacherCurriculum(repo, teacher))!;
    await assignSkill(repo, teacher, { classId: view.classId, skillId });
    const student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: view.students[0].id }))!.userId }))!);
    const items = await loadSkillItems(repo, skillId);
    let v = await startPractice(repo, student, skillId);
    for (let i = 0; i < 3; i++) {
      const it = items.find((x) => x.questionId === v.question!.questionId)!;
      const r = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.find((o) => o.correct)!.label) : it.type === "TRUE_FALSE" ? it.answer : it.answers?.[0] ?? it.sequence ?? it.errorIndex;
      ({ view: v } = await submitAnswer(repo, student, { sessionId: v.sessionId, questionId: it.questionId, response: r }));
    }
  });

  test("report changes nothing and lists every table", async () => {
    const before = await repo.count("Question", {});
    const r = await cleanupReport(repo);
    assert.equal(r.questions, before);
    assert.equal(r.confirmCode, `DELETE-${before}`);
    assert.equal(r.deleted.QuestionImage, 1);
    assert.ok(r.practice.QuestionAttempt >= 3 && r.needsPracticeFlag);
    assert.ok(r.kept.Skill > 0 && r.kept.ReadingPassage > 0 && r.kept.AssignmentStudent > 0);
    assert.equal(await repo.count("Question", {}), before, "nothing changed");
  });

  test("backup contains everything; the Excel copy re-reads as the import template", async () => {
    backup = await backupQuestions(repo);
    assert.equal(backup.counts.Question, await repo.count("Question", {}));
    assert.equal(backup.counts.QuestionOption, await repo.count("QuestionOption", {}));
    assert.equal(backup.counts.QuestionImage, 1);
    const { rows, skipped } = await backupTemplateRows(repo, backup);
    assert.equal(rows.length - 1 + skipped, backup.counts.Question, "every question is in the Excel or counted as JSON-only");
    const back = readXlsx(Buffer.from(workbookXlsx([{ name: "Questions", rows, widths: rows[0].map(() => 16) }])), { sheet: "Questions" });
    assert.deepEqual(back[0], rows[0]);
    assert.equal(back.length, rows.length);
    const withPassage = back.find((r) => r[13] === "A Story\n\nOnce upon a time.");
    assert.ok(withPassage, "the passage is in the Excel copy");
  });

  test("execute refuses a wrong code, and refuses without the practice flag when students practised", async () => {
    await assert.rejects(executeCleanup(repo, { confirm: "DELETE-1" }), /does not match/);
    const r = await cleanupReport(repo);
    await assert.rejects(executeCleanup(repo, { confirm: r.confirmCode }), /include-practice-history/);
    assert.equal(await repo.count("Question", {}), r.questions, "still nothing deleted");
  });

  test("execute deletes all questions; curriculum, users, classes, passages and assignments stay", async () => {
    const before = await cleanupReport(repo);
    const res = await executeCleanup(repo, { confirm: before.confirmCode, includePracticeHistory: true });
    assert.equal(res.deletedQuestions, before.questions);
    assert.equal(res.verify.questionsLeft, 0);
    assert.deepEqual(res.verify.changedKept, [], "every kept table has exactly the same count");
    for (const t of ["QuestionOption", "QuestionAnswer", "QuestionExplanation", "QuestionImage", "QuestionAttempt", "PracticeSession", "StudentSkillMastery"]) assert.equal(await repo.count(t, {}), 0, t);
    const after = await cleanupReport(repo);
    for (const t of KEPT_TABLES) assert.equal(after.kept[t], before.kept[t], t);
    assert.equal(await repo.count("AssignmentStudent", { status: "NOT_STARTED" }), after.kept.AssignmentStudent, "assignment progress reset, assignments kept");
    assert.equal((await loadSkillItems(repo, skillId)).length, 0, "practice finds no questions");
  });

  test("restore puts every question back, with its image and passage, and practice works again", async () => {
    const out = await restoreQuestions(repo, JSON.parse(JSON.stringify(backup)));
    assert.equal(out.Question, backup.counts.Question);
    assert.equal(await repo.count("Question", {}), backup.counts.Question);
    assert.equal(await repo.count("QuestionOption", {}), backup.counts.QuestionOption);
    const items = await loadSkillItems(repo, skillId);
    assert.ok(items.length > 0);
    const withImage = items.find((i) => i.image);
    if (!withImage) throw new Error("no item with an image");
    assert.equal(withImage.passageText, "A Story\n\nOnce upon a time.");
    assert.deepEqual(Buffer.from((await repo.findUnique("QuestionImage", { id: withImage.image!.id }))!.bytes as Uint8Array), Buffer.from(PNG), "image bytes restored exactly");
    assert.deepEqual(await restoreQuestions(repo, backup).then((o) => o.Question), 0, "running restore twice adds nothing");
  });
});
