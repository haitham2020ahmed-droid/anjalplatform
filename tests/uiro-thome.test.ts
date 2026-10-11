/**
 * UI reorg Phase 3 — Teacher Home (acceptance, in-memory Test School; fictional students only):
 *  - class selector (the page shows the chosen class only); "Hello, … — Grade X · N students"
 *  - Add Student (username only → password = username, own class only), Upload Roster (template, preview, row errors,
 *    all-or-nothing save), Download Accounts (Excel + login cards; password shown only when it IS the username)
 *  - Find a skill and assign it (one result per skill family, grade tags, assign any grade to the own class)
 *  - Needs your attention (≤ 3 cards: not started, tests with new results, suggested for RTI)
 *  - ONE student profile page with everything; another teacher's student refused (typed URL = direct server call)
 *  - teacher menu = My Class / Programs / Resources, nothing lost
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { DEFAULT_AUTH } from "../src/server/auth/config";
import { login } from "../src/server/auth/login";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readXlsx } from "../src/imports/xlsx";
import { accountsXlsx, addClassStudent, applyClassRoster, classAccounts, classRosterTemplateCsv, classRosterTemplateXlsx, planClassRoster, resetToUsername, PASSWORD_HIDDEN } from "../src/server/teacher/class-accounts";
import { attentionList, findSkillFamilies, teacherHomeData } from "../src/server/teacher/home";
import { teacherStudentData } from "../src/server/teacher/page-data";
import { studentProfileExtras } from "../src/server/teacher/student-profile";
import { assignSkill, teacherRoster } from "../src/server/teacher/assign";
import { assignTest, previewTest, builderSkills } from "../src/server/tests/assessments";
import { myWorkItems } from "../src/server/plans/wizard";
import { navItemsFor } from "../src/components/nav-items";
import { TOUR_STEPS } from "../src/components/ui-kit/first-login-tour";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const csv = (rows: string[][]) => new TextEncoder().encode(rows.map((r) => r.join(",")).join("\n"));

describe("UI reorg Phase 3: Teacher Home, accounts, find-a-skill, attention, one student profile", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, admin: Actor;
  let classId: string, otherClassId: string, secondClassId: string;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const now = new Date();

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [teacher, otherTeacher, admin] = await Promise.all(["test.teacher.1", "test.teacher.3", "test.admin"].map(actorFor));
    classId = (await teacherRoster(repo, teacher))[0].id;
    otherClassId = (await teacherRoster(repo, otherTeacher))[0].id;
    // test.teacher.1 also teaches a second class (the class selector)
    const t1 = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    secondClassId = (await teacherRoster(repo, await actorFor("test.teacher.2")))[0].id;
    await repo.create("ClassTeacher", { classId: secondClassId, teacherId: t1.id });
    teacher = await actorFor("test.teacher.1");
  });

  test("class selector: the home shows the chosen class only; Hello line data; a class of another teacher refused", async () => {
    const h = await teacherHomeData(repo, teacher, null, now);
    assert.equal(h.classes.length, 2, "two classes in the selector");
    assert.ok(h.klass && h.klass.grade > 0 && h.klass.students > 0);
    const h2 = await teacherHomeData(repo, teacher, secondClassId, now);
    assert.equal(h2.klass!.id, secondClassId);
    const ids2 = new Set((await repo.findMany("ClassMembership", { classId: secondClassId, leftAt: null })).map((m) => String(m.studentId)));
    assert.ok(h2.students.length > 0 && h2.students.every((s) => ids2.has(s.id)), "students of the selected class only");
    assert.equal(h2.klass!.students, ids2.size);
    await assert.rejects(teacherHomeData(repo, teacher, otherClassId, now), ForbiddenError);
  });

  test("Add Student: username only → password = username (even with the school setting off); own class only", async () => {
    const r = await addClassStudent(repo, teacher, { classId, username: "New.Kid1" });
    assert.equal(r.username, "new.kid1");
    assert.equal(r.password, "new.kid1");
    const u = (await repo.findUnique("User", { username: "new.kid1" }))!;
    assert.equal(Boolean(u.mustChangePassword), false);
    const ok = await login(repo, { username: "new.kid1", password: "new.kid1", ip: "203.0.113.7" }, DEFAULT_AUTH);
    assert.equal(ok.ok, true, "the new student signs in with username = password");
    const st = (await repo.findUnique("Student", { userId: u.id }))!;
    assert.equal((await repo.findMany("ClassMembership", { classId, studentId: st.id, leftAt: null })).length, 1, "placed in the teacher's class");
    await assert.rejects(addClassStudent(repo, teacher, { classId, username: "new.kid1" }), /already taken/);
    await assert.rejects(addClassStudent(repo, teacher, { classId: otherClassId, username: "sneaky.kid" }), ForbiddenError, "not into another teacher's class");
    await assert.rejects(addClassStudent(repo, await actorFor("test.student.005"), { classId, username: "x.kid" }), ForbiddenError);
    const viaAdmin = await addClassStudent(repo, admin, { classId: otherClassId, username: "admin.added", name: "Admin Added" });
    assert.equal(viaAdmin.name, "Admin Added");
  });

  test("Upload Roster: template, preview with row errors (duplicates, missing fields, taken), nothing saved until fixed", async () => {
    assert.match(classRosterTemplateCsv(), /^\ufeff?Student Name,Username/);
    assert.deepEqual(readXlsx(Buffer.from(classRosterTemplateXlsx()))[0], ["Student Name", "Username"]);
    const bad = csv([["Student Name", "Username"], ["Roster One", "roster.one"], ["Roster Two", "roster.one"], ["", "roster.three"], ["Roster Four", ""], ["Roster Five", "new.kid1"], ["Roster Six", "roster.six"]]);
    const p = await planClassRoster(repo, teacher, classId, "class.csv", bad);
    const lines = (col: string) => p.problems.filter((x) => x.column === col).map((x) => x.line).sort();
    assert.deepEqual(lines("Username"), [3, 5, 6], "duplicate (line 3), missing (5), taken (6)");
    assert.deepEqual(lines("Student Name"), [4], "missing name");
    assert.deepEqual(p.lines.map((l) => l.username), ["roster.one", "roster.six"]);
    assert.ok(p.lines.every((l) => l.password === l.username), "preview: password = username");
    const before = await repo.count("User", { role: "STUDENT" });
    await assert.rejects(applyClassRoster(repo, teacher, classId, "class.csv", bad, p.sha256), /Fix the 4 row error/);
    assert.equal(await repo.count("User", { role: "STUDENT" }), before, "nothing saved");
    const good = csv([["Student Name", "Username"], ["Roster One", "roster.one"], ["Roster Six", "roster.six"]]);
    const p2 = await planClassRoster(repo, teacher, classId, "class.csv", good);
    assert.equal(p2.problems.length, 0);
    await assert.rejects(applyClassRoster(repo, teacher, classId, "class.csv", good, p.sha256), /changed since the preview/);
    await assert.rejects(planClassRoster(repo, teacher, otherClassId, "class.csv", good), ForbiddenError, "only into the teacher's own class");
    const r = await applyClassRoster(repo, teacher, classId, "class.csv", good, p2.sha256);
    assert.equal(r.created, 2);
    assert.equal((await login(repo, { username: "roster.six", password: "roster.six", ip: "203.0.113.8" }, DEFAULT_AUTH)).ok, true);
  });

  test("Download Accounts: Excel Student Name | Username | Password; password only when it IS the username; own classes only", async () => {
    const a = await classAccounts(repo, teacher, classId);
    const kid = a.rows.find((r) => r.username === "new.kid1")!;
    assert.equal(kid.password, "new.kid1");
    const seeded = a.rows.find((r) => r.username.startsWith("test.student."))!;
    assert.equal(seeded.password, null, "a password that is not the username is never shown");
    const sheet = readXlsx(Buffer.from(accountsXlsx(a)));
    assert.deepEqual(sheet[0], ["Student Name", "Username", "Password"]);
    assert.ok(sheet.some((r) => r[1] === "new.kid1" && r[2] === "new.kid1"));
    assert.ok(sheet.some((r) => r[1] === seeded.username && r[2] === PASSWORD_HIDDEN));
    // login cards use the same rows (teacher-scoped); another teacher / a student cannot read them
    await assert.rejects(classAccounts(repo, otherTeacher, classId), ForbiddenError);
    await assert.rejects(classAccounts(repo, await actorFor("test.student.005"), classId), ForbiddenError);
    assert.ok((await classAccounts(repo, admin, classId)).rows.length === a.rows.length, "the admin can too");
    // reset to username: own students only
    await resetToUsername(repo, teacher, classId, seeded.studentId);
    assert.equal((await classAccounts(repo, teacher, classId)).rows.find((r) => r.studentId === seeded.studentId)!.password, seeded.username);
    const otherKid = String((await repo.findMany("ClassMembership", { classId: otherClassId, leftAt: null }))[0].studentId);
    await assert.rejects(resetToUsername(repo, teacher, classId, otherKid), ForbiddenError);
    await assert.rejects(resetToUsername(repo, teacher, otherClassId, otherKid), ForbiddenError);
  });

  test("Find a skill: one result per skill family (grade tags), Assign any grade's skill to the own class → My Work", async () => {
    const fams = await findSkillFamilies(repo, teacher, "main idea", 4);
    assert.ok(fams.length > 0, "found");
    const keys = fams.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, "no family twice");
    const names = fams.map((f) => f.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, "a skill name is not repeated per grade");
    const multi = fams.find((f) => f.grades.length > 1);
    assert.ok(multi, "a skill taught in several grades is ONE result with grade tags");
    // the pick is the class's grade when it has one
    if (multi!.grades.includes(4)) assert.equal(multi!.pick.grade, 4);
    const other = multi!.skills.find((k) => k.grade !== 4 && k.questions > 0) ?? multi!.skills.find((k) => k.grade !== 4)!;
    const kid = (await repo.findUnique("User", { username: "roster.one" }))!;
    const st = (await repo.findUnique("Student", { userId: kid.id }))!;
    await assignSkill(repo, teacher, { classId, skillId: other.id, studentIds: [String(st.id)] });
    const work = await myWorkItems(repo, await resolveActor(repo, kid));
    assert.ok(work.some((w) => w.skillId === other.id), "the other grade's skill is in the student's My Work");
    await assert.rejects(assignSkill(repo, teacher, { classId: otherClassId, skillId: other.id }), ForbiddenError);
    await assert.rejects(findSkillFamilies(repo, await actorFor("test.student.005"), "main idea", 4), ForbiddenError);
  });

  test("Needs your attention: ≤ 3 cards (not started, tests with new results, RTI) and the lists they open", async () => {
    const members = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
    // work assigned 3 days ago and not started
    const k = (await builderSkills(repo, teacher, { filter: "READING", grade: 4 }))[0];
    const a = await assignSkill(repo, teacher, { classId, skillId: k.id }, new Date(now.getTime() - 3 * 86_400_000));
    await repo.updateMany("Assignment", { id: a.assignmentId }, { createdAt: new Date(now.getTime() - 3 * 86_400_000) });
    // a test with a fresh result
    const p = await previewTest(repo, teacher, { skills: [{ skillId: k.id, count: 2 }], levelMode: "SAME" });
    const tst = await assignTest(repo, teacher, { classId, type: "WEEKLY_QUIZ", title: "Quiz A", levelMode: "SAME", questions: { SAME: p.versions.SAME!.map((q) => q.id) } });
    const set = (await repo.findMany("Assignment", { testId: tst.testId }))[0];
    await repo.updateMany("AssignmentStudent", { assignmentId: set.id, studentId: members[0] }, { status: "COMPLETED", completedAt: now, progress: 1 });
    // a student suggested for RTI
    await repo.create("StudentTier", { studentId: members[1], schoolId: teacher.schoolId, tier: 2, source: "AUTO", reason: "Low accuracy for 3 weeks", since: now, updatedAt: now });
    const h = await teacherHomeData(repo, teacher, classId, now);
    assert.ok(h.attention.length <= 3);
    assert.deepEqual(h.attention.map((c) => c.kind).sort(), ["not-started", "rti", "tests"]);
    const ns = h.attention.find((c) => c.kind === "not-started")!;
    assert.ok(ns.count >= members.length - 1, "almost the whole class has not started");
    assert.equal(h.attention.find((c) => c.kind === "tests")!.href, `/teacher/assessments/${tst.testId}`);
    const rti = await attentionList(repo, teacher, classId, "rti", now);
    assert.deepEqual(rti.rows.map((r) => r.studentId), [members[1]]);
    const list = await attentionList(repo, teacher, classId, "not-started", now);
    assert.equal(list.rows.length, ns.count);
    await assert.rejects(attentionList(repo, otherTeacher, classId, "rti", now), ForbiddenError);
  });

  test("ONE student profile: My Work, plans, tests, MAP, mastered/needed, correct/incorrect, time, reports; other teacher refused", async () => {
    const sid = String((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    const v = await teacherStudentData(repo, teacher, sid);
    assert.ok(v.extras.work.items.length >= 1, "My Work progress");
    assert.ok(v.extras.tests.completed.length + v.extras.tests.toDo.length >= 1, "tests & scores");
    assert.ok("reading" in v.extras.map && "language" in v.extras.map, "MAP results");
    assert.equal(v.extras.answers.incorrect, v.extras.answers.total - v.extras.answers.correct);
    assert.ok(typeof v.extras.time.totalMinutes === "number");
    assert.ok(Array.isArray(v.d.skills) && Array.isArray(v.extras.plans) && Array.isArray(v.reports));
    // typed URL for another teacher's student → refused; the admin sees all
    await assert.rejects(teacherStudentData(repo, otherTeacher, sid), ForbiddenError);
    await assert.rejects(studentProfileExtras(repo, otherTeacher, sid), ForbiddenError);
    assert.ok((await studentProfileExtras(repo, admin, sid)).work.items.length >= 1);
    const page = readFileSync(join(process.cwd(), "src/app/teacher/students/[studentId]/page.tsx"), "utf8");
    for (const id of ["overview", "work", "plans", "tests", "map", "skills", "reports"]) assert.ok(page.includes(`id="${id}"`), `section ${id}`);
  });

  test("every student name on the teacher pages opens the ONE profile page", () => {
    const files = ["map-center/reports-tab.tsx", "map-center/results-tab.tsx", "map-test/page.tsx", "progress/page.tsx", "respond/[id]/page.tsx", "alerts/page.tsx", "tiers/page.tsx", "rti-plan/weekly/page.tsx", "attention/page.tsx", "accounts/page.tsx"];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), "src/app/teacher", f), "utf8");
      assert.ok(src.includes("/teacher/students/${"), `${f} links names to the profile`);
    }
    assert.ok(!readFileSync(join(process.cwd(), "src/app/teacher/page.tsx"), "utf8").includes("/admin/student-file/"), "home");
    assert.ok(readFileSync(join(process.cwd(), "src/server/search.ts"), "utf8").includes("href: `/teacher/students/${s.id}`"), "search");
  });

  test("teacher menu: short (Programs + More); Assessments added; tour targets; strings translated", () => {
    const items = navItemsFor("TEACHER");
    const groups = [...new Set(items.map((i) => i.group).filter(Boolean))];
    assert.deepEqual(groups, ["Programs", "More"]);
    const hrefs = new Set(items.map((i) => i.href));
    for (const h of ["/teacher/students", "/teacher/plans", "/teacher/assessments", "/teacher/map-center", "/admin/curriculum-map", "/teacher/rti-plan", "/admin/grammar", "/teacher/reports"]) assert.ok(hrefs.has(h), h);
    // the school asked: no Question Bank entry for teachers (they assign skills from Find a skill, Plans and Assessments)
    assert.ok(!hrefs.has("/admin/questions") && !items.some((i) => i.label === "Question Bank"), "no Question Bank in the teacher menu");
    // pages that left the menu are checked in tests/uiro-shell.test.ts (MOVED / OUT) and tests/menus.test.ts
    assert.equal(new Set(items.map((i) => i.icon)).size, items.length, "one icon per entry");
    const home = readFileSync(join(process.cwd(), "src/app/teacher/page.tsx"), "utf8");
    for (const tour of ["students", "plans", "assessments"]) assert.ok(home.includes(`tour="${tour}"`), tour);
    const en = readFileSync(join(process.cwd(), "src/i18n/en.ts"), "utf8");
    assert.ok(en.includes("// ---- teacher home (wave 2)"));
    for (const s of ["Upload Roster", "Download Accounts", "Find a skill and assign it", "Needs your attention", "Add Student", "Hello, {name}"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(s), s);
      assert.ok(ar[s as keyof typeof ar] && ar[s as keyof typeof ar] !== s, `${s} has Arabic`);
    }
    assert.ok(!/lexile/i.test(home), "no Lexile wording on the home");
    assert.ok(!home.includes("Question Bank") && !home.includes("/admin/questions"), "no Question Bank tile on the Teacher Home");
    assert.ok(!TOUR_STEPS.TEACHER.some((s) => /Question Bank/.test(`${s.title} ${s.text}`)), "nor in the teacher's tour");
  });
});
