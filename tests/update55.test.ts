/**
 * Update 55 — demo school in memory, never a real database:
 *   🧭 Curriculum Map: a teacher sees their own grade only (admins every grade); ✓ Sent marks
 *   ✏️ teacher edits of any question wait for the admin; approve / reject; new version when answered; edit log + Restore
 *   📝 Review & Send: drafts (nothing reaches students), send later, withdraw
 *   🧹 Question Check: definite errors hidden automatically; teachers report problems; skills under 25
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { curriculumMapView, teacherMapGrades } from "../src/server/curriculum-map/view";
import { sentOn } from "../src/server/curriculum-map/sent";
import { getQuestion } from "../src/server/admin/questions";
import { decideEdit, editLogOf, editNeedsApproval, editRequestOf, listEditRequests, requestEdit, restoreEdit } from "../src/server/admin/question-edits";
import { countDeletionRequests } from "../src/server/admin/question-requests";
import { deleteAssignDraft, listAssignDrafts, saveAssignDraft, sendAssignDraft, withdrawAssignments } from "../src/server/teacher/assign-drafts";
import { listTemplates } from "../src/server/tests/assessments";
import { autoHideBroken, definiteProblem, listAutoHidden } from "../src/server/questions/auto-check";
import { thinSkills, topUpSkills } from "../src/server/questions/min-per-skill";
import { loadSkillSetsFile } from "../src/server/questions/skill-sets";
import { reportQuestionProblem } from "../src/server/teacher/classroom";

const s = (v: unknown) => String(v ?? "");

describe("Update 55", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId = ""; let classId = ""; let qid = ""; let skillId = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => s(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = admin.schoolId!;
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    const mc = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const q = (await repo.findMany("Question", { status: "PUBLISHED", typeId: mc.id })).find((x) => s(x.externalRef).startsWith("G4-") && !x.passageId)!;
    qid = s(q.id); skillId = s(q.skillId);
  });

  test("🧭 a teacher sees the Curriculum Map of their own grade only; admins see every grade", async () => {
    for (const level of [4, 5]) {
      const grade = (await repo.findMany("Grade", { schoolId, level }))[0];
      await repo.create("CurriculumMapNode", { gradeId: grade.id, kind: "BOOK", code: `G${level}.BOOK`, title: `Grade ${level}`, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
    }
    assert.deepEqual([...(await teacherMapGrades(repo, teacher))!], [4]);
    assert.equal(await teacherMapGrades(repo, admin), null);
    assert.deepEqual((await curriculumMapView(repo, teacher)).grades.map((g) => g.level), [4]);
    assert.equal((await curriculumMapView(repo, teacher, 5)).level, 4, "asking for Grade 5 still shows the teacher's grade");
    assert.deepEqual((await curriculumMapView(repo, admin)).grades.map((g) => g.level), [4, 5]);
    // ✓ Sent: a section is sent when it or one of its levels was assigned
    const sent = new Map([["G4.U1.TS1.ACS.ON", new Date("2026-10-01")]]);
    assert.ok(sentOn(sent, "G4.U1.TS1.ACS"));
    assert.equal(sentOn(sent, "G4.U1.TS1.CV"), null);
    const page = readFileSync(join(ROOT, "src/app/admin/curriculum-map/page.tsx"), "utf8");
    assert.ok(!page.includes("Send the whole curriculum plan"), "the whole-curriculum button is gone");
  });

  test("✏️ a teacher's change waits for the admin; approved it applies; the log keeps the version before; Restore", async () => {
    const q0 = (await repo.findUnique("Question", { id: qid }))!;
    assert.ok(editNeedsApproval(teacher, q0), "a published question of the bank goes to the admin");
    assert.ok(!editNeedsApproval(admin, q0));
    const input = (await getQuestion(repo, admin, qid)).input;
    const changed = { ...input, stem: `${input.stem} (changed by the teacher)` };
    await requestEdit(repo, teacher, qid, changed);
    let q = (await repo.findUnique("Question", { id: qid }))!;
    assert.equal(s(q.stem), s(q0.stem), "students still see the old wording");
    assert.equal(editRequestOf(q)!.byName.length > 0, true);
    assert.equal(await countDeletionRequests(repo, admin), 1, "the admin's badge counts the change");
    const rows = await listEditRequests(repo, admin);
    assert.equal(rows.length, 1); assert.ok(rows[0].changes.includes("Question text"));
    const r = await decideEdit(repo, admin, qid, true);
    assert.equal(r.id, qid, "not answered yet: changed in place");
    q = (await repo.findUnique("Question", { id: qid }))!;
    assert.match(s(q.stem), /changed by the teacher/);
    assert.equal(editRequestOf(q), null);
    const log = editLogOf(q);
    assert.equal(log.length, 1); assert.equal(log[0].stemBefore, s(q0.stem));
    assert.ok((await repo.findMany("Notification", { userId: teacher.userId, title: "Your question change was approved" })).length);
    // ↩ Restore
    await restoreEdit(repo, admin, qid, log[0].at);
    q = (await repo.findUnique("Question", { id: qid }))!;
    assert.equal(s(q.stem), s(q0.stem));
    assert.equal(editLogOf(q)[0].kind, "RESTORE");
  });

  test("✏️ rejected: nothing changes; answered question: approval makes a new version (history kept)", async () => {
    const input = (await getQuestion(repo, admin, qid)).input;
    await requestEdit(repo, teacher, qid, { ...input, stem: `${input.stem} (rejected)` });
    await decideEdit(repo, admin, qid, false, "Keep it");
    assert.ok(!s((await repo.findUnique("Question", { id: qid }))!.stem).includes("(rejected)"));
    // a student answered it → a new version replaces it
    const st = (await repo.findMany("Student", {}))[0];
    const ses = await repo.create("PracticeSession", { studentId: st.id, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: st.id, questionId: qid, skillId, isCorrect: true, response: {}, responseMs: 5000, difficultyB: 0, createdAt: new Date() });
    await requestEdit(repo, teacher, qid, { ...input, stem: `${input.stem} (v2)` });
    const r = await decideEdit(repo, admin, qid, true);
    assert.notEqual(r.id, qid);
    assert.equal(s((await repo.findUnique("Question", { id: qid }))!.status), "ARCHIVED", "the answered version is archived");
    const v2 = (await repo.findUnique("Question", { id: r.id }))!;
    assert.equal(s(v2.status), "PUBLISHED"); assert.match(s(v2.stem), /\(v2\)/);
    assert.equal(editRequestOf(v2), null);
  });

  test("📝 drafts reach nobody until sent; withdraw removes sent work; drafts are not test templates", async () => {
    const other = (await repo.findMany("Skill", { code: "G4.context-clues" }))[0];
    const id = await saveAssignDraft(repo, teacher, { skillId: s(other.id), skillName: s(other.name), classIds: [classId], studentIds: [], track: "CURRICULUM", source: "CURRICULUM", program: null, questionIds: null, startAt: null, dueAt: "2026-12-01", note: "" });
    assert.equal((await repo.findMany("Assignment", { skillId: s(other.id) })).length, 0, "a draft sends nothing");
    assert.equal((await listAssignDrafts(repo, teacher)).length, 1);
    assert.equal((await listTemplates(repo, teacher)).length, 0, "not shown among test templates");
    const r = await sendAssignDraft(repo, teacher, id);
    assert.equal(r.assignmentIds.length, 1);
    assert.equal((await listAssignDrafts(repo, teacher)).length, 0);
    assert.equal(await withdrawAssignments(repo, teacher, r.assignmentIds), 1);
    assert.ok((await repo.findUnique("Assignment", { id: r.assignmentIds[0] }))!.deletedAt, "withdrawn");
    const id2 = await saveAssignDraft(repo, teacher, { skillId: s(other.id), skillName: "x", classIds: [classId], studentIds: [], track: "CURRICULUM", source: "CURRICULUM", program: null, questionIds: null, startAt: null, dueAt: null, note: "" });
    await deleteAssignDraft(repo, teacher, id2);
    assert.equal((await listAssignDrafts(repo, teacher)).length, 0);
  });

  test("🧹 definite errors are hidden automatically; doubtful ones are not", async () => {
    assert.equal(definiteProblem({ stem: "", type: "MULTIPLE_CHOICE" }, []), "The question has no text.");
    assert.match(definiteProblem({ stem: "Q?", type: "MULTIPLE_CHOICE" }, [{ text: "a", isCorrect: true }, { text: "b", isCorrect: true }])!, /More than one/);
    assert.match(definiteProblem({ stem: "Q?", type: "MULTIPLE_CHOICE" }, [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }])!, /No answer/);
    assert.match(definiteProblem({ stem: "Q?", type: "MULTIPLE_CHOICE" }, [{ text: "Same  answer.", isCorrect: true }, { text: "Same answer.", isCorrect: false }])!, /same/);
    assert.equal(definiteProblem({ stem: "Which is capitalized correctly?", type: "MULTIPLE_CHOICE" }, [{ text: "Mr. Ali", isCorrect: true }, { text: "mr. ali", isCorrect: false }]), null, "capitalization choices differ by case: not a problem");
    assert.equal(definiteProblem({ stem: "Q?", type: "MULTIPLE_CHOICE" }, [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }]), null);
    assert.equal(definiteProblem({ stem: "Q?", type: "TRUE_FALSE" }, []), null);
    const mc = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const bad = await repo.create("Question", { skillId, typeId: mc.id, stem: "Broken: two keys?", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
    for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: bad.id, label: o, text: `Option ${o}`, isCorrect: i < 2, order: i });
    const r = await autoHideBroken(repo, admin);
    assert.ok(r.checked > 50);
    assert.ok(r.hidden.some((h) => h.id === bad.id));
    assert.equal(s((await repo.findUnique("Question", { id: bad.id }))!.status), "UNDER_REVIEW", "students no longer get it");
    assert.ok((await listAutoHidden(repo, admin)).some((h) => h.id === bad.id));
    assert.ok(!(await autoHideBroken(repo, admin)).hidden.length, "running again hides nothing new");
    // a question that needs a passage but has none: never served, and hidden by the check
    const np = await repo.create("Question", { skillId, typeId: mc.id, stem: "According to the passage, why did the river flood?", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
    for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: np.id, label: o, text: `Reason ${o}`, isCorrect: i === 0, order: i });
    const { loadQuestionItems } = await import("../src/server/practice/items");
    assert.equal((await loadQuestionItems(repo, [String(np.id)])).length, 0, "a student never gets it");
    const r2 = await autoHideBroken(repo, admin);
    assert.ok(r2.hidden.some((h) => h.id === np.id && /no passage/.test(h.problem)));
    assert.equal(definiteProblem({ stem: "Choose the article: \"I ate ____ orange.\"", type: "MULTIPLE_CHOICE", hasPassage: false }, [{ text: "an", isCorrect: true }, { text: "a", isCorrect: false }]), null, "the grammar word article is not a text");
  });

  test("🚩 a teacher reports a problem (the admin's Flags list); 📏 skills under 25 questions are listed", async () => {
    await reportQuestionProblem(repo, teacher, qid, "WRONG_ANSWER", "Option B is also right");
    const f = await repo.findMany("QuestionFlag", { questionId: qid, studentId: teacher.userId });
    assert.equal(f.length, 1); assert.equal(s(f[0].status), "OPEN");
    const thin = await thinSkills(repo, schoolId);
    assert.ok(thin.length > 0 && thin.every((x) => x.questions < 25 && x.missing === 25 - x.questions));
  });

  test("📏 top-up: a thin skill gets only what it is missing (Below / On / Above in turn); running again adds nothing", async () => {
    const sets = (await loadSkillSetsFile("topup-skill-sets.json")).filter((x) => x.skill === "Theme");
    assert.equal(sets.length, 1);
    const before = (await thinSkills(repo, schoolId)).find((x) => x.name === "Theme");
    assert.ok(before && before.missing > 0);
    const r = await topUpSkills(repo, schoolId, sets);
    assert.equal(r.added, Math.min(before.missing, sets[0].questions.length));
    const after = (await thinSkills(repo, schoolId)).find((x) => x.name === "Theme");
    assert.equal(after?.questions ?? 25, before.questions + r.added);
    assert.equal((await topUpSkills(repo, schoolId, sets)).added, 0, "safe to run again");
    const file = await loadSkillSetsFile("topup-skill-sets.json");
    assert.equal(file.length, 141);
    for (const x of file) for (const q of x.questions) { assert.equal(q.options!.length, 4); assert.match(q.correct!, /^[ABCD]$/); }
  });
});
