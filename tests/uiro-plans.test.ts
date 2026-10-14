/**
 * UI reorg Phase 4 + access rules (acceptance, in-memory Demo School; no real student data):
 *  - one Plans wizard: MAP, NAFS (general + personalized after a test), Curriculum, RTI, Custom → My Plans + My Work
 *    with the right source tag (Curriculum / MAP / NAFS / RTI / Grammar / Custom)
 *  - any teacher assigns any grade's skill to their OWN students; Grade 11 (no curriculum) is fully usable
 *  - content open to every teacher; student data private (typed URLs = direct server calls)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { giveQuestion } from "./helpers/give-question";
import { createHash } from "node:crypto";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill, NO_CURRICULUM_MESSAGE, teacherCurriculum } from "../src/server/teacher/assign";
import { createAssignment } from "../src/server/teacher/assignments";
import { assignSkillByLevel } from "../src/server/teacher/skill-assign";
import { createGrade, createSkill } from "../src/server/curriculum-manage";
import { publishQuestions } from "../src/server/admin/questions";
import { backupSheets } from "../src/server/teacher/extras";
import { applyRoster, planRoster } from "../src/server/admin/roster-import";
import { assignPlan, myPlans, myWorkItems, personalizeNafsPlanFromResults, plansWizardContext, proposePlan, searchSkillsAnyGrade } from "../src/server/plans/wizard";
import { skillPlanForStudent } from "../src/server/curriculum-map/plans";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { startPractice } from "../src/server/practice/session";
import { resetPassword } from "../src/server/auth/passwords-admin";
import { teacherClassData, teacherStudentData } from "../src/server/teacher/page-data";
import { studentHomeData } from "../src/server/student/home-data";
import { levelStory } from "../src/server/insights/level-story";
import { studentProgress } from "../src/server/insights/progress";
import { parentReport } from "../src/server/insights/parent-report";
import { studentGrammarReport } from "../src/server/reports/grammar-report";
import { studentReadMasterReport } from "../src/server/reports/readmaster-report";
import { studentTierProgress } from "../src/server/tiers/views";
import { studentFile } from "../src/server/insights/student-file";
import { studentProfile } from "../src/server/map/nwea-reports";
import { teacherClasses } from "../src/server/teacher/queries";
import { teacherAlerts } from "../src/server/insights/progress";
import { onboarding } from "../src/server/teacher/week-plan";
import { myMap } from "../src/server/map/map-more";
import { studentMap } from "../src/server/map/student-map";
import { mySkillPlan } from "../src/server/map/skill-plan";
import { isAssignedSkill, setPlacementRequired } from "../src/server/student/assigned";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { demoDatabase, ROOT } from "./helpers/db";

const NOW = new Date("2027-01-10T08:00:00Z");

describe("UI reorg Phase 4: Plans wizard, source tags, assign across grades, Grade 11, access rules", () => {
  let repo: SqliteRepo;
  let admin: Actor, t4: Actor, t5: Actor, t11: Actor;
  let class4: string, class5: string, class11: string;
  let g6Skill: string, g6SkillName: string;
  const actorFor = async (username: string) => resolveActor(repo, (await repo.findUnique("User", { username }))!);
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: String((await repo.findUnique("Student", { id: studentId }))!.userId) }))!);
  const members = async (classId: string) => (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();

  before(async () => {
    ({ repo } = await demoDatabase());
    // publish the Grade 4 and Grade 6 banks (so skills can be practised)
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const qs = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => /^G[46]-/.test(String(q.externalRef)));
    await repo.updateMany("Question", { id: { in: qs.map((q) => q.id) } }, { status: "PUBLISHED" });
    admin = await actorFor("demo.admin");
    t4 = await actorFor("demo.teacher.4a");
    t5 = await actorFor("demo.teacher.5a");
    class4 = (await teacherCurriculum(repo, t4))!.classId;
    class5 = (await teacherCurriculum(repo, t5))!.classId;
    // a Grade 6 skill with published questions
    const g6 = (await repo.findMany("Grade", { schoolId: admin.schoolId!, level: 6 }))[0];
    const cur6 = (await repo.findMany("Curriculum", { gradeId: g6.id }))[0];
    const counts = new Map<string, number>();
    for (const q of await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId"] })) counts.set(String(q.skillId), (counts.get(String(q.skillId)) ?? 0) + 1);
    const k6 = (await repo.findMany("Skill", { curriculumId: cur6.id, isActive: true })).filter((k) => (counts.get(String(k.id)) ?? 0) >= 5 && !String(k.code).includes(".grammar."))[0];
    g6Skill = String(k6.id); g6SkillName = String(k6.name);
  });

  test("admin creates Grade 11 and imports its teacher and students (password = username)", async () => {
    await createGrade(repo, admin, { level: 11 });
    const csv = ["role,username,display_name,student_number,grade,class", "TEACHER,t.g11,Test Teacher Eleven,,,11A", "STUDENT,s.g11a,Test Student A,G11-001,11,11A", "STUDENT,s.g11b,Test Student B,G11-002,11,11A"].join("\n");
    const bytes = new TextEncoder().encode(csv);
    const plan = await planRoster(repo, admin, "g11.csv", bytes);
    assert.deepEqual(plan.problems, []);
    await applyRoster(repo, admin, "g11.csv", bytes, createHash("sha256").update(bytes).digest("hex"));
    t11 = await actorFor("t.g11");
    const ctx = await plansWizardContext(repo, t11);
    assert.equal(ctx.classes.length, 1);
    class11 = ctx.klass!.id;
    assert.equal(ctx.klass!.grade, 11);
    assert.equal(ctx.klass!.students.length, 2);
    assert.equal(ctx.message, NO_CURRICULUM_MESSAGE, "a grade without curriculum shows the message, not an empty list");
    const view = (await teacherCurriculum(repo, t11))!;
    assert.equal(view.noCurriculum, true);
    assert.ok(view.grades!.some((g) => g.level === 6 && g.skills > 0), "every grade's curriculum is listed for the teacher");
    const g6view = (await teacherCurriculum(repo, t11, class11, { grade: 6 }))!;
    assert.ok(g6view.units.flatMap((u) => u.skills).some((k) => k.id === g6Skill && k.grade === 6), "Grade 6 skills shown, with their grade tag");
  });

  test("Grade 11 class: assign a Grade 6 skill → it is in the student's My Work and can be practised", async () => {
    const r = await assignSkill(repo, t11, { source: "CURRICULUM", classId: class11, skillId: g6Skill }, NOW);
    assert.equal(r.students, 2);
    const [sid] = await members(class11);
    const st = await studentActor(sid);
    const work = await myWorkItems(repo, st, NOW);
    const row = work.find((w) => w.skillId === g6Skill)!;
    assert.ok(row, "the Grade 6 skill is in the Grade 11 student's My Work");
    assert.equal(row.source, "Curriculum");
    assert.equal(row.status, "Not started");
    assert.equal(row.href, `/practice/${g6Skill}`);
    assert.equal(await isAssignedSkill(repo, st, g6Skill, NOW), true);
    const view = await startPractice(repo, st, g6Skill, NOW);
    assert.ok(view.question, "the skill opens at the student's level (adaptive practice)");
    // a skill that was NOT assigned to them stays closed
    const other = (await repo.findMany("Skill", { code: "G6.theme" }))[0];
    if (other && String(other.id) !== g6Skill) await assert.rejects(startPractice(repo, st, String(other.id), NOW), ForbiddenError);
    // My Plans works for Grade 11 (Custom plan from another grade)
    const p = await assignPlan(repo, t11, { source: "CURRICULUM", classId: class11, type: "CUSTOM", skillIds: [g6Skill], title: "Grade 6 bridge" }, NOW);
    assert.equal(p.skills, 1);
    const plans = await myPlans(repo, st);
    assert.deepEqual(plans.map((x) => [x.title, x.source]), [["Grade 6 bridge", "Custom"]]);
    const sv = await skillPlanForStudent(repo, st, p.planId, NOW);
    assert.equal(sv.places[0].href, `/practice/${g6Skill}`, "a plan's skill opens practice directly");
    // the class is fully usable: the teacher's class page and student profile, the student's home page
    const cls = await teacherClassData(repo, t11, class11, undefined);
    assert.ok(cls.o, "Grade 11 class page (reports) opens");
    assert.ok((await teacherStudentData(repo, t11, sid)).d, "Grade 11 student profile opens");
    const home = await studentHomeData(repo, st);
    assert.ok(home.view.items.some((i) => i.skillId === g6Skill), "Grade 11 student home lists the work");
    assert.equal((await teacherClasses(repo, t11)).length, 1, "teacher home");
    await teacherAlerts(repo, t11, NOW);
    await onboarding(repo, t11);
    await Promise.all([myMap(repo, st), studentMap(repo, st), mySkillPlan(repo, st)]); // the student's MAP page
  });

  test("a Grade 4 teacher sees Grade 6 and Grade 11 content and assigns a Grade 6 skill to their class", async () => {
    const v6 = (await teacherCurriculum(repo, t4, class4, { grade: 6 }))!;
    assert.equal(v6.viewGrade!.level, 6);
    assert.ok(v6.units.length > 0, "Grade 6 curriculum open to a Grade 4 teacher");
    const v11 = (await teacherCurriculum(repo, t4, class4, { grade: 11 }))!;
    assert.equal(v11.viewGrade!.level, 11);
    const found = await searchSkillsAnyGrade(repo, t4, g6SkillName.slice(0, 12));
    // one question bank: one row per skill family (any grade's copy stands for it)
    assert.ok(found.some((k) => k.name.toLowerCase().replace(/[^a-z]/g, "") === g6SkillName.toLowerCase().replace(/[^a-z]/g, "")), "search lists skills of every grade");
    const r = await assignSkill(repo, t4, { source: "NAFS", classId: class4, skillId: g6Skill, track: "NAFS" }, NOW);
    assert.ok(r.assignmentId, "Nafs is no longer Grade 6 only and the skill may come from Grade 6");
    // older paths too: multi-skill assignment, assign-by-level
    await createAssignment(repo, t4, { source: "CURRICULUM", classId: class4, title: "Mixed", target: "SKILL", skillIds: [g6Skill], dueAt: null }, NOW);
    const lv = await assignSkillByLevel(repo, t4, { source: "CURRICULUM", classId: class4, skillId: g6Skill, mode: "AUTOMATIC" }, NOW);
    assert.equal(lv.groups.length, 1);
    // never into a class that is not theirs
    await assert.rejects(assignSkill(repo, t4, { source: "CURRICULUM", classId: class5, skillId: g6Skill }, NOW), ForbiddenError);
    await assert.rejects(assignPlan(repo, t4, { source: "CURRICULUM", classId: class11, type: "CUSTOM", skillIds: [g6Skill] }, NOW), ForbiddenError);
  });

  test("student data stays private: another teacher's student profile and password reset are refused (typed URL)", async () => {
    const [other] = await members(class5);
    await assert.rejects(teacherStudentData(repo, t4, other), ForbiddenError, "profile page of another teacher's student");
    const otherUser = String((await repo.findUnique("Student", { id: other }))!.userId);
    await assert.rejects(resetPassword(repo, t4, otherUser), ForbiddenError, "reset password of another teacher's student");
    await assert.rejects(proposePlan(repo, t4, { classId: class4, type: "CUSTOM", studentIds: [other], skillIds: [g6Skill] }), ForbiddenError, "cannot slip another class's student into a plan");
    await assert.rejects(plansWizardContext(repo, t4, class5), ForbiddenError, "cannot open another teacher's class in Plans");
    // every student page a teacher can type a URL for (/teacher/level-story/[id], /teacher/progress/[id], …)
    const sweep: [string, () => Promise<unknown>][] = [
      ["level story", () => levelStory(repo, t4, other)], ["progress", () => studentProgress(repo, t4, other)],
      ["family report", () => parentReport(repo, t4, other)], ["grammar report", () => studentGrammarReport(repo, t4, other, { days: 30 })],
      ["ReadMaster report", () => studentReadMasterReport(repo, t4, other)], ["RTI tier", () => studentTierProgress(repo, t4, other)],
      ["student file", () => studentFile(repo, t4, other)], ["MAP profile", () => studentProfile(repo, t4, other)],
    ];
    for (const [what, call] of sweep) await assert.rejects(call(), (e: Error) => e instanceof ForbiddenError || /not found|cannot|access|your/i.test(e.message), `${what} of another teacher's student`);
    // own student: allowed; the admin: every student
    const [mine] = await members(class4);
    assert.ok((await teacherStudentData(repo, t4, mine)).d);
    assert.ok((await teacherStudentData(repo, admin, other)).d);
    const adminCtx = await plansWizardContext(repo, admin);
    assert.ok(adminCtx.classes.length >= 7, "the admin sees every class (incl. Grade 11)");
  });

  test("admin only: publishing questions, adding grades / skills, school settings and backups", async () => {
    const draft = (await repo.findMany("Question", { status: "UNDER_REVIEW" }, { select: ["id"], take: 1 }))[0];
    await assert.rejects(publishQuestions(repo, t4, [String(draft.id)]), ForbiddenError, "publish");
    await assert.rejects(createGrade(repo, t4, { level: 12 }), ForbiddenError, "add a grade");
    const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId!, level: 4 }))[0];
    await assert.rejects(createSkill(repo, t4, { gradeId: String(g4.id), name: "Teacher skill", domain: "READING", category: "COMPREHENSION" }), ForbiddenError, "add a skill");
    await assert.rejects(setPlacementRequired(repo, t4, true), ForbiddenError, "school settings");
    await assert.rejects(backupSheets(repo, t4), ForbiddenError, "backup");
  });

  test("MAP plan: built from MAP scores → My Plans + My Work with the MAP tag", async () => {
    const [sid] = await members(class4);
    const st = (await repo.findUnique("Student", { id: sid }))!;
    const name = String((await repo.findUnique("User", { id: st.userId }))!.displayName);
    const header = [...MAP_TEMPLATE_HEADERS];
    const row = header.map((h) => ({ "Student Number": String(st.studentNumber), "Student Name": name, "Reading Fall RIT": "188", "R: Informational Text": "176", "R: Literary Text": "195", "R: Vocabulary": "190" } as Record<string, string>)[h] ?? "");
    const imp = await importMapScores(repo, t4, [header, row], 2026, NOW);
    assert.equal(imp.imported, 1);
    const prop = await proposePlan(repo, t4, { classId: class4, type: "MAP", studentIds: [sid] });
    assert.ok(prop.skills.length > 0, `MAP plan proposes skills (${prop.notes.join(" ")})`);
    assert.ok(prop.skills.every((k) => k.track === "MAP" && k.studentIds.join() === sid));
    // edit: remove one skill, add one from another grade
    const keep = prop.skills.slice(1).map((k) => k.id);
    const res = await assignPlan(repo, t4, { source: "CURRICULUM", classId: class4, type: "MAP", studentIds: [sid], keep, add: [g6Skill], title: "MAP plan · Fall" }, NOW);
    assert.equal(res.skills, keep.length + (keep.includes(g6Skill) ? 0 : 1));
    const me = await studentActor(sid);
    const plans = await myPlans(repo, me);
    const mp = plans.find((p) => p.title === "MAP plan · Fall")!;
    assert.ok(mp, "the MAP plan is in My Plans");
    assert.equal(mp.source, "MAP");
    const work = await myWorkItems(repo, me, NOW);
    for (const id of keep) assert.equal(work.find((w) => w.skillId === id)?.source, "MAP", "its skills are in My Work with the MAP tag");
    assert.ok(!work.some((w) => w.skillId === prop.skills[0].id && w.source === "MAP"), "the removed skill was not assigned");
    // the other students of the class did not get this personal plan
    const [, other] = await members(class4);
    assert.ok(!(await myPlans(repo, await studentActor(other))).some((p) => p.title === "MAP plan · Fall"));
  });

  test("NAFS plan (general) and a Grammar skill → My Work with the NAFS and Grammar tags", async () => {
    const prop = await proposePlan(repo, t5, { classId: class5, type: "NAFS" });
    assert.ok(prop.skills.length > 0, `NAFS areas give skills (${prop.notes.join(" ")})`);
    const res = await assignPlan(repo, t5, { source: "CURRICULUM", classId: class5, type: "NAFS" }, NOW);
    // a grammar skill (one library for every grade) assigned with Custom
    const g5 = (await repo.findMany("Grade", { schoolId: admin.schoolId!, level: 5 }))[0];
    const cur5 = (await repo.findMany("Curriculum", { gradeId: g5.id }))[0];
    const base = (await repo.findMany("Skill", { curriculumId: cur5.id }))[0];
    const { id: _id, code: _code, ...rest } = base;
    void _id; void _code;
    const gram = await repo.create("Skill", { ...rest, code: "G5.grammar.test-u1w1-s1", name: "Test grammar: commas in a series" });
    await giveQuestion(repo, String(gram.id));
    await assignPlan(repo, t5, { source: "CURRICULUM", classId: class5, type: "CUSTOM", skillIds: [String(gram.id)] }, NOW);
    const [sid] = await members(class5);
    const me = await studentActor(sid);
    const work = await myWorkItems(repo, me, NOW);
    assert.equal(work.find((w) => w.skillId === String(gram.id))?.source, "Grammar");
    assert.equal(String((await repo.findMany("Assignment", { skillId: gram.id }))[0].track), "GRAMMAR");
    const nafsIds = new Set(prop.skills.map((k) => k.id));
    assert.ok(work.some((w) => w.skillId && nafsIds.has(w.skillId) && w.source === "NAFS"), "NAFS skills tagged NAFS");
    assert.ok((await myPlans(repo, me)).some((p) => p.id === res.planId && p.source === "NAFS"));
  });

  test("NAFS plan (personal): after a practice test, each student gets the skills they missed", async () => {
    const [a, b] = await members(class5);
    const test = await assignSkill(repo, t5, { source: "NAFS", classId: class5, skillId: g6Skill, track: "NAFS" }, NOW); // stands in for a NAFS practice test
    const g5skills = (await teacherCurriculum(repo, t5))!.units.flatMap((u) => u.skills).slice(0, 2).map((k) => k.id);
    const r = await personalizeNafsPlanFromResults(repo, t5, { testId: test.assignmentId, results: [
      { studentId: a, skillId: g5skills[0], correct: 1, total: 5 }, { studentId: a, skillId: g5skills[1], correct: 5, total: 5 },
      { studentId: b, skillId: g5skills[1], correct: 2, total: 5 }, { studentId: "not-in-class", skillId: g5skills[0], correct: 0, total: 5 },
    ] }, NOW);
    assert.equal(r.plans.length, 1);
    assert.equal(r.studentsWithGaps, 2);
    const workA = await myWorkItems(repo, await studentActor(a), NOW);
    assert.equal(workA.find((w) => w.skillId === g5skills[0])?.source, "NAFS");
    const planA = await skillPlanForStudent(repo, await studentActor(a), r.plans[0].planId, NOW);
    assert.equal(planA.places.length, 1, "student A sees only the skill they missed");
    assert.equal(planA.places[0].href, `/practice/${g5skills[0]}`);
    const planB = await skillPlanForStudent(repo, await studentActor(b), r.plans[0].planId, NOW);
    assert.deepEqual(planB.places.map((x) => x.href), [`/practice/${g5skills[1]}`]);
    await assert.rejects(personalizeNafsPlanFromResults(repo, t4, { testId: test.assignmentId, results: [] }, NOW), ForbiddenError, "only the class's teacher");
  });

  test("RTI plan: weekly skills for students in Tier 2/3 only (tag RTI); Curriculum plan from a unit", async () => {
    const [a, b] = await members(class4);
    // a skill student A has no work on yet (My Work shows one row per skill)
    const busy = new Set((await myWorkItems(repo, await studentActor(a), NOW)).map((w) => w.skillId));
    const focus = (await teacherCurriculum(repo, t4))!.units.flatMap((u) => u.skills).find((k) => !busy.has(k.id))!.id;
    await repo.create("StudentTier", { studentId: a, schoolId: admin.schoolId, tier: 2, source: "TEACHER", locked: false, reason: "Test", focusSkillId: focus, since: NOW, monitorEveryDays: 14, updatedAt: NOW });
    const prop = await proposePlan(repo, t4, { classId: class4, type: "RTI" });
    assert.deepEqual(prop.skills.map((k) => [k.id, k.studentIds]), [[focus, [a]]]);
    assert.ok(prop.notes.some((n) => /Not in RTI/.test(n)));
    await assignPlan(repo, t4, { source: "CURRICULUM", classId: class4, type: "RTI" }, NOW);
    assert.equal((await myWorkItems(repo, await studentActor(a), NOW)).find((w) => w.skillId === focus && w.source === "RTI")?.status, "Not started");
    assert.ok(!(await myWorkItems(repo, await studentActor(b), NOW)).some((w) => w.source === "RTI"), "students outside RTI get nothing");
    const cur = await proposePlan(repo, t4, { classId: class4, type: "CURRICULUM" });
    assert.ok(cur.units.length > 0 && cur.unitId && cur.skills.length > 0);
    const done = await assignPlan(repo, t4, { source: "CURRICULUM", classId: class4, type: "CURRICULUM", unitId: cur.unitId }, NOW);
    assert.ok((await myPlans(repo, await studentActor(b))).some((p) => p.id === done.planId && p.source === "Curriculum"));
    // Grade 11 Curriculum plan: skills from another grade (the class has none)
    const c11 = await proposePlan(repo, t11, { classId: class11, type: "CURRICULUM", grade: 6 });
    assert.equal(c11.skillGrade, 6);
    assert.ok(c11.skills.length > 0 && c11.notes.some((n) => n.includes("no curriculum yet")));
  });
});
