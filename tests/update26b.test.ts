/**
 * Update 26 (FAKE data only — the Test School): ReadMaster on the Curriculum Map, the Weekly Check, fluency,
 * support groups and mini-lessons, school goals, class transfer, the explanation fallback, the report files.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { rightAnswer, seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { teacherRoster } from "../src/server/teacher/assign";
import { saveArticle, saveVersion, addVersionQuestion, linkReadMasterToMap, readMasterPlace } from "../src/server/readmaster/service";
import { openWeeklyCheck, weeklyCheck } from "../src/server/student/weekly-check";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { assignedSkills } from "../src/server/student/assigned";
import { classFluency, saveFluency, supportGroups, miniLesson, transferClass, schoolTeachers } from "../src/server/teacher/support";
import { goalProgress, saveSchoolGoals, schoolGoals, sendPlanToGrade } from "../src/server/admin/school-goals";
import { weekStats } from "../src/server/student/weekly";
import { explainAnswer } from "../src/server/ai/explain";
import { classDoc } from "../src/server/diagnostic/export";
import { renderXlsx } from "../src/reports/xlsx";
import { renderCsv } from "../src/reports/csv";
import { demoDatabase } from "./helpers/db";

describe("Update 26 · data-driven support", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let roster: { id: string; name: string }[];
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const TEXT = "The river was low that summer. The farmers watched the sky every morning, hoping for rain. When the clouds finally came, the whole village ran outside to dance in the first heavy drops of water.";

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, admin] = await Promise.all(["test.teacher.1", "test.admin"].map(a));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
  });

  test("ReadMaster: questions of an article coded for a Text Set go on that Text Set of the map (and in the bank)", async () => {
    assert.equal(await readMasterPlace(repo, admin.schoolId!, "RM-G4-U1-TS1", "ON", "CCSS.ELA-LITERACY.RL.4.2"), "G4.U1.TS1.ACS.ON");
    assert.equal(await readMasterPlace(repo, admin.schoolId!, "SOLAR-01", "ON", null), null, "an article not coded for a Text Set stays in the bank only");
    const id = await saveArticle(repo, admin, { code: "RM-G4-U1-TS1", title: "Rain at Last", grade: 4 });
    const v = await saveVersion(repo, admin, id, "BELOW", { lexile: 600, body: TEXT });
    const q = await addVersionQuestion(repo, admin, v, { stem: "Why did the village dance?", whyCorrect: "Rain came after a dry summer.", options: [{ label: "A", text: "Because rain came", correct: true }, { label: "B", text: "Because of a party", correct: false, rationale: "No party is mentioned." }] });
    const node = (await repo.findMany("CurriculumMapNode", { code: "G4.U1.TS1.ACS.BELOW" }))[0];
    assert.ok(await repo.findUnique("QuestionMapLink", { questionId: q, nodeId: node.id }), "placed on the Text Set at its level");
    const qr = (await repo.findUnique("Question", { id: q }))!;
    assert.ok(qr.passageId, "with its passage");
    assert.equal(String(qr.status), "PUBLISHED");
    // the backfill finds nothing more to place
    assert.equal((await linkReadMasterToMap(repo, admin)).linked, 0);
  });

  test("Weekly Check: 5 questions around the student's level, out of My Work, result kept", async () => {
    const st = await student(roster[0].id);
    const before = await weeklyCheck(repo, st);
    assert.ok(before, "the test bank has MAP pools");
    const href = (await openWeeklyCheck(repo, st))!;
    assert.match(href, /^\/quiz\//);
    assert.equal(await openWeeklyCheck(repo, st), href, "one check a week");
    const aid = href.split("/")[2];
    assert.equal((await assignedSkills(repo, st)).items.some((x) => x.assignmentId === aid), false, "not in My Work");
    let clock = Date.now() - 600_000; let v = await startQuiz(repo, st, aid, new Date(clock));
    assert.equal(v.total, 5);
    while (v.question) { const it = (await loadQuestionItems(repo, [v.question.questionId]))[0]; v = (await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: rightAnswer(it) }, new Date((clock += 30_000)))).view; }
    const after = (await weeklyCheck(repo, st))!;
    assert.equal(after.status, "DONE");
    assert.equal((await weekStats(repo, roster[0].id)).partsDone, 0, "the check is not a plan part");
  });

  test("fluency: saved checks, the latest first; only the class's students; numbers checked", async () => {
    await saveFluency(repo, teacher, classId, [{ studentId: roster[1].id, wcpm: 60, accuracy: 90 }, { studentId: roster[2].id, wcpm: 130 }]);
    const v = await classFluency(repo, teacher, classId);
    assert.equal(v.rows.find((r) => r.id === roster[1].id)!.latest!.wcpm, 60);
    await assert.rejects(saveFluency(repo, teacher, classId, [{ studentId: roster[1].id, wcpm: 900 }]), ValidationError);
    const other = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.3" }))!);
    await assert.rejects(classFluency(repo, other, classId), ForbiddenError);
  });

  test("support groups: low fluency is a group with a mini-lesson", async () => {
    const g = await supportGroups(repo, teacher, classId);
    const flu = g.groups.find((x) => x.kind === "FLUENCY")!;
    assert.deepEqual(flu.students.map((x) => x.id), [roster[1].id]);
    const l = await miniLesson(repo, teacher, classId, { code: flu.code });
    assert.ok(l.objective && l.iDo && l.weDo.length);
    assert.equal(l.students.length, 1);
  });

  test("school goals: saved by the admin, read on teacher pages, used as the weekly goal; a grade gets the plan at once", async () => {
    await assert.rejects(saveSchoolGoals(repo, teacher, { weeklyMinutes: 60, weeklyParts: 4, units: [] }), ForbiddenError);
    await saveSchoolGoals(repo, admin, { weeklyMinutes: 90, weeklyParts: 4, units: [{ grade: 4, unit: "Unit 1", pct: 80, by: "2026-11-15" }] });
    assert.equal((await schoolGoals(repo, admin.schoolId!)).weeklyParts, 4);
    assert.equal((await weekStats(repo, roster[3].id)).partsGoal, 4);
    const r = await sendPlanToGrade(repo, admin, 4, 20);
    assert.ok(r.classes >= 1 && r.created >= 1);
    const p = await goalProgress(repo, teacher, [await repo.findUnique("Class", { id: classId }) as never]);
    assert.equal(p.rows[0].units[0].target, 80);
    await assert.rejects(sendPlanToGrade(repo, teacher, 4, 20), ForbiddenError);
  });

  test("class transfer: the class and its plans move to the new teacher", async () => {
    const ts = await schoolTeachers(repo, admin);
    const lead = String((await repo.findMany("ClassTeacher", { classId }))[0].teacherId);
    const other = ts.find((t) => t.id !== lead)!;
    await transferClass(repo, admin, classId, other.id, true);
    const links = await repo.findMany("ClassTeacher", { classId });
    assert.ok(links.some((l) => String(l.teacherId) === other.id && l.isLead));
    await assert.rejects(transferClass(repo, teacher, classId, other.id), ForbiddenError);
  });

  test("explain: only after answering; without an AI key the platform explains it itself", async () => {
    const fresh = await student(roster[4].id);
    const q = (await repo.findMany("Question", { status: "PUBLISHED" }))[0];
    await assert.rejects(explainAnswer(repo, fresh, String(q.id), {}), ForbiddenError);
    // a student who answered (the Weekly Check above)
    const att = (await repo.findMany("QuestionAttempt", { studentId: roster[0].id }))[0];
    assert.ok(att);
    const e = await explainAnswer(repo, await student(roster[0].id), String(att.questionId), {});
    assert.equal(e.source, "PLATFORM");
    assert.ok(e.text.length > 5 && e.steps.length === 3);
  });

  test("report files: the analysis renders to Excel and CSV", () => {
    const r = { testId: "t", title: "Diagnostic Test · Grade 4", grade: 4, year: "2026-2027", scope: "4A", classId: "c", date: "2026-10-09", bands: { above: 85, on: 65 }, classes: [],
      summary: { roster: 2, assessed: 1, inProgress: 0, notStarted: 1, mean: 70, median: 70, min: 70, max: 70, minutes: 20, rapidFlags: 0, best: { code: "RL.4.2", label: "Theme & Summary", pct: 80 }, focus: [], levels: { ABOVE: 0, ON: 1, BELOW: 0 } },
      standards: [{ code: "RL.4.2", label: "Theme & Summary", strand: "LIT" as const, questions: 5, pct: 80, level: "Strength", below50: 0, objective: "o", activities: ["a"] }], strands: [{ strand: "LIT" as const, label: "Reading Literature", pct: 80 }],
      students: [{ id: "s", name: "Test Student", number: "1", className: "4A", correct: 7, total: 10, pct: 70, rank: 50, level: "ON" as const, tier: "PROFICIENT", standards: { "RL.4.2": 80 }, strands: { LIT: 80 }, minutes: 20, rapid: 0, rit: 200, wcpm: 110, shared: false, resultId: "r" }],
      notTaken: [{ id: "n", name: "Other Student", className: "4A", status: "Not started" as const, answered: 0, action: "Schedule" }], tiers: [], supportPlan: [], fluency: { benchmark: 120, checked: 1, below: [] }, items: [] };
    const doc = classDoc(r, { branding: { name: "Test School", nameAr: null, logo: null }, generatedAt: new Date(), generatedBy: "T" });
    assert.ok(renderXlsx(doc).length > 1000);
    assert.match(renderCsv(doc), /Test Student/);
  });
});
