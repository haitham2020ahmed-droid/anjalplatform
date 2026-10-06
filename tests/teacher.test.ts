import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { loadSkillItems } from "../src/server/practice/items";
import { startPractice, submitAnswer } from "../src/server/practice/session";
import { getStudentCurriculum, getUnitSkillCards } from "../src/server/queries/student-curriculum";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { classAssignments, createAssignment } from "../src/server/teacher/assignments";
import { evaluateRules, resolveAlert, scanInterventions } from "../src/server/teacher/interventions";
import { classOverview, groupFor, masteryGrid, studentDetail, teacherClasses } from "../src/server/teacher/queries";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";
const rng = seededRandom(4242);

let repo: SqliteRepo;
let t4a: Actor, t4b: Actor, admin: Actor;
let classA: string, classB: string;
const T0 = new Date("2026-11-02T07:30:00Z");
let clock = 0;
const at = (s = 30) => new Date(T0.getTime() + (clock += s) * 1000);
const range = { from: new Date("2026-09-01"), to: new Date("2027-07-01") };
const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
const sid = async (u: string) => String((await repo.findUnique("Student", { userId: (await repo.findUnique("User", { username: u }))!.id }))!.id);

async function practise(username: string, skillCode: string, pattern: boolean[]) {
  const a = await actor(username);
  const st = (await repo.findUnique("Student", { id: a.studentId! }))!;
  const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
  const skill = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: skillCode }))!.id);
  let view = await startPractice(repo, a, skill, at(0), rng);
  const items = await loadSkillItems(repo, skill);
  for (const right of pattern) {
    if (!view.question) { await repo.updateMany("PracticeSession", { id: view.sessionId }, { endedAt: at(1) }); view = await startPractice(repo, a, skill, at(60), rng); }
    if (!view.question) break;
    const it = items.find((i) => i.questionId === view.question!.questionId)!;
    const resp = it.options ? (it.type === "MULTI_SELECT" ? (right ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.map((o) => o.label)) : it.options.find((o) => o.correct === right)!.label)
      : it.type === "TRUE_FALSE" ? (right ? it.answer : !it.answer) : it.type === "FILL_BLANK" ? (right ? it.answers![0] : "zzz")
      : it.type === "ERROR_CORRECTION" ? (right ? it.errorIndex : (it.errorIndex! + 1) % it.segments!.length)
      : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p, i) => [p.left, right ? p.right : it.pairs![(i + 1) % it.pairs!.length].right]))
      : right ? it.sequence : [...it.sequence!].reverse();
    ({ view } = await submitAnswer(repo, a, { sessionId: view.sessionId, questionId: it.questionId, response: resp }, at(35), rng));
  }
  return skill;
}

before(async () => {
  ({ repo } = await demoDatabase());
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
  await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
  t4a = await actor("demo.teacher.4a");
  t4b = await actor("demo.teacher.4b");
  admin = await actor("demo.admin");
  classA = String((await repo.findMany("ClassMembership", { studentId: await sid("demo.s1001") }))[0].classId);
  classB = String((await repo.findMany("ClassMembership", { studentId: await sid("demo.s1004") }))[0].classId);
  // class 4A: s1001 strong, s1002 struggling, s1003 untouched
  await practise("demo.s1001", "G4.context-clues", [true, true, true, true, true, false, true, true, true, true]);
  await practise("demo.s1001", "G4.theme", [true, true, true, false, true, true]);
  await practise("demo.s1002", "G4.context-clues", [false, false, true, false, false, false, true, false, false, false]);
  await practise("demo.s1003", "G4.context-clues", [true, false, true, true, false, true]);
});

describe("access", () => {
  test("a teacher sees only the classes they teach; an admin sees the school", async () => {
    const mine = await teacherClasses(repo, t4a);
    assert.deepEqual(mine.map((c) => c.classId), [classA]);
    assert.ok((await teacherClasses(repo, admin)).length >= 6);
  });

  test("a teacher cannot open another class or a student outside their classes", async () => {
    await assert.rejects(classOverview(repo, t4a, classB, range), /do not teach/);
    await assert.rejects(studentDetail(repo, t4a, await sid("demo.s1004")), /do not have access/);
    await assert.rejects(classOverview(repo, await actor("demo.s1001"), classA, range), /do not teach/);
  });
});

describe("class overview", () => {
  test("KPIs are computed from the students' real answers", async () => {
    const o = await classOverview(repo, t4a, classA, range);
    const attempts = await repo.findMany("QuestionAttempt", { studentId: { in: [await sid("demo.s1001"), await sid("demo.s1002"), await sid("demo.s1003")] } });
    assert.equal(o.kpis.students, 3);
    assert.equal(o.kpis.questions, attempts.length);
    assert.equal(o.kpis.accuracyPct, Math.round((100 * attempts.filter((a) => a.isCorrect).length) / attempts.length));
    assert.equal(o.kpis.activeStudents, 3);
    const strong = o.students.find((s) => s.studentId === o.students.find((x) => x.name.endsWith("1001"))!.studentId)!;
    const weak = o.students.find((s) => s.name.endsWith("1002"))!;
    assert.ok(strong.avgMastery! > weak.avgMastery!);
  });

  test("hardest questions and weakest skills are listed", async () => {
    const o = await classOverview(repo, t4a, classA, range);
    assert.ok(o.weakSkills.length >= 1 && o.weakSkills[0].name === "Context Clues");
    const weakIds = new Set(o.weakSkills.map((x) => x.skillId));
    assert.ok(o.strongSkills.every((x) => !weakIds.has(x.skillId) && x.avgMastery >= 60), "strong and weak lists never overlap");
    for (let i = 1; i < o.hardQuestions.length; i++) assert.ok(o.hardQuestions[i].accuracyPct >= o.hardQuestions[i - 1].accuracyPct);
  });

  test("groups follow placement when available, otherwise mastery", () => {
    assert.equal(groupFor(-1.4, 90), "Intervention");
    assert.equal(groupFor(1.2, 10), "Advanced");
    assert.equal(groupFor(null, 55), "Developing");
    assert.equal(groupFor(null, null), null);
  });

  test("the heat map has one row per student and one column per unit skill", async () => {
    // Context Clues is taught in Units 3–4 of Wonders Grade 4: use the unit that contains it
    const st = (await repo.findUnique("Student", { id: await sid("demo.s1001") }))!;
    const curId = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0].id;
    const cc = String((await repo.findUnique("Skill", { curriculumId: curId, code: "G4.context-clues" }))!.id);
    const unitId = String((await repo.findMany("UnitSkill", { skillId: cc }))[0].unitId);
    const g = await masteryGrid(repo, t4a, classA, unitId);
    assert.equal(g.rows.length, 3);
    assert.ok(g.skills.length > 5);
    const col = g.skills.findIndex((k) => k.name === "Context Clues");
    assert.ok(col >= 0 && g.rows.every((r) => r.cells[col] !== null), "everyone practised context clues");
  });
});

describe("intervention alerts", () => {
  const A = (correct: boolean, i: number, extra: Partial<{ ms: number; session: string; rapid: boolean }> = {}) => ({
    correct, at: Date.parse("2026-11-01T08:00:00Z") + i * 60_000, ms: extra.ms ?? 30_000, est: 40, rapid: extra.rapid ?? false, session: extra.session ?? "s1", questionRef: `q${i}`,
  });
  const now = Date.parse("2026-11-02T08:00:00Z");

  test("each rule fires on its own evidence, and rapid guesses do not count as accuracy", () => {
    const low = evaluateRules({ attempts: [true, false, false, true, false, false, true, false, false].map((c, i) => A(c, i)), masteryNow: 30, masteryPeak30d: 30, prereqRoutes14d: 0, now });
    assert.ok(low.some((f) => f.rule === "LOW_ACCURACY") && low.some((f) => f.rule === "REPEATED_ERRORS"));
    const slow = evaluateRules({ attempts: Array.from({ length: 9 }, (_, i) => A(true, i, { ms: 120_000 })), masteryNow: 70, masteryPeak30d: 70, prereqRoutes14d: 0, now });
    assert.deepEqual(slow.map((f) => f.rule), ["SLOW_RESPONSES"]);
    const declining = evaluateRules({ attempts: [A(true, 1)], masteryNow: 55, masteryPeak30d: 78, prereqRoutes14d: 0, now });
    assert.deepEqual(declining.map((f) => f.rule), ["DECLINING_MASTERY"]);
    const sessions = evaluateRules({ attempts: ["a", "b", "c"].flatMap((s, k) => [false, false, true].map((c, i) => A(c, k * 3 + i, { session: s }))), masteryNow: 40, masteryPeak30d: 40, prereqRoutes14d: 0, now });
    assert.ok(sessions.some((f) => f.rule === "FAILED_SESSIONS"));
    assert.deepEqual(evaluateRules({ attempts: [], masteryNow: 0, masteryPeak30d: 0, prereqRoutes14d: 2, now }).map((f) => f.rule), ["PREREQ_GAP"]);
    assert.equal(evaluateRules({ attempts: [], masteryNow: 0, masteryPeak30d: 0, prereqRoutes14d: 1, now }).length, 0, "one reroute is normal");
    // low accuracy with good mastery = the engine is stretching a capable student: no alert
    assert.equal(evaluateRules({ attempts: [true, false, false, true, false, false, true, false, false].map((c, i) => A(c, i)), masteryNow: 72, masteryPeak30d: 72, prereqRoutes14d: 0, now }).length, 0);
    const guesses = evaluateRules({ attempts: Array.from({ length: 10 }, (_, i) => A(false, i, { rapid: true })), masteryNow: 20, masteryPeak30d: 20, prereqRoutes14d: 0, now });
    assert.equal(guesses.length, 0);
    assert.equal(evaluateRules({ attempts: Array.from({ length: 10 }, (_, i) => A(true, i)), masteryNow: 80, masteryPeak30d: 80, prereqRoutes14d: 0, now }).length, 0);
  });

  test("scanning creates readable alerts for the struggling student only, without duplicates", async () => {
    const ids = [await sid("demo.s1001"), await sid("demo.s1002"), await sid("demo.s1003")];
    const created = await scanInterventions(repo, ids, at(60));
    assert.ok(created >= 1);
    const alerts = await repo.findMany("InterventionAlert", {});
    assert.ok(alerts.every((a) => a.studentId === ids[1]), "only the struggling student is flagged");
    assert.match(String(alerts[0].message), /may need support with Context Clues/);
    assert.ok((alerts[0].evidence as { nextAction?: string }).nextAction);
    assert.equal(await scanInterventions(repo, ids, at(60)), 0, "re-scanning does not duplicate open alerts");
    const keys = alerts.map((a) => `${a.studentId}|${a.skillId}`);
    assert.equal(new Set(keys).size, keys.length, "at most one open alert per student and skill");
  });

  test("only a teacher of the student can resolve an alert; resolving is audited", async () => {
    const a = (await repo.findMany("InterventionAlert", { resolvedAt: null }))[0];
    await assert.rejects(resolveAlert(repo, t4b, String(a.id)), /cannot manage/);
    await resolveAlert(repo, t4a, String(a.id), "Met with student");
    assert.ok((await repo.findUnique("InterventionAlert", { id: a.id }))!.resolvedAt);
    assert.equal(await repo.count("AuditLog", { action: "intervention.resolve" }), 1);
  });

  test("the student page shows placement, skills, recent answers and the engine's decision trail", async () => {
    const d = await studentDetail(repo, t4a, await sid("demo.s1002"));
    assert.ok(d.skills.length >= 1 && d.recent.length >= 5);
    assert.ok(d.decisions.length >= 5 && d.decisions.every((x) => x.reason.length > 10));
    assert.ok(d.recent.some((r) => !r.correct));
  });
});

describe("assignments", () => {
  test("a teacher assigns skills with a due date; every student is enrolled and notified", async () => {
    const cur = await getStudentCurriculum(repo, await sid("demo.s1001"));
    const st = (await repo.findUnique("Student", { id: await sid("demo.s1001") }))!;
    const curId = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0].id;
    const theme = String((await repo.findUnique("Skill", { curriculumId: curId, code: "G4.theme" }))!.id);
    const cc = String((await repo.findUnique("Skill", { curriculumId: curId, code: "G4.context-clues" }))!.id);
    await createAssignment(repo, t4a, { classId: classA, title: "Theme and context clues", target: "SKILL", skillIds: [theme, cc], dueAt: new Date("2026-11-09T12:00:00Z"), targetMastery: 60 }, new Date("2026-11-03T08:00:00Z"));
    assert.equal(await repo.count("AssignmentStudent", {}), 3);
    assert.equal(await repo.count("Notification", { type: "NEW_ASSIGNMENT" }), 3);
    const list = await classAssignments(repo, t4a, classA, new Date("2026-11-03T09:00:00Z"));
    assert.equal(list[0].counts.NOT_STARTED + list[0].counts.IN_PROGRESS + list[0].counts.COMPLETED, 3);
    void cur;
  });

  test("assigned skills rise to the top of the student's recommendations", async () => {
    const s3 = await sid("demo.s1003");
    const cur = await getStudentCurriculum(repo, s3);
    const { cards } = await getUnitSkillCards(repo, s3, cur.units.find((u) => u.number === 2)!.unitId, new Date("2026-11-08T08:00:00Z"));
    const theme = cards.find((c) => c.name === "Theme");
    assert.ok(theme, "Theme is a Unit 2 skill");
    assert.equal(theme.recommended, true);
    assert.match(theme.recommendedReason!, /teacher assigned/);
  });

  test("past the due date unfinished work becomes overdue; teachers cannot assign to other classes or with past dates", async () => {
    const list = await classAssignments(repo, t4a, classA, new Date("2026-11-20T08:00:00Z"));
    assert.ok(list[0].counts.OVERDUE + list[0].counts.COMPLETED === 3 && list[0].counts.OVERDUE >= 1);
    await assert.rejects(createAssignment(repo, t4a, { classId: classB, title: "x", target: "UNIT", unitId: "u", dueAt: null }), /do not teach/);
    await assert.rejects(createAssignment(repo, t4a, { classId: classA, title: "x", target: "SKILL", skillIds: ["nope"], dueAt: new Date("2020-01-01") }, new Date("2026-11-20")), /past/);
  });
});
