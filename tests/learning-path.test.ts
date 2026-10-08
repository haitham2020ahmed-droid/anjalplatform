import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { assignFromMap, setStudentLevels } from "../src/server/curriculum-map/levels";
import { adaptiveNext } from "../src/server/curriculum-map/leveled-run";
import { applyPlacementResult } from "../src/server/curriculum-map/placement-result";
import { recordLevel } from "../src/server/curriculum-map/student-level";
import { startLevel } from "../src/server/curriculum-map/leveled-run";
import { studentLearningPath } from "../src/server/student/learning-path";
import { demoDatabase } from "./helpers/db";

describe("🧭 adaptive learning path: the level carries over, with history, guardrails and the path shown", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId: string; let kids: string[]; let grade: number;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const r = (await teacherRoster(repo, teacher))[0]; classId = r.id; kids = r.students.map((x) => x.id);
    grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Class", { id: classId }))!.gradeId }))!.level);
    for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 8; i++) {
      const id = await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `Path question ${lv} ${i} about the passage?`, level: 4, whyCorrect: "x", mapNodeCode: `G${grade}.U1.TS1.ACS.${lv}`, options: [{ label: "A", text: `yes ${lv}${i}`, correct: true, rationale: null }, { label: "B", text: `no ${lv}${i}`, correct: false, rationale: "n" }] });
      await repo.updateMany("Question", { id }, { status: "PUBLISHED" });
    }
  });

  test("guardrails: too few answers change nothing; a teacher's recent level is kept; older ones can move", async () => {
    const sid = kids[1], now = new Date();
    await setStudentLevels(repo, teacher, classId, [{ studentId: sid, level: "BELOW" }], now);
    assert.equal(await recordLevel(repo, { studentId: sid, level: "ABOVE", source: "ADAPTIVE", answers: 3, now }), "TOO_FEW_ANSWERS");
    assert.equal(await recordLevel(repo, { studentId: sid, level: "ABOVE", source: "ADAPTIVE", answers: 12, now }), "KEPT_TEACHER");
    assert.equal(String((await repo.findUnique("StudentLevel", { studentId: sid }))!.level), "BELOW");
    assert.equal(await recordLevel(repo, { studentId: sid, level: "ABOVE", source: "ADAPTIVE", answers: 12, now: new Date(now.getTime() + 31 * 86_400_000) }), "CHANGED");
  });

  test("a student climbs Below → On → Above in an adaptive set; the next set starts at Above; the page shows it all", async () => {
    const sid = kids[0];
    await recordLevel(repo, { studentId: sid, level: "BELOW", source: "MAP_RIT", reason: "RIT 180" });
    const r = await assignFromMap(repo, teacher, { classId, categoryCode: `G${grade}.U1.TS1.ACS`, studentIds: [sid] });
    const a = (await repo.findMany("Assignment", { id: r.groups[0].assignmentId }))[0];
    const set = (await repo.findUnique("Assessment", { id: a.assessmentId }))!;
    const order = (await repo.findMany("AssessmentQuestion", { assessmentId: set.id })).map((x) => String(x.questionId));
    const session = await repo.create("PracticeSession", { studentId: sid, skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(), assignmentId: a.id, assessmentId: set.id });
    let t = Date.now();
    for (let k = 0; k < 30; k++) {   // the student answers every question correctly
      const st = await adaptiveNext(repo, set, order, String(session.id), sid);
      if (st.done || !st.nextId) break;
      const q = (await repo.findUnique("Question", { id: st.nextId }))!;
      await repo.create("QuestionAttempt", { sessionId: session.id, studentId: sid, questionId: q.id, skillId: q.skillId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date((t += 1000)) });
    }
    assert.equal(await applyPlacementResult(repo, String(set.id), String(session.id), sid), "ABOVE", "the level reached carries over");
    // the student also has a low MAP Lexile: the next Analyze Craft set still starts at Above (their own evidence);
    // a Concept Vocabulary set (no evidence there yet) starts from the Lexile
    await repo.create("MapResult", { studentId: sid, testDate: new Date(), subject: "Reading", goalName: null, rit: 170, lexile: 300, termName: "Fall 2026", importedAt: new Date() });
    assert.deepEqual(await startLevel(repo, sid, "ON", "ACS"), { level: "ABOVE", from: "CATEGORY" });
    assert.equal((await startLevel(repo, sid, "ON", "CV")).from, "LEXILE");
    const p = await studentLearningPath(repo, teacher, sid);
    assert.equal(p.level?.level, "BELOW", "the overall (MAP) level is unchanged");
    assert.deepEqual(p.categories.map((c) => [c.category, c.level]), [["ACS", "ABOVE"]]);
    assert.deepEqual(p.journeys[0].path.slice(0, 3), ["BELOW", "ON", "ABOVE"]);
    assert.equal(p.journeys[0].correctPct, 100);
    assert.deepEqual(p.history.map((h) => [h.from, h.to, h.source]).slice(0, 2), [[null, "ABOVE", "ADAPTIVE"], [null, "BELOW", "MAP_RIT"]]);
    assert.equal(p.history[0].category, "Analyze Craft and Structure");
    // the teacher's recent choice comes first
    await setStudentLevels(repo, teacher, classId, [{ studentId: sid, level: "ON" }]);
    assert.deepEqual(await startLevel(repo, sid, "BELOW", "ACS"), { level: "ON", from: "TEACHER" });
    });

  test("🔔 the teacher is told: two drops in a row in a category, and a set answered too fast", async () => {
    const sid = kids[2];
    const tUser = String((await repo.findUnique("Teacher", { id: (await repo.findMany("ClassTeacher", { classId }))[0].teacherId }))!.userId);
    const before = await repo.count("Notification", { userId: tUser });
    await recordLevel(repo, { studentId: sid, level: "ABOVE", source: "ADAPTIVE", answers: 10, category: "ACS" });
    await recordLevel(repo, { studentId: sid, level: "ON", source: "ADAPTIVE", answers: 10, category: "ACS" });
    assert.equal(await repo.count("Notification", { userId: tUser }), before, "one drop: no alert yet");
    await recordLevel(repo, { studentId: sid, level: "BELOW", source: "ADAPTIVE", answers: 10, category: "ACS" });
    const n = (await repo.findMany("Notification", { userId: tUser })).filter((x) => /dropped twice/.test(String(x.title)));
    assert.equal(n.length, 1);
    assert.equal(n[0].link, `/teacher/students/${sid}`);
    // a set answered with rapid guesses
    const r = await assignFromMap(repo, teacher, { classId, categoryCode: `G${grade}.U1.TS1.ACS`, studentIds: [kids[3]] });
    const a = (await repo.findMany("Assignment", { id: r.groups[0].assignmentId }))[0];
    const set = (await repo.findUnique("Assessment", { id: a.assessmentId }))!;
    const order = (await repo.findMany("AssessmentQuestion", { assessmentId: set.id })).map((x) => String(x.questionId));
    const session = await repo.create("PracticeSession", { studentId: kids[3], skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(), assignmentId: a.id, assessmentId: set.id });
    let t = Date.now();
    for (let k = 0; k < 30; k++) {
      const st = await adaptiveNext(repo, set, order, String(session.id), kids[3]);
      if (st.done || !st.nextId) break;
      const q = (await repo.findUnique("Question", { id: st.nextId }))!;
      await repo.create("QuestionAttempt", { sessionId: session.id, studentId: kids[3], questionId: q.id, skillId: q.skillId, response: { value: "B" }, isCorrect: k % 3 === 0, partialCredit: null, responseMs: 900, usedHint: false, rapidGuess: true, difficultyB: 0, createdAt: new Date((t += 1000)) });
    }
    await applyPlacementResult(repo, String(set.id), String(session.id), kids[3]);
    assert.ok((await repo.findMany("Notification", { userId: tUser })).some((x) => /answered too fast/.test(String(x.title))));
  });

  test("⚡ a student who guesses fast is not moved down for it: only careful answers move the level", async () => {
    const sid = kids[4];
    await recordLevel(repo, { studentId: sid, level: "ON", source: "MAP_RIT" });
    const r = await assignFromMap(repo, teacher, { classId, categoryCode: `G${grade}.U1.TS1.ACS`, studentIds: [sid] });
    const a = (await repo.findMany("Assignment", { id: r.groups[0].assignmentId }))[0];
    const set = (await repo.findUnique("Assessment", { id: a.assessmentId }))!;
    const order = (await repo.findMany("AssessmentQuestion", { assessmentId: set.id })).map((x) => String(x.questionId));
    const session = await repo.create("PracticeSession", { studentId: sid, skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(), assignmentId: a.id, assessmentId: set.id });
    let t = Date.now();
    const answer = async (correct: boolean, rapid: boolean) => {
      const st = await adaptiveNext(repo, set, order, String(session.id), sid);
      const q = (await repo.findUnique("Question", { id: st.nextId! }))!;
      await repo.create("QuestionAttempt", { sessionId: session.id, studentId: sid, questionId: q.id, skillId: q.skillId, response: { value: correct ? "A" : "B" }, isCorrect: correct, partialCredit: null, responseMs: rapid ? 900 : 9000, usedHint: false, rapidGuess: rapid, difficultyB: 0, createdAt: new Date((t += 1000)) });
      return (await adaptiveNext(repo, set, order, String(session.id), sid)).decision.level;
    };
    // four wrong answers given in under a second (the old rule moved down after 4): a rush, not evidence → still On
    for (let k = 0; k < 4; k++) assert.equal(await answer(false, true), "ON");
    // four careful wrong answers → now the level moves down
    let lv = "ON"; for (let k = 0; k < 4; k++) lv = await answer(false, false);
    assert.equal(lv, "BELOW");
  });
});
