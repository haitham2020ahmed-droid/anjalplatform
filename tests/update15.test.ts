/**
 * Update 15 (FAKE test data only — the Test School): hidden level names, editable level rules, automatic and
 * manual placement, Respond to Reading as class work (“I finished”), MAP manual entry, progress / plans / alerts,
 * grade coordinators and the grade summary, Grammar for every teacher, previews, and question tags & review.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { hideLevels } from "../src/lib/hide-levels";
import { decideLevel, RULES } from "../src/server/curriculum-map/leveled";
import { DEFAULT_LADDER, ladderSettings, rulesOf, setLadderSettings } from "../src/server/curriculum-map/ladder-settings";
import { coordinatorGrades, readableClasses, setCoordinators } from "../src/server/teacher/coordinators";
import { saveActivity, studentRespond } from "../src/server/curriculum-map/respond";
import { assignRespond, respondAssignPlan, respondTracking, saveRespondMarks, setFinished, studentRespondWork } from "../src/server/curriculum-map/respond-assign";
import { parseRespondText } from "../src/server/curriculum-map/respond-doc";
import { suggestLevels } from "../src/server/curriculum-map/auto-levels";
import { mapEntryGrid, saveMapEntry } from "../src/server/map/map-entry";
import { classProgress, gradeSummary, intensityOf, studentProgress, teacherAlerts } from "../src/server/insights/progress";
import { grammarView } from "../src/server/grammar/grammar";
import { previewWork } from "../src/server/teacher/preview";
import { assignSkillByLevel } from "../src/server/teacher/skill-assign";
import { questionTags, recalibrateRit, reviewBatch, reviewBatches, verifyBatch, verifyQuestions } from "../src/server/questions/tag-review";
import { demoDatabase } from "./helpers/db";

describe("Update 15", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor;
  let classId = ""; let otherClassId = ""; let students: string[] = [];
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const gradeOfClass = async (id: string) => Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Class", { id }))!.gradeId }))!.level);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    // a Grade 4 teacher and a teacher of another grade
    const teachers = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => actorFor(`test.teacher.${i}`)));
    for (const t of teachers) {
      const c = (await readableClasses(repo, t))[0];
      if (!c) continue;
      const g = await gradeOfClass(String(c.id));
      if (g === 4 && !classId) { teacher = t; classId = String(c.id); }
      else if (g !== 4 && !otherClassId) { other = t; otherClassId = String(c.id); }
    }
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
  });

  test("students never see level names", () => {
    assert.equal(hideLevels("Unit 1 · Text Set 1 · Analyze Craft and Structure (Below Level)"), "Unit 1 · Text Set 1 · Analyze Craft and Structure");
    assert.equal(hideLevels("Commas (adaptive: Below → On → Above)"), "Commas");
    assert.equal(hideLevels("Above Level · Main idea"), "Main idea");
    assert.equal(hideLevels("Online levels of text"), "Online levels of text", "ordinary words are kept");
  });

  test("level rules: defaults = the original ladder; admins change them; bad values are refused", async () => {
    assert.deepEqual(rulesOf(DEFAULT_LADDER), RULES);
    await assert.rejects(setLadderSettings(repo, teacher, { upPct: 90 }), ForbiddenError);
    await assert.rejects(setLadderSettings(repo, admin, { upPct: 60, downPct: 60 }), /lower/);
    await assert.rejects(setLadderSettings(repo, admin, { upWindow: 50 }), /from 3 to 10/);
    await setLadderSettings(repo, admin, { upPct: 100, upWindow: 3 });
    const v = await ladderSettings(repo, admin.schoolId);
    assert.deepEqual([v.upPct, v.upWindow, v.downPct], [100, 3, 25]);
    const r = rulesOf(v);
    const ok = (n: number) => Array.from({ length: n }, () => ({ level: "BELOW" as const, correct: true }));
    assert.deepEqual(decideLevel("BELOW", ok(3), 20, undefined, r).path, ["BELOW", "ON"], "3 of 3 now moves up");
    assert.deepEqual(decideLevel("BELOW", ok(3), 20).path, ["BELOW"], "the default needs 4");
    await setLadderSettings(repo, admin, null);
    assert.deepEqual(await ladderSettings(repo, admin.schoolId), DEFAULT_LADDER);
  });

  test("automatic placement: from the student's data; no data → On Level, and counted for the teacher", async () => {
    const sid = students[0];
    await repo.create("MapResult", { studentId: sid, testDate: new Date(Date.UTC(2026, 8, 15)), subject: "Reading", goalName: null, rit: 170, achievementPercentile: 8, projectedGrowth: 12, termName: "Fall 2026", importedAt: new Date() });
    const v = await suggestLevels(repo, teacher, classId);
    const me = v.rows.find((r) => r.studentId === sid)!;
    assert.equal(me.suggested, "BELOW");
    assert.equal(me.from, "MAP");
    assert.ok(v.rows.filter((r) => r.studentId !== sid).every((r) => r.from !== "NO_DATA" || r.suggested === "ON"));
    assert.equal(v.noData, v.rows.filter((r) => r.from === "NO_DATA").length);
    await assert.rejects(suggestLevels(repo, other, classId), ForbiddenError);
  });

  test("Respond to Reading: send by level, the student sees only theirs, “I finished”, the teacher tracks and marks", async () => {
    for (const l of ["BELOW", "ON", "ABOVE"]) await saveActivity(repo, admin, `G4.U1.TS1.RTR.${l}`, { title: `${l} task`, prompt: `Prompt for ${l}?`, instructions: ["Reread"], wordBank: [], sentenceStarters: [], checklist: [], hint: null });
    const plan = await respondAssignPlan(repo, teacher, classId, "G4.U1.TS1.RTR");
    assert.equal(plan.rows.length, students.length);
    assert.deepEqual(plan.has, { BELOW: true, ON: true, ABOVE: true });
    const levels = Object.fromEntries(plan.rows.map((r, i) => [r.studentId, i === 0 ? "ABOVE" : r.suggested]));
    await assert.rejects(assignRespond(repo, other, { classId, code: "G4.U1.TS1.RTR", levels }), ForbiddenError);
    const r = await assignRespond(repo, teacher, { classId, code: "G4.U1.TS1.RTR", levels, dueAt: new Date(Date.now() - 86_400_000) });
    assert.equal(r.students, students.length);
    const first = await studentActor(plan.rows[0].studentId);
    const seen = await studentRespond(repo, first, "G4.U1.TS1.RTR");
    assert.equal(seen.activity?.title, "ABOVE task", "the level the teacher chose wins");
    const notes = await repo.findMany("Notification", { userId: first.userId, title: "✍️ New Respond to Reading" });
    assert.ok(notes.length && !/Level/.test(String(notes[0].body)), "the notification names no level");
    const work = await studentRespondWork(repo, first);
    await setFinished(repo, first, work[0].assignmentId, true);
    await setFinished(repo, first, work[0].assignmentId, false);
    await setFinished(repo, first, work[0].assignmentId, true);
    assert.equal(await repo.count("XpEvent", { studentId: first.studentId, reason: `respond.finished:${work[0].assignmentId}` }), 1, "points once");
    const someoneElse = await studentActor(plan.rows[1].studentId);
    await assert.rejects(setFinished(repo, await studentActor(students.find((x) => !plan.rows.some((p) => p.studentId === x)) ?? plan.rows[1].studentId), "nope", true), ForbiddenError);
    void someoneElse;
    const t = await respondTracking(repo, teacher, r.assignmentId);
    assert.equal(t.finished, 1);
    assert.equal(t.rows.find((x) => x.studentId === first.studentId)!.level, "ABOVE");
    await assert.rejects(saveRespondMarks(repo, teacher, r.assignmentId, [{ studentId: first.studentId!, score: 9, feedback: null }]), /0 to 4/);
    await saveRespondMarks(repo, teacher, r.assignmentId, [{ studentId: first.studentId!, score: 3, feedback: "Good evidence" }]);
    assert.equal((await studentRespondWork(repo, first))[0].score, 3);
    // late and not finished → an alert for the teacher
    const alerts = await teacherAlerts(repo, teacher);
    assert.ok(alerts.some((a) => a.kind === "NOT_STARTED" && a.studentId === plan.rows[1].studentId));
  });

  test("Respond to Reading from a Word / text file", () => {
    const t = parseRespondText("Curriculum Map ID: G4.U1.TS2.RTR.ON\nTitle: Compare\nPrompt: How are the two texts alike?\nInstructions:\n1. Reread\n2. Underline\nWord Bank:\n- alike — the same\nHint: Look at the headings\n---\nCurriculum Map ID: G4.U1.TS2.RTR.BELOW\nTitle: Compare (support)\nPrompt: Name one thing that is the same.");
    assert.equal(t.length, 3);
    assert.deepEqual(t[1].slice(0, 5), ["G4.U1.TS2.RTR.ON", "Compare", "How are the two texts alike?", "Reread\nUnderline", "alike — the same"]);
    assert.equal(t[1][7], "Look at the headings");
  });

  test("MAP manual entry: by Student ID, descriptors become RITs, Winter adds a mid-year point", async () => {
    const grid = await mapEntryGrid(repo, teacher, { classId, subject: "READING", season: "FALL", year: 2026 });
    assert.equal(grid.rows.length, students.length);
    assert.ok(grid.goals.length >= 4);
    const [a, b] = grid.rows.filter((r) => r.studentId !== students[0]);
    const goal = grid.goals[0].code;
    const r = await saveMapEntry(repo, teacher, { classId, subject: "READING", season: "FALL", year: 2026, rows: [
      { studentId: a.studentId, rit: "200", percentile: "55", projection: "208", lexile: "800", goals: { [goal]: "Low" } },
      { studentId: b.studentId, rit: "185", percentile: "", projection: "199", lexile: "", goals: { [goal]: "zzz" } },
    ] });
    assert.equal(r.imported, 1);
    assert.ok(r.errors.some((e) => /Low, LoAvg/.test(e.message)));
    const again = await mapEntryGrid(repo, teacher, { classId, subject: "READING", season: "FALL", year: 2026 });
    const row = again.rows.find((x) => x.studentId === a.studentId)!;
    assert.deepEqual([row.rit, row.projection, row.lexile], ["200", "208", "800"]);
    assert.ok(Number(row.goals[goal]) < 200, "“Low” is stored as a RIT under the grade mean");
    await saveMapEntry(repo, teacher, { classId, subject: "READING", season: "WINTER", year: 2027, rows: [{ studentId: a.studentId, rit: "201", percentile: "", projection: "", lexile: "", goals: {} }] });
    const p = await classProgress(repo, teacher, classId);
    const pa = p.rows.find((x) => x.studentId === a.studentId)!;
    assert.equal(pa.map?.springTarget, 208);
    assert.equal(pa.status, "AT_RISK", "201 in Winter is under the 204 expected by mid-year");
    assert.equal(p.rows.find((x) => x.studentId === students[0])!.intensity, "INTENSIVE", "8th percentile");
    await assert.rejects(saveMapEntry(repo, other, { classId, subject: "READING", season: "FALL", year: 2026, rows: [] }), ForbiddenError);
  });

  test("plans and student page: weakest areas → skills; intensity from gap and percentile", async () => {
    assert.equal(intensityOf(12, 50), "INTENSIVE");
    assert.equal(intensityOf(7, 50), "TARGETED");
    assert.equal(intensityOf(4, 70), "CORE");
    assert.equal(intensityOf(null, null), null);
    const v = await studentProgress(repo, teacher, students[0]);
    assert.equal(v.plan.startLevel, "BELOW");
    assert.ok(v.plan.areas.length > 0);
    assert.equal(v.canAssign, true);
    await assert.rejects(studentProgress(repo, other, students[0]), ForbiddenError);
  });

  test("grade coordinators read every class of their grade; the grade summary is theirs and the admin's", async () => {
    await assert.rejects(gradeSummary(repo, other), ForbiddenError);
    await setCoordinators(repo, admin, [{ userId: other.userId, grades: [4] }]);
    assert.deepEqual(await coordinatorGrades(repo, other), [4]);
    assert.ok((await readableClasses(repo, other)).some((c) => String(c.id) === classId));
    const p = await classProgress(repo, other, classId);
    assert.equal(p.canAssign, false, "a coordinator reads but does not assign");
    const g = await gradeSummary(repo, other);
    assert.deepEqual(g.map((x) => x.grade), [4]);
    assert.ok(g[0].classes.some((c) => c.classId === classId));
    assert.ok((await gradeSummary(repo, admin)).length >= 2);
    await setCoordinators(repo, admin, []);
    await assert.rejects(classProgress(repo, other, classId), ForbiddenError);
  });

  test("Grammar: every teacher can browse every grade; assigning needs a class of that grade", async () => {
    const v = await grammarView(repo, other, { grade: 4 });
    assert.equal(v.grade, 4);
    assert.ok(v.grades.includes(4) && v.grades.includes(5) && v.grades.includes(6));
    assert.equal(v.classId, null);
    const mine = await grammarView(repo, teacher, { grade: 4 });
    assert.equal(mine.classId, classId);
  });

  test("preview by level, and assigning a skill automatically or by hand", async () => {
    const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null });
    let skillId = "";
    for (const k of skills) if ((await repo.count("Question", { skillId: k.id, status: "PUBLISHED", deletedAt: null })) >= 6) { skillId = String(k.id); break; }
    assert.ok(skillId);
    const pv = await previewWork(repo, teacher, { skillId, level: "ON" });
    assert.equal(pv.level, "ON");
    assert.equal(pv.counts.BELOW + pv.counts.ON + pv.counts.ABOVE >= 6, true);
    assert.ok(pv.questions.every((q) => q.answer !== undefined));
    await assert.rejects(previewWork(repo, await studentActor(students[0]), { skillId }), ForbiddenError);
    const auto = await assignSkillByLevel(repo, teacher, { classId, skillId, mode: "AUTOMATIC" });
    assert.equal(auto.groups[0].students, students.length);
    const levels = Object.fromEntries(students.map((id, i) => [id, i % 3 === 0 ? "BELOW" : i % 3 === 1 ? "ON" : "ABOVE"]));
    const man = await assignSkillByLevel(repo, teacher, { classId, skillId, mode: "MANUAL", levels, dueAt: new Date(Date.now() + 86_400_000) });
    assert.equal(man.groups.reduce((t, g) => t + g.students, 0), students.length);
    await assert.rejects(assignSkillByLevel(repo, other, { classId, skillId, mode: "AUTOMATIC" }), ForbiddenError);
  });

  test("tags & review: derived tags, a ~10% sample, verify, and RIT recalibration from answers", async () => {
    const batches = await reviewBatches(repo, admin, 4);
    assert.ok(batches.length > 0);
    await assert.rejects(reviewBatches(repo, teacher, 4), ForbiddenError);
    const b = [...batches].sort((x, y) => y.questions - x.questions)[0];
    const v = await reviewBatch(repo, admin, b.skillId, "seed-1");
    assert.equal(v.total, b.questions);
    assert.equal(v.sample.length, Math.min(v.total, Math.max(5, Math.min(25, Math.ceil(v.total * 0.1)))));
    assert.deepEqual((await reviewBatch(repo, admin, b.skillId, "seed-1")).sample.map((x) => x.id), v.sample.map((x) => x.id), "same seed, same sample");
    const t = v.sample[0];
    assert.equal(t.grade, 4);
    assert.ok(t.skill && t.type && t.rit.value && t.rit.band);
    assert.equal(t.review, "SUGGESTED");
    assert.equal(await verifyQuestions(repo, admin, [t.id]), 1);
    assert.equal((await questionTags(repo, admin.schoolId!, [t.id]))[0].review, "VERIFIED");
    await verifyBatch(repo, admin, b.skillId);
    assert.equal((await reviewBatches(repo, admin, 4)).find((x) => x.skillId === b.skillId)!.verified, b.questions);
    // recalibration: 20 students with RIT 200 answer one question, 25% right → harder than 200
    const qid = t.id;
    const ids = (await repo.findMany("Student", { schoolId: admin.schoolId })).slice(0, 20).map((x) => String(x.id));
    for (const [i, sid] of ids.entries()) {
      if (!(await repo.findMany("MapResult", { studentId: sid, termName: "Fall 2025" })).length) await repo.create("MapResult", { studentId: sid, testDate: new Date(Date.UTC(2025, 8, 15)), subject: "Reading", goalName: null, rit: 200, termName: "Fall 2025", importedAt: new Date() });
      const sess = await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", skillId: b.skillId, startedAt: new Date() });
      await repo.create("QuestionAttempt", { sessionId: sess.id, studentId: sid, questionId: qid, skillId: b.skillId, isCorrect: i % 4 === 0, response: {}, responseMs: 20000, rapidGuess: false, difficultyB: 0, createdAt: new Date() });
    }
    const r = await recalibrateRit(repo, admin, 4);
    assert.ok(r.calibrated >= 1);
    const after = (await questionTags(repo, admin.schoolId!, [qid]))[0];
    assert.equal(after.rit.calibrated, true);
    assert.ok(after.rit.value! > 200, `item RIT ${after.rit.value} > 200`);
    assert.equal(after.review, "VERIFIED", "recalibration keeps the review");
  });
});
