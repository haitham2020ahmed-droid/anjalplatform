/**
 * r78 (owner bug, class 4A: "37 Skills assigned · 0 of 501 stars · 500 Not started"): Student Skills shows EXACTLY what
 * the teacher sees on the Assigned page — and a cancel there makes the work vanish EVERYWHERE. In-memory demo school.
 *
 *   counted (rows of Assigned)      theme (Assign, Curriculum) · commas (Assign, Grammar, s0 s1) · summarize (a place of
 *                                   a SENT plan, a set of its questions) · context clues + reread (late work, cancelled)
 *   NOT counted                     inference: a place of the whole-grade CURRICULUM plan (a student opened it: made for
 *                                   the whole class, silently) · figurative: a place of a DRAFT plan (never sent) ·
 *                                   capitalization: a system "Re-check: …" · compare-contrast: a deleted row
 *
 * Checked before / after the cancel: the grid's columns, the class report's numbers, one student's assigned skills, the
 * student's home + My Work + notifications, class progress, the alert engine under the early warning (late work, not
 * started) and the teacher home (Needs attention, work this week).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { skillKeyIndex } from "../src/server/skills/status";
import { classSkills, skillsGrid } from "../src/server/skills/skills-grid";
import { classReport } from "../src/server/skills/skills-report";
import { countsAsAssigning, studentAssignedSkills } from "../src/server/skills/assigned-skills";
import { assignQuestions, assignSkill } from "../src/server/teacher/assign";
import { assignedList, assignedWorkOfClasses, cancelAssignment, cancelMany, restoreMany, teacherAssignedWork } from "../src/server/teacher/assigned";
import { cancelIndexOf, liveAssignmentWhere } from "../src/server/student/cancelled-work";
import { studentHome } from "../src/server/student/student-home";
import { listNotifications, linkedWork } from "../src/server/notifications";
import { classProgress, teacherAlerts } from "../src/server/insights/progress";
import { findAlerts } from "../src/server/insights/alerts";
import { teacherHomeData } from "../src/server/teacher/home";
import { teacherHomeSummary } from "../src/server/teacher/needs-attention";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const DAY = 86_400_000;
const LINKS = { skill: (k: string) => `/skill/${k}`, plan: (x: string[]) => `/plan/${x.join(",")}`, student: (id: string) => `/student/${id}`, source: (x: string) => `/source/${x}`, assigned: "/assigned" };

describe("r78 📌 Student Skills = the Assigned page; cancelled there = gone everywhere", () => {
  let repo: SqliteRepo; let teacher: Actor; let me: Actor; let classId = ""; let schoolId = ""; let tid = ""; let ids: string[] = [];
  let context = ""; let reread = ""; let commas = "";
  const g4 = new Map<string, string>();
  const now = new Date("2026-10-14T09:00:00Z");
  const past = new Date(now.getTime() - 5 * DAY);
  const COUNTED = ["fam:commas", "fam:context-clues", "fam:reread", "fam:summarize", "fam:theme"];
  const AFTER = ["fam:commas", "fam:summarize", "fam:theme"];
  const cols = async () => (await skillsGrid(repo, teacher, { classId }, now)).skills.map((k) => k.key).sort();
  const link = async (aid: unknown, who: string[]) => { for (const st of who) await repo.create("AssignmentStudent", { assignmentId: aid, studentId: st, status: "NOT_STARTED", progress: 0 }); };

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 5 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = teacher.schoolId!;
    tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId)).sort();
    me = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: ids[2] }))!.userId }))!);
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    for (const k of await repo.findMany("Skill", { curriculumId: cur.id })) g4.set(s(k.code).replace(/^G4\./, ""), s(k.id));
    const [s0, s1] = ids;
    // ✅ the Assigned page's kinds (counted)
    await assignSkill(repo, teacher, { classId, skillId: g4.get("theme")!, source: "CURRICULUM", dueAt: new Date(now.getTime() + 5 * DAY) }, now);
    commas = (await assignSkill(repo, teacher, { classId, skillId: g4.get("commas")!, studentIds: [s0, s1], source: "GRAMMAR" }, now)).assignmentId;
    const sent = await repo.create("SkillPlan", { schoolId, classId, title: "Unit 1 plan", kind: "PLACES", gradeLevel: 4, status: "SENT", createdById: teacher.userId, createdAt: now });
    const sq = (await repo.findMany("Question", { skillId: g4.get("summarize")!, status: "PUBLISHED" }, { select: ["id"], take: 4 })).map((q) => s(q.id));
    const place = (await assignQuestions(repo, teacher, { classId, questionIds: sq, source: "CURRICULUM", title: "Unit 1 · Summarize", exactTitle: true, curriculumPlanId: s(sent.id), silent: true }, now)).assignmentId;
    await repo.create("SkillPlanItem", { planId: sent.id, code: "G4.U1.TS1.SUM", label: "Unit 1 · Text Set 1 · Summarize", assignmentIds: [place], order: 0 });
    // late work assigned 5 days ago (due 2 days ago) — cancelled in the tests below
    context = (await assignSkill(repo, teacher, { classId, skillId: g4.get("context-clues")!, source: "RTI", dueAt: new Date(now.getTime() - 2 * DAY) }, past)).assignmentId;
    const rr = await repo.create("Assignment", { classId, createdById: tid, title: "Reread", target: "SKILL", skillId: g4.get("reread"), skillIds: [g4.get("reread")], source: "CURRICULUM", dueAt: new Date(now.getTime() - 2 * DAY), createdAt: past });
    reread = s(rr.id); await link(rr.id, ids);
    // ❌ NOT on the Assigned page as skill work
    const whole = await repo.create("SkillPlan", { schoolId, classId, title: "Grade 4 Curriculum", kind: "CURRICULUM", gradeLevel: 4, status: "SENT", createdById: teacher.userId, createdAt: now });
    const opened = await repo.create("Assignment", { classId, createdById: tid, title: "Inference (adaptive)", target: "SKILL", skillId: g4.get("inference"), curriculumPlanId: whole.id, note: "Curriculum plan", source: "CURRICULUM", createdAt: now });
    await link(opened.id, ids);
    await repo.create("SkillPlanItem", { planId: whole.id, code: "G4.U1.TS1.INF", label: "Unit 1 · Text Set 1 · Inference", assignmentIds: [opened.id], order: 0 });
    const draft = await repo.create("SkillPlan", { schoolId, classId, title: "Draft plan", kind: "PLACES", gradeLevel: 4, status: "DRAFT", createdById: teacher.userId, createdAt: now });
    const unsent = await repo.create("Assignment", { classId, createdById: tid, title: "Figurative", target: "SKILL", skillId: g4.get("figurative-language"), curriculumPlanId: draft.id, source: "MAP", createdAt: now });
    await link(unsent.id, ids);
    await repo.create("SkillPlanItem", { planId: draft.id, code: "G4.U1.TS1.FIG", label: "Unit 1 · Figurative", assignmentIds: [unsent.id], order: 0 });
    const recheck = await repo.create("Assignment", { classId, createdById: tid, title: "Re-check: Capitalization", target: "SKILL", skillId: g4.get("capitalization"), source: "RTI", createdAt: now });
    await link(recheck.id, [s0]);
    const gone = await repo.create("Assignment", { classId, createdById: tid, title: "Compare", target: "SKILL", skillId: g4.get("compare-contrast"), source: "CURRICULUM", createdAt: now, deletedAt: now });
    await link(gone.id, ids);
  });

  test("the pure rules: which Assigned rows assign skills, the cancel index, the live where", () => {
    assert.equal(countsAsAssigning({ kind: "SKILL", detail: null }), true);
    assert.equal(countsAsAssigning({ kind: "PLAN", detail: "PLACES" }), true, "a sent plan's places");
    assert.equal(countsAsAssigning({ kind: "PLAN", detail: "CURRICULUM" }), false, "the whole-grade plan: students open its places");
    for (const k of ["TEST", "PROGRESS_CHECK", "MAP_TEST", "NAFS_TEST", "LEARN"] as const) assert.equal(countsAsAssigning({ kind: k, detail: null }), false, k);
    assert.deepEqual(liveAssignmentWhere({ classId: "c" }), { classId: "c", deletedAt: null });
    const ix = cancelIndexOf([
      { kind: "SKILL", refId: "a1", studentId: null, keys: ["a1"] },
      { kind: "SKILL", refId: "a2", studentId: "st1", keys: ["a2"] },
      { kind: "TEST", refId: "t1", studentId: null, keys: ["test:set1", "set1"] },
      { kind: "PLAN", refId: "p1", studentId: null, keys: ["plan:p1", "place1"] },
      { kind: "RESPOND", refId: "r1", studentId: null, keys: ["respond:r1"] },
    ]);
    assert.equal(ix.live({ id: "a1" }), false); assert.equal(ix.live({ id: "a2" }), true); assert.equal(ix.live({ id: "a2" }, "st1"), false); assert.equal(ix.live({ id: "a2" }, "st2"), true);
    assert.equal(ix.live({ id: "set9", testId: "t1" }), false, "every set of a cancelled test");
    assert.equal(ix.live({ id: "later", curriculumPlanId: "p1" }), false, "a place opened AFTER the plan was cancelled");
    assert.equal(ix.live({ id: "x", deletedAt: new Date() }), false, "deleted = not live");
    assert.equal(ix.liveRef("RESPOND", "r1"), false); assert.equal(ix.liveRef("RESPOND", "r2"), true);
    assert.equal(cancelIndexOf([]).empty, true);
    assert.deepEqual(linkedWork("/student/assignments/abc"), { assignmentId: "abc" }); assert.deepEqual(linkedWork("/quiz/q1?x=1"), { assignmentId: "q1" });
    assert.deepEqual(linkedWork("/student/plans/p9"), { planId: "p9" }); assert.equal(linkedWork("/student/map"), null);
  });

  test("Student Skills = EXACTLY the skills of the Assigned page's rows (count and columns)", async () => {
    assert.deepEqual(await cols(), COUNTED, "plans never sent, the whole-grade Curriculum plan, a re-check and a deleted row add nothing");
    // the same live rows as the page (one function for both)
    const page = (await assignedList(repo, teacher, { classId }, now)).items;
    const work = await teacherAssignedWork(repo, teacher, classId);
    assert.deepEqual(work.map((w) => `${w.kind}:${w.id}`).sort(), page.map((p) => `${p.kind}:${p.id}`).sort(), "Assigned page rows = the shared function's rows");
    assert.ok(!page.some((p) => p.title === "Figurative"), "a draft plan's place is not a row of Assigned");
    assert.ok(page.some((p) => p.kind === "PLAN" && p.title === "Grade 4 Curriculum"), "the Curriculum plan is listed (it can be cancelled) …");
    assert.ok(!(await cols()).includes("fam:inference"), "… but it assigns no skill");
    assert.ok(page.some((p) => p.title === "Re-check: Capitalization") && !(await cols()).includes("fam:capitalization"), "a re-check is listed, never an assigned skill");
    const d = await classSkills(repo, teacher, { classId });
    assert.equal(classReport(d, LINKS, now).skillsAssigned, 5, "Class report: 5 skills assigned");
    const ix = await skillKeyIndex(repo, schoolId);
    assert.deepEqual([...((await studentAssignedSkills(repo, ids[1], ix)).byStudent.get(ids[1])?.keys() ?? [])].sort(), COUNTED, "per-student view: same rule");
  });

  test("cancel on Assigned (for everyone) → gone from the grid, the report, the student's pages, progress, alerts and teacher home", async () => {
    const homeBefore = await studentHome(repo, me, now);
    assert.ok(homeBefore.work.some((w) => w.assignmentId === context), "in My Work before");
    const notesBefore = await listNotifications(repo, me);
    assert.ok(notesBefore.some((n) => n.link === `/student/assignments/${context}`), "its notification before");
    const progBefore = await classProgress(repo, teacher, classId, "READING", now);
    assert.ok(progBefore.summary.late >= ids.length * 2, "late before (2 late tasks each)");
    assert.ok((await teacherAlerts(repo, teacher, now)).some((a) => a.kind === "NOT_STARTED"), "not started by the due date: before");
    assert.ok((await findAlerts(repo, schoolId, now)).some((f) => f.kind === "LATE_WORK"), "LATE_WORK alert before");
    assert.ok((await teacherHomeData(repo, teacher, classId, now)).attention.some((c) => c.kind === "not-started"), "Needs attention: before");
    const weekBefore = (await teacherHomeSummary(repo, teacher, now)).workThisWeek;

    const r = await cancelMany(repo, teacher, [{ kind: "SKILL", id: context }, { kind: "SKILL", id: reread }], now);
    assert.equal(r.done.length, 2);

    assert.deepEqual(await cols(), AFTER, "the cancelled skills vanish from the grid");
    assert.equal(classReport(await classSkills(repo, teacher, { classId }), LINKS, now).skillsAssigned, 3, "Class report numbers follow");
    const home = await studentHome(repo, me, now);
    assert.ok(!home.work.some((w) => w.assignmentId === context || w.assignmentId === reread), "not in My Work / home");
    assert.equal(home.toDo, homeBefore.toDo - 2, "the home's to-do drops by 2");
    assert.ok(!(await listNotifications(repo, me)).some((n) => n.link === `/student/assignments/${context}`), "its notification is not listed");
    const prog = await classProgress(repo, teacher, classId, "READING", now);
    assert.equal(prog.summary.late, 0, "class progress: nothing late any more");
    assert.equal(prog.rows.reduce((t, x) => t + x.work.total, 0), progBefore.rows.reduce((t, x) => t + x.work.total, 0) - 2 * ids.length, "class progress: 2 tasks fewer per student");
    assert.ok(!(await teacherAlerts(repo, teacher, now)).some((a) => a.kind === "NOT_STARTED"), "no \"not started by its due date\"");
    assert.ok(!(await findAlerts(repo, schoolId, now)).some((f) => f.kind === "LATE_WORK"), "no LATE_WORK alert (the early warning's engine)");
    assert.ok(!(await teacherHomeData(repo, teacher, classId, now)).attention.some((c) => c.kind === "not-started"), "teacher home: Needs attention cleared");
    assert.equal((await teacherHomeSummary(repo, teacher, now)).workThisWeek, weekBefore - 2, "work this week: 2 fewer");
    // the answers stay: nothing was deleted
    assert.ok(await repo.findUnique("Assignment", { id: context }), "the row is still in the database");
    // Undo brings everything back
    await restoreMany(repo, teacher, [{ kind: "SKILL", id: context }, { kind: "SKILL", id: reread }], now);
    assert.deepEqual(await cols(), COUNTED);
    assert.equal((await studentHome(repo, me, now)).toDo, homeBefore.toDo);
    await cancelMany(repo, teacher, [{ kind: "SKILL", id: context }, { kind: "SKILL", id: reread }], now);
  });

  test("removed for ONE student: that student's cell is — and their view loses the skill; the others keep it", async () => {
    const [s0, s1] = ids;
    await cancelAssignment(repo, teacher, "SKILL", commas, s1, now);
    const g = await skillsGrid(repo, teacher, { classId }, now);
    assert.ok(g.assigned![s0]["fam:commas"], "s0 keeps commas");
    assert.ok(!g.assigned![s1]["fam:commas"], "s1: — (removed one by one)");
    assert.equal(g.skills.find((k) => k.key === "fam:commas")!.total, 1, "the column counts its one assigned student");
    const ix = await skillKeyIndex(repo, schoolId);
    assert.ok(!(await studentAssignedSkills(repo, s1, ix)).byStudent.get(s1)?.has("fam:commas"), "per-student view follows");
    const live = await assignedWorkOfClasses(repo, schoolId, [classId], { kinds: ["SKILL"] });
    assert.ok(!live.find((w) => w.id === commas)!.students.has(s1));
  });

  test("the wiring: every report reads the one rule", () => {
    for (const f of ["src/server/insights/student-data.ts", "src/server/insights/progress.ts", "src/server/insights/early-warning.ts", "src/server/insights/alerts.ts", "src/server/teacher/home.ts", "src/server/teacher/needs-attention.ts", "src/server/teacher/my-week.ts", "src/server/reports/family-week.ts", "src/server/student/assigned.ts", "src/server/curriculum-map/status.ts", "src/server/admin/performance.ts", "src/server/notifications.ts"])
      assert.match(read(f), /cancelIndex(ForStudents)?\(/, f);
    assert.match(read("src/server/skills/assigned-skills.ts"), /assignedWorkOfClasses\(/, "Student Skills reads the Assigned page's rows");
  });
});
