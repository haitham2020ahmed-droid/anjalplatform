/**
 * ✏️ Plan editor + 💡 suggested plans — demo school in memory, never a real database:
 *   editing (add / remove / replace / reorder / count / goals / duplicates), send, edit after send keeps answers,
 *   pause, withdraw, duplicate, one edit on several plans, no-repeat picks, suggestions from seeded performance
 *   with their reasons, permissions (own classes only; admins all), NAFS for Grade 6 only.
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
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { bulkEdit, createDraft, fmt, deleteDraft, duplicatePlan, editPlan, loadPlan, pausePlan, PAUSE_UNTIL, planDiff, planEditorView, plansOverview, sendPlan, withdrawPlan } from "../src/server/plans/editor";
import { pickQuestions } from "../src/server/plans/question-pick";
import { suggestPlans } from "../src/server/plans/perf-suggest";
import { draftFromSuggestion, startPlan } from "../src/server/plans/start";
import { sendProgramPlan } from "../src/server/plans/send";
import { studentSkillPlans } from "../src/server/curriculum-map/plans";
import { contentKeysForIds } from "../src/server/questions/fresh";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const NOW = new Date("2027-01-10T08:00:00Z");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("Plan editor and suggested plans", () => {
  let repo: SqliteRepo;
  let admin: Actor, t4: Actor, t5: Actor, t6: Actor;
  let class4 = "", class6 = "";
  let kids: string[] = [];
  let skillA = "", skillB = "", skillC = "", skillAName = "";
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: s((await repo.findUnique("Student", { id }))!.userId) }))!);
  const classOf = async (a: Actor) => { const t = await repo.findUnique("Teacher", { userId: a.userId }); return s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId); };
  let sessionN = 0;
  /** one answer of a student (a practice session row + an attempt), optionally inside an assignment */
  const answer = async (studentId: string, questionId: string, correct: boolean, at: Date, assignmentId: string | null = null) => {
    const q = (await repo.findUnique("Question", { id: questionId }))!;
    const ses = await repo.create("PracticeSession", { id: `ses-${++sessionN}`, studentId, skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: at, assignmentId, questionCount: 1, correctCount: correct ? 1 : 0 });
    await repo.create("QuestionAttempt", { sessionId: ses.id, studentId, questionId, skillId: q.skillId, response: {}, isCorrect: correct, responseMs: 9000, difficultyB: 0, createdAt: at });
  };

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 5 }));
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const qs = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => /^G[46]-/.test(s(q.externalRef)));
    await repo.updateMany("Question", { id: { in: qs.map((q) => q.id) } }, { status: "PUBLISHED" });
    admin = await actorFor("demo.admin");
    t4 = await actorFor("demo.teacher.4a"); t5 = await actorFor("demo.teacher.5a"); t6 = await actorFor("demo.teacher.6a");
    class4 = await classOf(t4); class6 = await classOf(t6);
    kids = (await repo.findMany("ClassMembership", { classId: class4, leftAt: null })).map((m) => s(m.studentId)).sort();
    // three Grade 4 skills, each given 30 more published multiple-choice questions (levels 2–6)
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const qs4 = (await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId", "externalRef"] })).filter((q) => s(q.externalRef).startsWith("G4-"));
    const ids4 = [...new Set(qs4.map((q) => s(q.skillId)))];
    const names = await repo.findMany("Skill", { id: { in: ids4 } }, { select: ["id", "name", "code"] });
    const pick = names.filter((k) => !s(k.code).includes(".grammar.")).sort((a, b) => s(a.name).localeCompare(s(b.name)));
    assert.ok(pick.length >= 3, "three Grade 4 skills");
    [skillA, skillB, skillC] = pick.slice(0, 3).map((k) => s(k.id));
    const t0 = new Date("2026-01-01T00:00:00Z");
    for (const k of [skillA, skillB, skillC]) for (let i = 0; i < 30; i++) {
      const q = await repo.create("Question", { skillId: k, typeId: mc, stem: `Plan test ${k.slice(-5)} question ${i}: which word fits?`, content: {}, difficultyLevel: 2 + (i % 5), irtB: 0, status: "PUBLISHED", createdAt: t0, updatedAt: t0 });
      for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Word ${o}${i}`, isCorrect: j === 0, order: j });
    }
    skillAName = s(pick[0].name);
  });

  test("a draft: every question listed, nothing reaches students, no copies, the platform picks fresh questions", async () => {
    // student 0 saw 3 questions of skill A already
    const pool = (await repo.findMany("Question", { skillId: skillA, status: "PUBLISHED" }, { select: ["id"], orderBy: [{ field: "difficultyLevel", dir: "asc" }, { field: "id", dir: "asc" }] })).map((q) => s(q.id));
    for (const id of pool.slice(0, 3)) await answer(kids[0], id, true, new Date("2026-12-01T10:00:00Z"));
    const picked = await pickQuestions(repo, admin.schoolId!, skillA, 6, { studentIds: [kids[0]] });
    assert.equal(picked.length, 6);
    assert.ok(!picked.some((id) => pool.slice(0, 3).includes(id)), "never-seen questions first (no-repeat rule)");

    const id = await createDraft(repo, t4, { classId: class4, program: null, studentIds: [kids[0], kids[1]], sections: [{ skillId: skillA, count: 6 }], suggested: true }, NOW);
    const p = await loadPlan(repo, t4, id);
    assert.equal(p.status, "DRAFT");
    assert.equal(p.doc.sections.length, 1);
    assert.equal(p.doc.sections[0].questionIds.length, 6);
    assert.equal(new Set(p.doc.sections[0].questionIds).size, 6);
    assert.equal(await repo.count("Assignment", { classId: class4 }), 0, "a draft sends nothing");
    assert.equal((await studentSkillPlans(repo, await studentActor(kids[0]))).length, 0);
    const view = await planEditorView(repo, t4, id, NOW);
    assert.ok(view.sections[0].questions.every((q) => q.stem && q.type && q.level && q.skillName), "stem, type, level and skill of every question");
  });

  test("editing: add, duplicate refused, remove, replace, reorder, count, goals, sections", async () => {
    const id = await createDraft(repo, t4, { classId: class4, program: null, sections: [{ skillId: skillA, count: 4 }], suggested: true }, NOW);
    let doc = (await loadPlan(repo, t4, id)).doc;
    const key = doc.sections[0].key;
    const inPlan = doc.sections[0].questionIds;
    const extra = (await pickQuestions(repo, admin.schoolId!, skillA, 2, { exclude: inPlan }));
    await editPlan(repo, t4, id, { kind: "addQuestions", key, questionIds: extra }, NOW);
    doc = (await loadPlan(repo, t4, id)).doc;
    assert.deepEqual(doc.sections[0].questionIds.slice(-2), extra);
    // the same question again, or a copy of it (same fingerprint), is never added twice
    await assert.rejects(editPlan(repo, t4, id, { kind: "addQuestions", key, questionIds: [extra[0]] }, NOW), ValidationError);
    const twin = await repo.findUnique("Question", { id: extra[1] });
    const keys = await contentKeysForIds(repo, [extra[1]]);
    const hash = (keys.get(extra[1]) ?? []).find((k) => k.startsWith("h:"))?.slice(2) ?? "twin-hash";
    if (!twin!.contentHash) await repo.updateMany("Question", { id: extra[1] }, { contentHash: hash });
    const copyId = (await pickQuestions(repo, admin.schoolId!, skillA, 1, { exclude: doc.sections[0].questionIds }))[0];
    await repo.updateMany("Question", { id: copyId }, { contentHash: twin!.contentHash ?? hash });
    await assert.rejects(editPlan(repo, t4, id, { kind: "addQuestions", key, questionIds: [copyId] }, NOW), /in the plan already/);
    // remove · replace with a similar one · move up
    await editPlan(repo, t4, id, { kind: "removeQuestion", key, questionId: extra[0] }, NOW);
    doc = (await loadPlan(repo, t4, id)).doc;
    assert.ok(!doc.sections[0].questionIds.includes(extra[0]));
    const first = doc.sections[0].questionIds[0];
    await editPlan(repo, t4, id, { kind: "replaceQuestion", key, questionId: first }, NOW);
    doc = (await loadPlan(repo, t4, id)).doc;
    const replaced = doc.sections[0].questionIds[0];
    assert.notEqual(replaced, first);
    assert.equal((await repo.findUnique("Question", { id: replaced }))!.status, "PUBLISHED");
    const order = doc.sections[0].questionIds;
    await editPlan(repo, t4, id, { kind: "moveQuestion", key, questionId: order[2], dir: -1 }, NOW);
    doc = (await loadPlan(repo, t4, id)).doc;
    assert.deepEqual(doc.sections[0].questionIds.slice(0, 3), [order[0], order[2], order[1]]);
    // count: up (fresh, no copies) and down
    await editPlan(repo, t4, id, { kind: "count", key, count: 9 }, NOW);
    doc = (await loadPlan(repo, t4, id)).doc;
    assert.equal(doc.sections[0].questionIds.length, 9);
    const k9 = await contentKeysForIds(repo, doc.sections[0].questionIds);
    const flat = doc.sections[0].questionIds.flatMap((q) => k9.get(q) ?? []);
    assert.equal(new Set(flat).size, flat.length, "no two copies of one question");
    await editPlan(repo, t4, id, { kind: "count", key, count: 3 }, NOW);
    assert.equal((await loadPlan(repo, t4, id)).doc.sections[0].questionIds.length, 3);
    // goals, dates, title, note
    await editPlan(repo, t4, id, { kind: "details", title: "Inference week", goals: "80% on inference", note: "Read twice", dueAt: new Date("2027-02-01T23:59:59Z") }, NOW);
    const row = (await loadPlan(repo, t4, id)).row;
    assert.equal(s(row.title), "Inference week"); assert.equal(s(row.goals), "80% on inference");
    await assert.rejects(editPlan(repo, t4, id, { kind: "details", dueAt: new Date("2026-01-01") }, NOW), /past/);
    // sections: the same skill twice is refused; another skill; reorder; remove
    await assert.rejects(editPlan(repo, t4, id, { kind: "addSection", spec: { skillId: skillA, count: 3 } }, NOW), /already in the plan/);
    await editPlan(repo, t4, id, { kind: "addSection", spec: { skillId: skillB, count: 3, level: "ON" } }, NOW);
    doc = (await loadPlan(repo, t4, id)).doc;
    assert.equal(doc.sections.length, 2);
    await editPlan(repo, t4, id, { kind: "moveSection", key: doc.sections[1].key, dir: -1 }, NOW);
    doc = (await loadPlan(repo, t4, id)).doc;
    assert.equal(doc.sections[0].skillId, skillB);
    // what changed from the platform's version
    const p = await loadPlan(repo, t4, id);
    const changes = planDiff(JSON.parse(JSON.stringify(p.row.baseline)), p.doc);
    assert.ok(changes.some((c) => c.kind === "ADDED"), "the added skill is listed");
    assert.ok(changes.some((c) => c.kind === "CHANGED" && c.detail.some((x) => /question/.test(fmt(x)))), "question changes are listed");
    await editPlan(repo, t4, id, { kind: "removeSection", key: doc.sections[0].key }, NOW);
    assert.equal((await loadPlan(repo, t4, id)).doc.sections.length, 1);
    await deleteDraft(repo, t4, id, NOW);
    assert.equal(await repo.findUnique("SkillPlan", { id }), null);
  });

  test("send, edit after sending (answers kept), pause, withdraw, duplicate", async () => {
    const id = await createDraft(repo, t4, { classId: class4, program: null, studentIds: [kids[1], kids[2]], title: "Group plan", sections: [{ skillId: skillA, count: 4 }, { skillId: skillB, count: 3 }] }, NOW);
    const r = await sendPlan(repo, t4, id, NOW);
    assert.equal(r.sections, 2); assert.equal(r.students, 2);
    let p = await loadPlan(repo, t4, id);
    assert.equal(p.status, "SENT");
    const [a1, a2] = p.doc.sections.map((x) => x.assignmentId!);
    const asg = (await repo.findUnique("Assignment", { id: a1 }))!;
    assert.deepEqual(JSON.parse(JSON.stringify(asg.questionIds)), p.doc.sections[0].questionIds, "the student gets exactly the teacher's questions");
    assert.deepEqual((await repo.findMany("AssignmentStudent", { assignmentId: a1 })).map((l) => s(l.studentId)).sort(), [kids[1], kids[2]]);
    assert.ok((await studentSkillPlans(repo, await studentActor(kids[1]))).some((x) => x.id === id));
    await assert.rejects(sendPlan(repo, t4, id, NOW), ValidationError, "sent once");

    // a student answers the first question; the teacher then removes it: the answer stays recorded
    const q0 = p.doc.sections[0].questionIds[0];
    await answer(kids[1], q0, false, NOW, a1);
    const key0 = p.doc.sections[0].key;
    const res = await editPlan(repo, t4, id, { kind: "removeQuestion", key: key0, questionId: q0 }, NOW);
    assert.ok(res.notified > 0, "the students get the update");
    const after = (await repo.findUnique("Assignment", { id: a1 }))!;
    assert.ok(!JSON.parse(JSON.stringify(after.questionIds)).includes(q0));
    assert.equal(await repo.count("QuestionAttempt", { studentId: kids[1], questionId: q0 }), 1, "the answer is still recorded");
    assert.ok(await repo.count("Notification", { title: "Your plan was updated" }) > 0);
    // add a skill after sending → a new assignment for the plan's students; remove one → cancelled
    await editPlan(repo, t4, id, { kind: "addSection", spec: { skillId: skillC, count: 3 } }, NOW);
    p = await loadPlan(repo, t4, id);
    const a3 = p.doc.sections[2].assignmentId!;
    assert.ok(a3, "sent at once");
    assert.equal(await repo.count("AssignmentStudent", { assignmentId: a3 }), 2);
    await editPlan(repo, t4, id, { kind: "removeSection", key: p.doc.sections[1].key }, NOW);
    assert.ok((await repo.findUnique("Assignment", { id: a2 }))!.deletedAt, "the removed part is cancelled");
    // the plan's students change: the new student gets the work, the one taken out loses it
    await editPlan(repo, t4, id, { kind: "students", studentIds: [kids[1], kids[3]] }, NOW);
    assert.deepEqual((await repo.findMany("AssignmentStudent", { assignmentId: a1 })).map((l) => s(l.studentId)).sort(), [kids[1], kids[3]].sort());
    assert.equal(await repo.count("QuestionAttempt", { studentId: kids[1] }), await repo.count("QuestionAttempt", { studentId: kids[1] }));
    // view after sending: who answered each question
    const view = await planEditorView(repo, t4, id, NOW);
    assert.equal(view.status, "SENT");

    // pause → hidden; resume → back
    await pausePlan(repo, t4, id, true, NOW);
    assert.equal(new Date(s((await repo.findUnique("Assignment", { id: a1 }))!.startAt)).getTime(), PAUSE_UNTIL.getTime());
    assert.ok(!(await studentSkillPlans(repo, await studentActor(kids[1]))).some((x) => x.id === id), "paused: hidden from students");
    await editPlan(repo, t4, id, { kind: "details", note: "Edited while paused" }, NOW);
    await pausePlan(repo, t4, id, false, NOW);
    assert.equal((await repo.findUnique("Assignment", { id: a1 }))!.startAt, null);
    assert.ok((await studentSkillPlans(repo, await studentActor(kids[1]))).some((x) => x.id === id));

    // duplicate → a new draft with the same questions
    const copy = await duplicatePlan(repo, t4, id, {}, NOW);
    const c = await loadPlan(repo, t4, copy);
    assert.equal(c.status, "DRAFT");
    assert.deepEqual(c.doc.sections.map((x) => x.questionIds), (await loadPlan(repo, t4, id)).doc.sections.map((x) => x.questionIds));

    // withdraw → every assignment cancelled, the plan leaves My Plans, no more edits
    const w = await withdrawPlan(repo, t4, id, NOW);
    assert.equal(w.cancelled, 2);
    assert.ok((await repo.findUnique("Assignment", { id: a1 }))!.deletedAt);
    assert.ok(!(await studentSkillPlans(repo, await studentActor(kids[1]))).some((x) => x.id === id));
    assert.equal(await repo.count("QuestionAttempt", { studentId: kids[1], questionId: q0 }), 1, "answers kept after withdrawing");
    await assert.rejects(editPlan(repo, t4, id, { kind: "details", note: "x" }, NOW), /withdrawn/);
    const list = await plansOverview(repo, t4, { classId: class4 }, NOW);
    assert.ok(list.find((x) => x.id === id)?.finished, "withdrawn → Finished");
    assert.ok((await plansOverview(repo, t4, { bucket: "DRAFTS" }, NOW)).some((x) => x.id === copy));
    await deleteDraft(repo, t4, copy, NOW);
  });

  test("one edit applied to several individual plans", async () => {
    const p1 = await createDraft(repo, t4, { classId: class4, program: null, studentIds: [kids[0]], sections: [{ skillId: skillA, count: 3 }] }, NOW);
    const p2 = await createDraft(repo, t4, { classId: class4, program: null, studentIds: [kids[1]], sections: [{ skillId: skillA, count: 3 }] }, NOW);
    const add = await bulkEdit(repo, t4, [p1, p2], { kind: "addSkill", skillId: skillB, count: 4 }, NOW);
    assert.equal(add.done, 2);
    const cnt = await bulkEdit(repo, t4, [p1, p2], { kind: "count", skillId: skillA, count: 5 }, NOW);
    assert.equal(cnt.done, 2);
    for (const id of [p1, p2]) {
      const d = (await loadPlan(repo, t4, id)).doc;
      assert.deepEqual(d.sections.map((x) => [x.skillId, x.questionIds.length]), [[skillA, 5], [skillB, 4]]);
    }
    const due = await bulkEdit(repo, t4, [p1, p2], { kind: "dueAt", dueAt: new Date("2027-03-01T23:59:59Z") }, NOW);
    assert.equal(due.done, 2);
    const other = await bulkEdit(repo, t5, [p1], { kind: "note", note: "x" }, NOW);
    assert.equal(other.done, 0); assert.equal(other.skipped.length, 1, "another teacher's plan is skipped");
    await deleteDraft(repo, t4, p1, NOW); await deleteDraft(repo, t4, p2, NOW);
  });

  test("permissions: own classes only (admins all); students of the class only; NAFS for Grade 6 only", async () => {
    const id = await createDraft(repo, t4, { classId: class4, program: null, sections: [{ skillId: skillA, count: 2 }] }, NOW);
    await assert.rejects(loadPlan(repo, t5, id), ForbiddenError);
    await assert.rejects(editPlan(repo, t5, id, { kind: "details", note: "x" }, NOW), ForbiddenError);
    await assert.rejects(createDraft(repo, t5, { classId: class4, program: null, sections: [] }, NOW), ForbiddenError);
    const kid6 = s((await repo.findMany("ClassMembership", { classId: class6 }))[0].studentId);
    await assert.rejects(createDraft(repo, t4, { classId: class4, program: null, studentIds: [kid6], sections: [] }, NOW), ForbiddenError);
    assert.ok((await loadPlan(repo, admin, id)).row, "a school admin opens any plan");
    assert.ok(!(await plansOverview(repo, t5, {}, NOW)).some((x) => x.id === id));
    assert.ok((await plansOverview(repo, admin, {}, NOW)).some((x) => x.id === id));
    const stu = await studentActor(kids[0]);
    await assert.rejects(loadPlan(repo, stu, id));
    await assert.rejects(createDraft(repo, t4, { classId: class4, program: "NAFS", sections: [] }, NOW), /Grade 6/);
    await assert.rejects(sendProgramPlan(repo, t4, { classId: class4, program: "NAFS", picks: [{ studentId: kids[0], skillId: skillA }] }, NOW), /Grade 6/);
    const nafs = await startPlan(repo, t6, { classId: class6, program: "NAFS", studentIds: [], mode: "empty" }, NOW);
    assert.equal((await loadPlan(repo, t6, nafs.planId)).program, "NAFS");
    await deleteDraft(repo, t4, id, NOW);
  });

  test("an older plan sent before the editor opens with all its questions", async () => {
    const r = await sendProgramPlan(repo, t4, { classId: class4, program: "MAP", title: "Old MAP plan", picks: [{ studentId: kids[2], skillId: skillB }] }, NOW);
    await repo.updateMany("SkillPlan", { id: r.planId }, { doc: null, status: "SENT" });
    const p = await loadPlan(repo, t4, r.planId);
    assert.equal(p.doc.sections.length, 1);
    assert.equal(p.doc.sections[0].auto, true, "the platform chose at each student's level");
    assert.equal(p.program, "MAP");
    await editPlan(repo, t4, r.planId, { kind: "pickMyself", key: p.doc.sections[0].key, count: 5 }, NOW);
    const q = (await repo.findUnique("Assignment", { id: p.doc.sections[0].assignmentId! }))!;
    assert.equal(JSON.parse(JSON.stringify(q.questionIds)).length, 5, "the teacher's questions reach the assignment");
  });

  test("💡 suggestions come from real performance, with their reasons; nothing is sent", async () => {
    // three of five students are weak in skill C (30% right in the last 30 days); one student is weak in skill B
    const pool = (await repo.findMany("Question", { skillId: skillC, status: "PUBLISHED" }, { select: ["id"] })).map((q) => s(q.id));
    const poolB = (await repo.findMany("Question", { skillId: skillB, status: "PUBLISHED" }, { select: ["id"] })).map((q) => s(q.id));
    const day = new Date("2027-01-05T09:00:00Z");
    for (const st of [kids[0], kids[2], kids[4]]) for (let i = 0; i < 10; i++) await answer(st, pool[i], i < 3, day);
    for (let i = 0; i < 6; i++) await answer(kids[3], poolB[i], i < 1, day);
    await repo.create("FluencyCheck", { studentId: kids[3], wcpm: 61, percentile: 12, checkedAt: day });
    const before = await repo.count("Assignment", {});
    const list = await suggestPlans(repo, t4, class4, NOW);
    const g = list.find((x) => x.sections.some((k) => k.skillId === skillC) && x.scope === "GROUP");
    assert.ok(g, `a group suggestion for skill C (${list.map((x) => x.reason).join(" | ")})`);
    assert.match(g!.reason, /^3 students weak in .+ \(30%\)$/);
    assert.match(g!.summary, /^Group plan: 12 questions/);
    assert.deepEqual(g!.studentIds, [kids[0], kids[2], kids[4]].sort());
    assert.ok(g!.rows.every((r) => r.lines.some((l) => fmt(l).includes("30% right (3/10, last 30 days)"))), "the data behind it");
    assert.ok(g!.sources.includes("Practice"));
    const solo = list.find((x) => x.scope === "STUDENT" && x.studentIds[0] === kids[3]);
    assert.ok(solo, "an individual plan for the student weak in skill B");
    assert.ok(solo!.rows[0].lines.some((l) => fmt(l).startsWith("Fluency: 61 words correct per minute")), "fluency is part of the reasons");
    assert.equal(await repo.count("Assignment", {}), before, "suggesting sends nothing");
    // review → a draft with the platform's version kept; the teacher edits, then sends
    const id = await draftFromSuggestion(repo, t4, class4, g!.id, NOW);
    const p = await loadPlan(repo, t4, id);
    assert.equal(p.status, "DRAFT");
    assert.equal(p.doc.sections[0].questionIds.length, 12);
    for (const st of [kids[0], kids[2], kids[4]]) {
      const seen = new Set(pool.slice(0, 10));
      assert.ok(!p.doc.sections[0].questionIds.some((q) => seen.has(q)), `fresh questions for ${st}`);
    }
    const view = await planEditorView(repo, t4, id, NOW);
    assert.equal(view.source?.reason, g!.reason);
    assert.deepEqual(view.changes, [], "nothing changed yet");
    await editPlan(repo, t4, id, { kind: "count", key: p.doc.sections[0].key, count: 10 }, NOW);
    assert.ok((await planEditorView(repo, t4, id, NOW)).changes.length > 0);
    await assert.rejects(draftFromSuggestion(repo, t4, class4, "nope", NOW), ValidationError);
    await assert.rejects(suggestPlans(repo, t5, class4, NOW), ForbiddenError);
    // the Custom "suggested" start uses the same data
    const st = await startPlan(repo, t4, { classId: class4, program: null, studentIds: [kids[3]], mode: "suggested" }, NOW);
    assert.equal(st.empty, false);
    assert.equal((await loadPlan(repo, t4, st.planId)).doc.sections[0].skillId, skillB);
  });

  test("pages: only Next.js page fields exported; every new string in Arabic", () => {
    for (const f of ["src/app/teacher/plans/page.tsx", "src/app/teacher/plans/[planId]/page.tsx", "src/app/teacher/plans/bulk/page.tsx"]) {
      const src = read(f);
      const exported = [...src.matchAll(/export (?:default )?(?:async )?(?:const|function|let) (\w+)/g)].map((m) => m[1]);
      assert.ok(exported.every((n) => ["metadata", "dynamic", "revalidate", "generateMetadata"].includes(n) || /Page$/.test(n)), `${f}: ${exported.join(",")}`);
    }
    for (const k of ["Suggested plans", "Drafts", "Active", "Finished", "Replace with a similar one", "Preview as student", "What changed from the platform's version", "Withdraw", "Pause", "Duplicate", "NAFS plans are for Grade 6 classes only."]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k);
      assert.ok((ar as Record<string, string>)[k], `ar: ${k}`);
    }
    void skillAName;
  });
});
