/**
 * 🔒 Locked writing with teacher rubrics (FAKE data on the in-memory demo school, FAKE AI provider — no real API):
 * rubric builder / saved rubrics, task creation and assignment (class / group / students), the student's locked page
 * (start, autosave, paste log, leave warning, reload = leave, second leave = auto-submitted, time limit on the server
 * clock), manual grading (automatic total, sentence comments, Approve & Return), Grade with AI (privacy, clamping,
 * never shown to the student), reopen, permissions, reports and the dashboard count.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { setAiSettings } from "../src/server/ai/engine";
import type { AiProvider } from "../src/server/ai/question-generator";
import * as W from "../src/server/teacher/writing";
import * as L from "../src/server/writing/locked";
import { htmlToText, sanitizeHtml, splitSentences } from "../src/server/writing/rich-text";
import { studentFile } from "../src/server/insights/student-file";
import { SafeHtml } from "../src/components/writing/safe-html";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoDatabase } from "./helpers/db";

const ESSAY = "Our school should have a garden. First, students can learn about plants. Second, fresh vegetables are healthy for everyone! In the end, a garden makes the school beautiful.";
const RUBRIC = {
  title: "Opinion essay (4 levels)",
  criteria: [
    { title: "Ideas", description: "A clear opinion with reasons.", levels: [{ label: "Beginning", points: 1, description: "No clear opinion." }, { label: "Developing", points: 2, description: "An opinion, one reason." }, { label: "Proficient", points: 3, description: "An opinion, two reasons." }, { label: "Exemplary", points: 4, description: "A strong opinion, well explained reasons." }] },
    { title: "Organization", description: "Order and linking words.", levels: [{ label: "Beginning", points: 0, description: "No order." }, { label: "Developing", points: 2, description: "Some order." }, { label: "Proficient", points: 4, description: "Clear order with linking words." }] },
    { title: "Conventions", description: "", levels: [{ label: "Many errors", points: 1, description: "" }, { label: "Few errors", points: 3, description: "" }] },
  ],
};

/** A fake AI that suggests a grade (deliberately out of range, with one quote that is not in the essay). */
function fakeAi(): { provider: AiProvider; calls: { system: string; user: string }[] } {
  const calls: { system: string; user: string }[] = [];
  return {
    calls,
    provider: {
      async complete(system, user) {
        calls.push({ system, user });
        return "```json\n" + JSON.stringify({
          criteria: {
            c1: { level: 9, justification: "You give a clear opinion: “Our school should have a garden.”", quote: "Our school should have a garden." },
            c2: { level: "1", justification: "You use First and Second to order ideas.", quote: "words that are not in the essay" },
            c3: { points: 3, justification: "Few errors in capital letters and full stops.", quote: "" },
          },
          feedback: "You give a clear opinion and two reasons. Next, explain each reason with an example.",
        }) + "\n```";
      },
    },
  };
}

describe("✍️ rich text and sentences", () => {
  test("the prompt editor's HTML is sanitized to a small allow-list; plain text and sentences are derived", () => {
    const dirty = `<h1 onclick="x()">Title</h1><p style="color:red">Write <strong>two</strong> <em>reasons</em>.<script>alert(1)</script></p><img src=x onerror=alert(1)><ul><li>One<li>Two</ul><a href="javascript:alert(1)">link</a> 3 < 4`;
    const clean = sanitizeHtml(dirty);
    assert.equal(clean, "<h2>Title</h2><p>Write <b>two</b> <i>reasons</i>.</p><ul><li>One</li><li>Two</li></ul>link 3 &lt; 4");
    assert.doesNotMatch(clean, /script|onerror|onclick|style|href|<img|<a/i);
    assert.equal(sanitizeHtml("<scr<script>ipt>alert(1)</script>"), "&lt;scr");
    assert.match(htmlToText(clean), /^Title\nWrite two reasons\.\n/);
    assert.deepEqual(splitSentences("I like it. Do you?\nYes!  Fine"), ["I like it.", "Do you?", "Yes!", "Fine"]);
    // shown as React elements (no raw HTML injection)
    assert.equal(renderToStaticMarkup(React.createElement(SafeHtml, { html: clean })), "<div><h2>Title</h2><p>Write <b>two</b> <i>reasons</i>.</p><ul><li>One</li><li>Two</li></ul>link 3 &lt; 4</div>");
  });
});

describe("🔒 locked writing end to end", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let classId = ""; let students: string[] = [];
  let taskId = ""; let rubricId = "";
  const t0 = new Date(Date.UTC(2026, 9, 12, 7));
  const at = (sec: number) => new Date(t0.getTime() + sec * 1000);
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const env = { GEMINI_API_KEY: "AIza-fake" };

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    teacher = await actorFor("test.teacher.1");
    other = await actorFor("test.teacher.3");
    classId = String((await readableClasses(repo, teacher))[0].id);
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    assert.ok(students.length >= 5);
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });
  });

  test("rubrics: validated, saved for reuse; own + shared are visible, private ones are not", async () => {
    assert.throws(() => L.cleanRubric({ criteria: [] }), /at least one criterion/);
    assert.throws(() => L.cleanRubric({ criteria: [{ title: "Ideas", levels: [{ label: "A", points: 1 }] }] }), /2 to 6/);
    assert.throws(() => L.cleanRubric({ criteria: [{ title: "Ideas", levels: [{ label: "A", points: 1 }, { label: "B", points: 1.5 }] }] }), /whole number/);
    assert.throws(() => L.cleanRubric({ criteria: [{ title: "Ideas", levels: [{ label: "A", points: 0 }, { label: "B", points: 0 }] }] }), /more than 0/);
    const r = L.cleanRubric(RUBRIC);
    assert.deepEqual(r.criteria.map((c) => c.key), ["c1", "c2", "c3"]);
    assert.equal(L.rubricMax(r), 4 + 4 + 3);

    rubricId = await L.saveRubric(repo, teacher, { ...RUBRIC, shared: true }, t0);
    const priv = await L.saveRubric(repo, teacher, { ...RUBRIC, title: "My private rubric" }, t0);
    await assert.rejects(L.saveRubric(repo, await studentActor(students[0]), RUBRIC, t0), ForbiddenError);
    const mine = await L.listRubrics(repo, teacher);
    assert.deepEqual(mine.map((x) => x.id).sort(), [rubricId, priv].sort());
    assert.equal(mine.find((x) => x.id === rubricId)!.criteria[0].levels.length, 4);
    const theirs = await L.listRubrics(repo, other);
    assert.ok(theirs.some((x) => x.id === rubricId) && !theirs.some((x) => x.id === priv), "shared yes, private no");
    await assert.rejects(L.loadRubric(repo, other, priv), ForbiddenError);
    await assert.rejects(L.deleteRubric(repo, other, rubricId, t0), ForbiddenError);
    assert.equal((await L.listRubrics(repo, admin)).length >= 2, true, "the admin sees every rubric of the school");
    await L.deleteRubric(repo, teacher, priv, t0);
    assert.ok(!(await L.listRubrics(repo, teacher)).some((x) => x.id === priv));
  });

  test("creating a task: rich prompt, rubric (saved or built), assigned to chosen students or a group; teachers of the class only", async () => {
    const base = { classId, title: "School garden", promptHtml: "<h3>Opinion</h3><p>Should our school have a <b>garden</b>? Give <i>two</i> reasons.</p><script>steal()</script>", minWords: 40, timeLimitMin: 30, dueAt: at(7 * 86400) };
    await assert.rejects(L.createLockedTask(repo, other, { ...base, rubricId }, t0), ForbiddenError);
    await assert.rejects(L.createLockedTask(repo, await studentActor(students[0]), { ...base, rubricId }, t0), ForbiddenError);
    await assert.rejects(L.createLockedTask(repo, teacher, { ...base, dueAt: null, rubricId }, t0), /due date/);
    await assert.rejects(L.createLockedTask(repo, teacher, { ...base, timeLimitMin: 1, rubricId }, t0), /time limit/);
    await assert.rejects(L.createLockedTask(repo, teacher, { ...base, assignTo: "STUDENTS", studentIds: [], rubricId }, t0), /at least one student/);
    taskId = await L.createLockedTask(repo, teacher, { ...base, rubricId, assignTo: "STUDENTS", studentIds: students.slice(0, 3) }, t0);
    const t = (await repo.findUnique("WritingTask", { id: taskId }))!;
    assert.equal(String(t.promptHtml), "<h3>Opinion</h3><p>Should our school have a <b>garden</b>? Give <i>two</i> reasons.</p>");
    assert.match(String(t.prompt), /Should our school have a garden\?/);
    assert.ok(Number(t.gradeLevel) >= 1, "the class's grade by default");
    // a built rubric, saved on the way; and a support group
    const group = await repo.create("Intervention", { schoolId: teacher.schoolId, classId, skillId: "x", title: "Writing group", studentIds: [students[4]], createdById: teacher.userId, startedAt: t0, endsAt: at(86400 * 14), baseline: {}, status: "ACTIVE" });
    assert.deepEqual((await L.classGroups(repo, teacher, classId)).map((g) => g.id), [String(group.id)]);
    const gTask = await L.createLockedTask(repo, teacher, { ...base, title: "Group essay", rubric: RUBRIC, saveRubric: true, assignTo: "GROUP", groupId: String(group.id) }, t0);
    assert.ok((await L.listRubrics(repo, teacher)).length >= 2, "the built rubric was saved for reuse");
    const s4 = await W.myTasks(repo, await studentActor(students[4]));
    assert.ok(s4.some((x) => x.id === gTask) && !s4.some((x) => x.id === taskId), "the group sees only its task");
    const s3 = await W.myTasks(repo, await studentActor(students[3]));
    assert.ok(!s3.some((x) => x.id === gTask || x.id === taskId), "not assigned → not listed");
    const mine = (await W.myTasks(repo, await studentActor(students[0]))).find((x) => x.id === taskId)!;
    assert.deepEqual([mine.locked, mine.lockedStatus, mine.max, mine.timeLimitMin], [true, "NOT_STARTED", 11, 30]);
    const summary = (await W.classTasks(repo, teacher, classId)).find((x) => x.id === taskId)!;
    assert.deepEqual([summary.locked, summary.members], [true, 3]);
  });

  test("the student: preview, start, autosave, paste logged, 1st leave = warning (one leave counts once), reload = 2nd leave → auto-submitted and locked", async () => {
    const me = await studentActor(students[0]);
    const pv = await L.lockedTaskForStudent(repo, me, taskId, t0);
    assert.deepEqual([pv.status, pv.minWords, pv.timeLimitMin, pv.max, pv.rubric.criteria.length, pv.result], ["NOT_STARTED", 40, 30, 11, 3, null]);
    await assert.rejects(L.openLocked(repo, me, taskId, t0), /Start Writing/);
    await assert.rejects(W.saveWriting(repo, me, taskId, ESSAY, true, t0), /locked writing page/, "the old form cannot bypass the locked page");
    const st = await L.startLocked(repo, me, taskId, t0);
    assert.equal(st.status, "IN_PROGRESS");
    assert.equal(st.deadline, at(30 * 60).toISOString(), "the time limit counts from the stored start");
    assert.deepEqual([(await L.openLocked(repo, me, taskId, at(1))).leaves, (await L.openLocked(repo, me, taskId, at(2))).leaves], [0, 0], "the first open (and a double request) is not a leave");
    await L.autosaveLocked(repo, me, taskId, "Our school should have a garden.", at(5));
    assert.equal(String((await repo.findUnique("WritingSubmission", { taskId, studentId: students[0] }))!.text), "Our school should have a garden.");
    await L.flagLocked(repo, me, taskId, "PASTE", "Ctrl+V", at(6));
    await assert.rejects(L.flagLocked(repo, me, taskId, "HACK", null, at(6)), /Unknown event/);

    const l1 = await L.leaveLocked(repo, me, taskId, "HIDDEN", ESSAY, at(10));
    assert.deepEqual([l1.status, l1.leaves, l1.warning], ["IN_PROGRESS", 1, true], "first leave: a warning");
    const l1b = await L.leaveLocked(repo, me, taskId, "BLUR", ESSAY, at(11));
    const l1c = await L.leaveLocked(repo, me, taskId, "FULLSCREEN", ESSAY, at(12));
    assert.deepEqual([l1b.leaves, l1c.leaves], [1, 1], "blur + visibility + fullscreen together = one leave");
    assert.equal(String((await repo.findUnique("WritingSubmission", { taskId, studentId: students[0] }))!.text), ESSAY, "saved on the leave event");

    const reload = await L.openLocked(repo, me, taskId, at(40));
    assert.deepEqual([reload.status, reload.leaves, reload.submitMode], ["AUTO_SUBMITTED", 2, "AUTO"], "a reload is a leave: the second one submits");
    assert.equal(reload.text, ESSAY, "the page shows the essay read-only");
    // locked: nothing changes any more
    await L.autosaveLocked(repo, me, taskId, "changed", at(50));
    const after = await L.submitLocked(repo, me, taskId, "changed again", at(51));
    assert.equal(after.status, "AUTO_SUBMITTED");
    assert.equal(String((await repo.findUnique("WritingSubmission", { taskId, studentId: students[0] }))!.text), ESSAY);
    assert.equal((await L.startLocked(repo, me, taskId, at(52))).status, "AUTO_SUBMITTED", "cannot start again");

    // a reload first (1 = warning), then a blur → auto-submitted; an extension is flagged once
    const s1 = await studentActor(students[1]);
    await L.startLocked(repo, s1, taskId, t0);
    await L.openLocked(repo, s1, taskId, at(1));
    await L.flagLocked(repo, s1, taskId, "EXTENSION", "grammarly-desktop-integration", at(2));
    await L.flagLocked(repo, s1, taskId, "EXTENSION", "grammarly-extension", at(3));
    await L.autosaveLocked(repo, s1, taskId, ESSAY, at(20));
    const r1 = await L.openLocked(repo, s1, taskId, at(30));
    assert.deepEqual([r1.status, r1.leaves, r1.warning], ["IN_PROGRESS", 1, true]);
    const r2 = await L.leaveLocked(repo, s1, taskId, "BLUR", undefined, at(60));
    assert.equal(r2.status, "AUTO_SUBMITTED");
  });

  test("time limit: the server clock submits; a timer that ends early only saves", async () => {
    const me = await studentActor(students[2]);
    await L.startLocked(repo, me, taskId, t0);
    await L.openLocked(repo, me, taskId, at(1));
    const early = await L.submitLocked(repo, me, taskId, "A garden is good.", at(10 * 60), true);
    assert.equal(early.status, "IN_PROGRESS", "the page's timer cannot end the essay before the server's limit");
    const grace = await L.autosaveLocked(repo, me, taskId, ESSAY, at(30 * 60 + 5));
    assert.equal(grace.status, "IN_PROGRESS", "a save a few seconds late is still taken");
    const late = await L.autosaveLocked(repo, me, taskId, ESSAY + " Extra words after the end.", at(30 * 60 + 60));
    assert.deepEqual([late.status, late.submitMode], ["AUTO_SUBMITTED", "TIME"]);
    assert.equal(String((await repo.findUnique("WritingSubmission", { taskId, studentId: students[2] }))!.text), ESSAY, "nothing written after the limit is kept");
  });

  test("teacher: submissions page statuses and the integrity log", async () => {
    const v = await L.lockedTaskForTeacher(repo, teacher, taskId, 1, at(3600));
    assert.equal(v.total, 3);
    assert.deepEqual(v.rows.map((r) => r.status), ["AUTO_SUBMITTED", "AUTO_SUBMITTED", "AUTO_SUBMITTED"]);
    const r0 = v.rows.find((r) => r.studentId === students[0])!, r1 = v.rows.find((r) => r.studentId === students[1])!;
    assert.deepEqual([r0.leaves, r0.pastes, r0.words], [2, 1, 28]);
    assert.equal(r1.extension, "grammarly-desktop-integration");
    const g = await L.gradingView(repo, teacher, taskId, students[0], at(3600));
    assert.deepEqual([g.integrity.leaves, g.integrity.pastes, g.integrity.reloads, g.integrity.submitMode], [2, 1, 1, "AUTO"]);
    assert.equal(g.integrity.leaveEvents, 4, "every leave signal is logged with its time; only 2 counted");
    assert.equal(g.integrity.startedAt, t0.toISOString());
    assert.equal(g.integrity.timeSpentSec, 40);
    assert.ok(g.integrity.events.some((e) => e.kind === "AUTO_SUBMIT"));
    assert.deepEqual((await L.gradingView(repo, teacher, taskId, students[1], at(3600))).integrity.extensions, ["grammarly-desktop-integration"], "logged once");
    assert.equal(g.sentences.length, 4);
    assert.ok((await L.lockedTaskForTeacher(repo, admin, taskId, 1, at(3600))).rows.length === 3, "the admin sees everything");
  });

  test("manual grading: automatic total, sentence comments, nothing visible until Approve & Return", async () => {
    const me = await studentActor(students[0]);
    const draft = await L.saveLockedGrade(repo, teacher, taskId, students[0], { levels: { c1: 2, c2: 1 }, comment: "Good start." }, false, at(4000));
    assert.deepEqual([draft.total, draft.max, draft.approved], [5, 11, false]);
    assert.equal((await L.lockedTaskForStudent(repo, me, taskId, at(4000))).result, null, "a saved (not approved) grade is hidden");
    await assert.rejects(L.saveLockedGrade(repo, teacher, taskId, students[0], { levels: { c1: 2, c2: 1 } }, true, at(4000)), /Choose a level for: Conventions/);
    await assert.rejects(L.saveLockedGrade(repo, teacher, taskId, students[0], { levels: { c1: 4, c2: 1, c3: 0 } }, true, at(4000)), /Ideas: choose/);
    await assert.rejects(L.saveLockedGrade(repo, teacher, taskId, students[0], { levels: { c1: 2, c2: 1, c3: 1 }, sentences: [{ index: 9, comment: "?" }] }, true, at(4000)), /not in the essay/);
    await assert.rejects(L.saveLockedGrade(repo, other, taskId, students[0], { levels: { c1: 2, c2: 1, c3: 1 } }, true, at(4000)), ForbiddenError);
    const ok = await L.saveLockedGrade(repo, teacher, taskId, students[0], { levels: { c1: 3, c2: 1, c3: 1 }, comment: "Clear opinion. Add an example to each reason.", sentences: [{ index: 2, comment: "Nice exclamation!" }, { index: 0, comment: "Strong opening." }] }, true, at(4100));
    assert.deepEqual([ok.total, ok.max, ok.pct, ok.approved], [9, 11, 82, true]);
    const res = (await L.lockedTaskForStudent(repo, me, taskId, at(4200))).result!;
    assert.deepEqual([res.total, res.max, res.pct], [9, 11, 82]);
    assert.deepEqual(res.criteria.map((c) => [c.title, c.label, c.points]), [["Ideas", "Exemplary", 4], ["Organization", "Developing", 2], ["Conventions", "Few errors", 3]]);
    assert.deepEqual(res.sentences.map((x) => [x.index, x.text]), [[0, "Our school should have a garden."], [2, "Second, fresh vegetables are healthy for everyone!"]]);
    assert.equal(res.comment, "Clear opinion. Add an example to each reason.");
    assert.equal((await L.lockedTaskForStudent(repo, me, taskId, at(4200))).status, "GRADED");
    await assert.rejects(L.reopenLocked(repo, teacher, taskId, students[0], at(4300)), /not graded yet/);
  });

  test("Grade with AI: only the prompt, the rubric and the essay are sent; clamped to the rubric; the student never sees it", async () => {
    const fake = fakeAi();
    await assert.rejects(L.aiGradeLocked(repo, other, taskId, students[1], env, at(5000), { gemini: () => fake.provider }), ForbiddenError);
    const r = await L.aiGradeLocked(repo, teacher, taskId, students[1], env, at(5000), { gemini: () => fake.provider });
    assert.equal(r.outcome, "READY", String(r.reason));
    assert.equal(fake.calls.length, 2, "two independent readings (the consistency check)");
    const sent = JSON.parse(fake.calls[0].user) as Record<string, unknown>;
    assert.deepEqual(Object.keys(sent).sort(), ["essay", "gradeLevel", "minWords", "reading", "rubric", "task", "timeLimitMinutes", "wordCount"]);
    const st = (await repo.findUnique("Student", { id: students[1] }))!;
    const user = (await repo.findUnique("User", { id: st.userId }))!;
    for (const secret of [students[1], String(user.displayName), String(user.username), String(st.studentNumber), String(st.userId), classId]) assert.ok(!fake.calls[0].user.includes(secret), `no identifier in the AI request: ${secret}`);
    const g = await L.gradingView(repo, teacher, taskId, students[1], at(5000));
    assert.deepEqual(Object.values(g.ai!.criteria).map((c) => [c.level, c.points]), [[3, 4], [1, 2], [1, 3]], "level 9 → the top level; “1” → 1; points 3 → the nearest level");
    assert.equal(g.ai!.criteria.c1.quote, "Our school should have a garden.");
    assert.equal(g.ai!.criteria.c2.quote, "", "a quote that is not in the essay is dropped");
    // the student sees nothing of it (not graded, and never the AI text)
    const s1 = await studentActor(students[1]);
    const view = await L.lockedTaskForStudent(repo, s1, taskId, at(5000));
    assert.equal(view.result, null);
    assert.ok(!JSON.stringify(view).includes("explain each reason with an example"), "no AI output in the student's view");
    // the teacher edits the suggestion and approves
    await L.saveLockedGrade(repo, teacher, taskId, students[1], { levels: { c1: 2, c2: 1, c3: 1 }, comment: "Well done. Add examples." }, true, at(5100));
    const res = (await L.lockedTaskForStudent(repo, s1, taskId, at(5200))).result!;
    assert.deepEqual([res.total, res.comment], [3 + 2 + 3, "Well done. Add examples."]);
    assert.ok(!JSON.stringify(await L.lockedTaskForStudent(repo, s1, taskId, at(5200))).includes("justification"));
  });

  test("reopen (logged): the student starts again and continues; permissions for other teachers and students", async () => {
    await assert.rejects(L.reopenLocked(repo, other, taskId, students[2], at(6000)), ForbiddenError);
    await L.reopenLocked(repo, teacher, taskId, students[2], at(6000));
    const me = await studentActor(students[2]);
    const pv = await L.lockedTaskForStudent(repo, me, taskId, at(6100));
    assert.equal(pv.status, "IN_PROGRESS");
    assert.equal(pv.text, ESSAY, "the essay is kept");
    await assert.rejects(L.openLocked(repo, me, taskId, at(6100)), /Start Writing/);
    const st = await L.startLocked(repo, me, taskId, at(6200));
    assert.deepEqual([st.status, st.leaves], ["IN_PROGRESS", 0]);
    assert.equal(st.deadline, at(6200 + 30 * 60).toISOString(), "a fresh time limit");
    assert.equal((await L.openLocked(repo, me, taskId, at(6201))).leaves, 0);
    const ev = await repo.findMany("WritingIntegrityEvent", { taskId, studentId: students[2], kind: "REOPEN" });
    assert.equal(ev.length, 1);
    assert.equal(String(ev[0].byUserId), teacher.userId);
    const done = await L.submitLocked(repo, me, taskId, ESSAY + " I hope we start soon.", at(6500));
    assert.deepEqual([done.status, done.submitMode], ["SUBMITTED", "MANUAL"]);

    // another student of the class (not assigned) and another teacher
    const s3 = await studentActor(students[3]);
    await assert.rejects(L.lockedTaskForStudent(repo, s3, taskId, at(6500)), ForbiddenError);
    await assert.rejects(L.startLocked(repo, s3, taskId, at(6500)), ForbiddenError);
    await assert.rejects(W.taskForStudent(repo, s3, taskId), ForbiddenError);
    await assert.rejects(L.lockedTaskForTeacher(repo, other, taskId, 1, at(6500)), ForbiddenError);
    await assert.rejects(L.gradingView(repo, other, taskId, students[0], at(6500)), ForbiddenError);
    await assert.rejects(L.gradingView(repo, teacher, taskId, students[3], at(6500)), ForbiddenError);
    await assert.rejects(L.saveLockedGrade(repo, me, taskId, students[2], { levels: { c1: 3, c2: 2, c3: 1 } }, true, at(6500)), ForbiddenError);
    await assert.rejects(L.gradingView(repo, me, taskId, students[2], at(6500)), ForbiddenError);
    // a student only ever sees their own work
    await assert.rejects(L.leaveLocked(repo, s3, taskId, "BLUR", "x", at(6500)), ForbiddenError);
    await assert.rejects(W.scoreSubmission(repo, teacher, taskId, students[2], { ideas: 1 }, null, at(6500)), /grading page/);
  });

  test("reports and the dashboard: the rubric score % appears with the other writing results", async () => {
    const res = await L.writingResults(repo, teacher, classId);
    assert.ok(res.tasks.some((x) => x.id === taskId && x.locked));
    assert.equal(res.rows.find((r) => r.studentId === students[0])!.pct[taskId], 82);
    assert.equal(res.rows.find((r) => r.studentId === students[1])!.pct[taskId], 73);
    assert.equal(res.rows.find((r) => r.studentId === students[2])!.pct[taskId], undefined, "submitted, not graded yet");
    await assert.rejects(L.writingResults(repo, other, classId), ForbiddenError);
    const file = await studentFile(repo, teacher, students[0]);
    const row = file.writing.find((w) => w.taskId === taskId)!;
    assert.deepEqual([row.total, row.max, row.pct, row.locked], [9, 11, 82, true]);
    assert.equal(await L.writingToGrade(repo, teacher), 1, "one essay waits to be graded");
  });
});
