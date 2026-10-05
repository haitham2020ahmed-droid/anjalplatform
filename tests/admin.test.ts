import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { parseCsv, toCsv } from "../src/imports/csv";
import { resolvePeriod } from "../src/analytics/periods";
import { resolveActor } from "../src/server/auth/actor";
import { verifyPassword } from "../src/server/auth/password";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { loadCalendar } from "../src/server/analytics/calendar";
import { loadSkillItems } from "../src/server/practice/items";
import { parentChildren } from "../src/server/queries/parent";
import { loadBranding } from "../src/server/reports/service";
import { createUser, linkParent, listUsers, moveStudent, setTeacherClasses, unlinkParent, updateUser } from "../src/server/admin/users";
import { archiveClass, createClass, getEngineSettings, listAcademicYears, renameClass, saveAcademicYear, updateBranding, updateEngineSettings, uploadLogo } from "../src/server/admin/settings";
import { archiveQuestion, createDraft, getQuestion, listQuestions, reviewQuestion, reviseQuestion, submitForReview, updateDraft, type EditorInput } from "../src/server/admin/questions";
import { applyRoster, planRoster, rosterTemplateCsv } from "../src/server/admin/roster-import";
import { demoDatabase } from "./helpers/db";

const PNG_1PX = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
const now = new Date("2026-10-04T08:00:00Z");

async function setup() {
  const { repo } = await demoDatabase();
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const admin = await actorFor("demo.admin");
  const teacherA = await actorFor("demo.teacher.4a");
  const teacherB = await actorFor("demo.teacher.4b");
  const classes = await repo.findMany("Class", { schoolId: admin.schoolId! });
  const grades = await repo.findMany("Grade", { schoolId: admin.schoolId! });
  const classOf = (name: string) => String(classes.find((c) => String(c.name).endsWith(name))!.id);
  const g4 = grades.find((g) => Number(g.level) === 4)!;
  const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
  const skill = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.theme" }))!.id);
  return { repo, actorFor, admin, teacherA, teacherB, classOf, skill };
}

// ------------------------------------------------------------------ users

describe("user management", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  before(async () => (ctx = await setup()));

  test("admin creates a student in a class; temporary password works once and must be changed", async () => {
    const { repo, admin, classOf } = ctx;
    const r = await createUser(repo, admin, { role: "STUDENT", username: "S.4099", displayName: "  ليان   أحمد ", studentNumber: "4099", gradeLevel: 4, classId: classOf("4A") }, now);
    const u = (await repo.findUnique("User", { id: r.userId }))!;
    assert.equal(u.username, "s.4099");
    assert.equal(u.displayName, "ليان أحمد");
    assert.equal(u.mustChangePassword, true);
    assert.ok(await verifyPassword(r.temporaryPassword, String(u.passwordHash)));
    assert.ok(!JSON.stringify(await repo.findMany("AuditLog", { action: "user.create" })).includes(r.temporaryPassword), "password never audited");
    const st = (await repo.findUnique("Student", { userId: r.userId }))!;
    assert.equal(await repo.count("ClassMembership", { studentId: st.id, leftAt: null }), 1);
  });

  test("validation: duplicate usernames and student numbers, wrong-grade class, bidi tricks removed", async () => {
    const { repo, admin, classOf } = ctx;
    await assert.rejects(createUser(repo, admin, { role: "STUDENT", username: "s.4099", displayName: "X", studentNumber: "5000", gradeLevel: 4 }), ValidationError);
    await assert.rejects(createUser(repo, admin, { role: "STUDENT", username: "s.5000", displayName: "X", studentNumber: "4099", gradeLevel: 4 }), ValidationError);
    await assert.rejects(createUser(repo, admin, { role: "STUDENT", username: "s.5001", displayName: "X", studentNumber: "5001", gradeLevel: 4, classId: classOf("5A") }), /different grade/);
    await assert.rejects(createUser(repo, admin, { role: "TEACHER", username: "ab", displayName: "X" }), ValidationError);
    const r = await createUser(repo, admin, { role: "TEACHER", username: "t.huda", displayName: "Huda\u202E evil\u0007", title: "Miss" });
    assert.equal((await repo.findUnique("User", { id: r.userId }))!.displayName, "Huda evil");
  });

  test("teachers cannot manage users; SUPER_ADMIN accounts are out of reach", async () => {
    const { repo, teacherA, admin } = ctx;
    await assert.rejects(createUser(repo, teacherA, { role: "STUDENT", username: "s.6000", displayName: "X", studentNumber: "6000", gradeLevel: 4 }), ForbiddenError);
    await assert.rejects(listUsers(repo, teacherA), ForbiddenError);
    const sup = await repo.create("User", { username: "root.super", displayName: "Super", role: "SUPER_ADMIN", schoolId: admin.schoolId, isActive: true });
    await assert.rejects(updateUser(repo, admin, String(sup.id), { isActive: false }), ForbiddenError);
    assert.ok(!(await listUsers(repo, admin, { includeInactive: true })).some((u) => u.username === "root.super"));
  });

  test("deactivation signs the user out everywhere; nobody can deactivate themself", async () => {
    const { repo, admin, actorFor } = ctx;
    const t = await actorFor("t.huda");
    const v0 = Number((await repo.findUnique("User", { id: t.userId }))!.sessionVersion);
    await updateUser(repo, admin, t.userId, { isActive: false }, now);
    const u = (await repo.findUnique("User", { id: t.userId }))!;
    assert.equal(u.isActive, false);
    assert.equal(Number(u.sessionVersion), v0 + 1);
    await assert.rejects(updateUser(repo, admin, admin.userId, { isActive: false }), /your own account/);
    await updateUser(repo, admin, t.userId, { isActive: true }, now);
    assert.equal((await repo.findMany("AuditLog", { action: "user.reactivate", entityId: t.userId })).length, 1);
  });

  test("class moves keep history; moving to another grade's class promotes the student", async () => {
    const { repo, admin, actorFor, classOf } = ctx;
    const s = await actorFor("demo.s1001");
    const st = (await repo.findUnique("Student", { id: s.studentId! }))!;
    await moveStudent(repo, admin, s.userId, classOf("4B"), now);
    const ms = await repo.findMany("ClassMembership", { studentId: st.id });
    assert.equal(ms.filter((m) => m.leftAt === null).length, 1);
    assert.equal(ms.find((m) => m.leftAt === null)!.classId, classOf("4B"));
    assert.ok(ms.some((m) => m.classId === classOf("4A") && m.leftAt !== null), "old membership closed, not deleted");
    await moveStudent(repo, admin, s.userId, classOf("5A"), now);
    const g5 = (await repo.findMany("Grade", { schoolId: admin.schoolId!, level: 5 }))[0];
    assert.equal((await repo.findUnique("Student", { id: st.id }))!.gradeId, g5.id);
    await moveStudent(repo, admin, s.userId, classOf("4A"), now); // back, re-opening the old row
    assert.equal((await repo.findMany("ClassMembership", { studentId: st.id, leftAt: null }))[0].classId, classOf("4A"));
  });

  test("teacher class assignment and parent links take effect for access", async () => {
    const { repo, admin, actorFor, classOf } = ctx;
    const t = await actorFor("t.huda");
    await setTeacherClasses(repo, admin, t.userId, [classOf("4A"), classOf("4B")], now);
    assert.equal((await actorFor("t.huda")).teacherStudentIds!.size > 0, true);
    await setTeacherClasses(repo, admin, t.userId, [classOf("4B")], now);
    const t2 = await actorFor("t.huda");
    const s1 = (await actorFor("demo.s1001")).studentId!;
    assert.ok(!t2.teacherStudentIds!.has(s1));
    const p = await createUser(repo, admin, { role: "PARENT", username: "p.new", displayName: "New Parent" });
    await linkParent(repo, admin, p.userId, (await actorFor("demo.s1001")).userId, "Mother", now);
    assert.deepEqual((await parentChildren(repo, await actorFor("p.new"))).map((c) => c.studentId), [s1]);
    await unlinkParent(repo, admin, p.userId, (await actorFor("demo.s1001")).userId, now);
    assert.deepEqual(await parentChildren(repo, await actorFor("p.new")), []);
  });

  test("user list: roles, classes, children and search", async () => {
    const list = await listUsers(ctx.repo, ctx.admin, { q: "huda" });
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].classes.length, 1);
    const students = await listUsers(ctx.repo, ctx.admin, { role: "STUDENT" });
    assert.ok(students.every((s) => s.role === "STUDENT" && s.studentNumber));
  });
});

// --------------------------------------------------------------- settings

describe("school settings", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  before(async () => (ctx = await setup()));

  test("engine settings: safe ranges enforced, only overrides stored, reset restores defaults", async () => {
    const { repo, admin, teacherA } = ctx;
    await assert.rejects(getEngineSettings(repo, teacherA), ForbiddenError);
    await assert.rejects(updateEngineSettings(repo, admin, { adaptive: { practiceTargetP: 0.99 } }), /between 0.5 and 0.9/);
    await assert.rejects(updateEngineSettings(repo, admin, { adaptive: { topK: 2.5 } }), /whole number/);
    await assert.rejects(updateEngineSettings(repo, admin, { adaptive: { nope: 1 } }), /Unknown setting/);
    await assert.rejects(updateEngineSettings(repo, admin, { mastery: { bands: { beginning: 0, developing: 40, approaching: 30, proficient: 70, mastered: 85 } } }), /strictly increasing/);
    await assert.rejects(updateEngineSettings(repo, admin, { mastery: { weights: { ability: 0.5, recentAccuracy: 0.5, consistency: 0.5 } } }), /sum to 1/);
    const s = await updateEngineSettings(repo, admin, { adaptive: { practiceTargetP: 0.7, topK: 3 } }, now);
    assert.equal(s.adaptive.practiceTargetP, 0.7);
    assert.deepEqual(s.overrides.adaptive, { practiceTargetP: 0.7 }, "a value equal to the default is not stored");
    const r = await updateEngineSettings(repo, admin, { reset: true }, now);
    assert.deepEqual(r.overrides.adaptive, {});
  });

  test("branding: Arabic name and validated logo reach the reports", async () => {
    const { repo, admin, teacherA } = ctx;
    const dir = mkdtempSync(join(tmpdir(), "brand-"));
    await assert.rejects(updateBranding(repo, teacherA, { nameAr: "x" }), ForbiddenError);
    await updateBranding(repo, admin, { nameAr: "مدارس الأنجال الأهلية" }, now);
    await assert.rejects(uploadLogo(repo, admin, new TextEncoder().encode("<html>not an image</html>"), dir), ValidationError);
    const name = await uploadLogo(repo, admin, PNG_1PX, dir, now);
    assert.match(name, /^logo-[0-9a-f]{16}\.png$/);
    assert.ok(existsSync(join(dir, name)));
    const b = await loadBranding(repo, admin.schoolId!, dir);
    assert.equal(b.nameAr, "مدارس الأنجال الأهلية");
    assert.equal(b.logo?.mime, "image/png");
  });

  test("calendar: terms inside the year, no overlaps, one current year; periods follow it", async () => {
    const { repo, admin } = ctx;
    const base = { name: "2027-2028", start: "2027-08-29", end: "2028-06-15", isCurrent: true };
    await assert.rejects(saveAcademicYear(repo, admin, { ...base, terms: [{ name: "Term 1", start: "2027-08-01", end: "2027-11-30" }] }), /inside the academic year/);
    await assert.rejects(saveAcademicYear(repo, admin, { ...base, terms: [{ name: "Term 1", start: "2027-08-29", end: "2027-12-15" }, { name: "Term 2", start: "2027-12-10", end: "2028-03-01" }] }), /overlap/);
    await saveAcademicYear(repo, admin, { ...base, terms: [{ name: "Term 1", start: "2027-08-29", end: "2027-11-25" }, { name: "Term 2", start: "2027-11-28", end: "2028-03-05" }, { name: "Term 3", start: "2028-03-08", end: "2028-06-15" }] }, now);
    const years = await listAcademicYears(repo, admin);
    assert.equal(years.filter((y) => y.isCurrent).length, 1);
    assert.equal(years.find((y) => y.isCurrent)!.terms.length, 3);
    const p = resolvePeriod("TERM", await loadCalendar(repo, admin.schoolId!), new Date("2027-12-01T10:00:00Z"));
    assert.equal(p.label, "Term 2");
  });

  test("classes: create, unique name per year, rename, archive only when empty", async () => {
    const { repo, admin, classOf } = ctx;
    const id = await createClass(repo, admin, { name: "4C", gradeLevel: 4 }, now);
    await assert.rejects(createClass(repo, admin, { name: "4C", gradeLevel: 4 }), /already exists/);
    await assert.rejects(createClass(repo, admin, { name: "<b>", gradeLevel: 4 }), ValidationError);
    await renameClass(repo, admin, id, "4 Cedar", now);
    await archiveClass(repo, admin, id, now);
    await assert.rejects(archiveClass(repo, admin, classOf("4A")), /Move the students/);
  });
});

// -------------------------------------------------------------- questions

const MC = (skillId: string, stem = "What is the theme of the story?"): EditorInput => ({
  skillId, type: "MULTIPLE_CHOICE", stem, level: 4, whyCorrect: "The characters learn that honesty matters.", tip: "Ask what lesson the character learns.",
  options: [
    { label: "A", text: "Honesty matters", correct: true, rationale: null },
    { label: "B", text: "The farm is big", correct: false, rationale: "That is a detail, not a lesson." },
    { label: "C", text: "It rained", correct: false, rationale: "That is the setting." },
  ],
});

describe("question editor workflow", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let lead: Actor;
  before(async () => {
    ctx = await setup();
    lead = { ...ctx.teacherB, extraPermissions: ["questions:publish"] };
  });

  test("teacher drafts a question; invalid items are refused with clear reasons", async () => {
    const { repo, teacherA, skill } = ctx;
    const bad = MC(skill);
    bad.options![1].rationale = null;
    await assert.rejects(createDraft(repo, teacherA, bad), /distractor needs a rationale/);
    await assert.rejects(createDraft(repo, teacherA, { ...MC(skill), options: MC(skill).options!.map((o) => ({ ...o, correct: true })) }), /exactly one correct/);
    const id = await createDraft(repo, teacherA, MC(skill), now);
    const d = await getQuestion(repo, teacherA, id);
    assert.equal(d.status, "DRAFT");
    assert.deepEqual(d.input.options!.map((o) => o.text), ["Honesty matters", "The farm is big", "It rained"]);
    assert.equal(d.input.standardCode !== null, true, "standard defaults to the skill's standard");
  });

  test("drafts are private to their author until review; students never see unpublished items", async () => {
    const { repo, teacherA, teacherB, skill } = ctx;
    const id = await createDraft(repo, teacherA, MC(skill, "Which sentence states the theme?"), now);
    await assert.rejects(updateDraft(repo, teacherB, id, MC(skill, "hijack")), ForbiddenError);
    assert.ok(!(await loadSkillItems(repo, skill)).some((i) => i.questionId === id));
  });

  test("review: no self-approval for teachers; rejection needs a note and notifies the author", async () => {
    const { repo, teacherA, admin, skill } = ctx;
    const mine = await createDraft(repo, lead, MC(skill, "Lead's own question?"), now);
    await submitForReview(repo, lead, mine, now);
    await assert.rejects(reviewQuestion(repo, lead, mine, "approve", null), /Another reviewer/);
    await reviewQuestion(repo, admin, mine, "approve", null, now); // a school admin may approve

    const id = await createDraft(repo, teacherA, MC(skill, "What lesson does Mia learn?"), now);
    await assert.rejects(reviewQuestion(repo, lead, id, "approve", null), /under review/);
    await submitForReview(repo, teacherA, id, now);
    await assert.rejects(reviewQuestion(repo, teacherA, id, "approve", null), ForbiddenError);
    await assert.rejects(reviewQuestion(repo, lead, id, "reject", ""), /Say what needs to change/);
    await reviewQuestion(repo, lead, id, "reject", "Option C is too easy to rule out.", now);
    assert.equal((await getQuestion(repo, teacherA, id)).status, "DRAFT");
    const notes = await repo.findMany("Notification", { userId: teacherA.userId, type: "TEACHER_FEEDBACK" });
    assert.ok(notes.some((n) => n.body === "Option C is too easy to rule out."));
    await updateDraft(repo, teacherA, id, { ...MC(skill, "What lesson does Mia learn?"), level: 5 }, now);
    await submitForReview(repo, teacherA, id, now);
    await reviewQuestion(repo, lead, id, "approve", "Good item.", now);
    assert.equal((await getQuestion(repo, teacherA, id)).status, "PUBLISHED");
    assert.ok((await loadSkillItems(repo, skill)).some((i) => i.questionId === id), "published items reach practice");
    const h = (await getQuestion(repo, teacherA, id)).history.map((x) => x.action);
    assert.deepEqual(h, ["question.create", "question.submit", "question.reject", "question.update", "question.submit", "question.publish"]);
  });

  test("published items are revised, not edited; approving the revision archives the original", async () => {
    const { repo, teacherA, skill } = ctx;
    const { items } = await listQuestions(repo, teacherA, { status: "PUBLISHED", mine: true });
    const orig = items[0].id;
    await assert.rejects(updateDraft(repo, teacherA, orig, MC(skill, "changed")), /Revise/);
    const rev = await reviseQuestion(repo, teacherA, orig, now);
    assert.equal(await reviseQuestion(repo, teacherA, orig, now), rev, "one open revision at a time");
    assert.equal((await getQuestion(repo, teacherA, orig)).status, "PUBLISHED", "original stays live meanwhile");
    await updateDraft(repo, teacherA, rev, MC(skill, "What lesson does Mia learn by the end?"), now);
    await submitForReview(repo, teacherA, rev, now);
    await reviewQuestion(repo, lead, rev, "approve", null, now);
    assert.equal((await getQuestion(repo, teacherA, orig)).status, "ARCHIVED");
    const r = await getQuestion(repo, teacherA, rev);
    assert.equal(r.version, 2);
    assert.equal(r.revisionOf, orig);
  });

  test("other item types round-trip through the editor (matching, ordering, error correction)", async () => {
    const { repo, teacherA, skill } = ctx;
    const base = { skillId: skill, level: 3, whyCorrect: "Because." };
    const inputs: EditorInput[] = [
      { ...base, type: "MATCHING", stem: "Match the words.", pairs: [{ left: "big", right: "large" }, { left: "fast", right: "quick" }, { left: "sad", right: "unhappy" }] },
      { ...base, type: "SENTENCE_ORDER", stem: "Put the events in order.", sequence: ["Mia wakes up.", "She eats breakfast.", "She walks to school."] },
      { ...base, type: "ERROR_CORRECTION", stem: "Find the mistake.", segments: ["She", "go", "to school."], errorIndex: 1, correction: "goes" },
      { ...base, type: "TRUE_FALSE", stem: "The theme is a lesson.", answer: true },
    ];
    for (const i of inputs) {
      const id = await createDraft(repo, teacherA, i, now);
      const back = (await getQuestion(repo, teacherA, id)).input;
      assert.deepEqual([back.pairs, back.sequence, back.segments, back.errorIndex, back.correction, back.answer], [i.pairs, i.sequence, i.segments, i.errorIndex, i.correction, i.answer], i.type);
    }
  });

  test("archiving needs a reason and removes the item from practice", async () => {
    const { repo, admin, teacherA, skill } = ctx;
    const pub = (await listQuestions(repo, admin, { status: "PUBLISHED" })).items[0].id;
    await assert.rejects(archiveQuestion(repo, teacherA, pub, "x"), ForbiddenError);
    await assert.rejects(archiveQuestion(repo, admin, pub, ""), /Reason/);
    await archiveQuestion(repo, admin, pub, "Duplicate of another item.", now);
    assert.ok(!(await loadSkillItems(repo, skill)).some((i) => i.questionId === pub));
  });
});

// --------------------------------------------------------- roster import

describe("roster import", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  before(async () => {
    ctx = await setup();
    // real-style class names (the demo uses "DEMO 4A"), so files can say "4A"
    for (const n of ["4A", "4B", "5A", "5B", "6A", "6B"]) await renameClass(ctx.repo, ctx.admin, ctx.classOf(n), n);
  });
  const file = (rows: string[][]) => new TextEncoder().encode(toCsv(rows));
  const H = ["role", "username", "display_name", "student_number", "grade", "class", "email", "title", "parent_of", "relationship"];

  test("the template itself imports cleanly", async () => {
    const plan = await planRoster(ctx.repo, ctx.admin, "t.csv", new TextEncoder().encode(rosterTemplateCsv()));
    assert.deepEqual(plan.problems, []);
    assert.equal(plan.summary.create, 3);
  });

  test("preview finds every problem, with line and column, and writes nothing", async () => {
    const { repo, admin } = ctx;
    const users0 = await repo.count("User", {});
    const plan = await planRoster(repo, admin, "r.csv", file([
      H,
      ["STUDENT", "s.7001", "Omar", "7001", "4", "4A", "", "", "", ""],
      ["STUDENT", "s.7001", "Omar again", "7002", "4", "4A", "", "", "", ""],
      ["STUDENT", "s.7003", "Sara", "7003", "9", "", "", "", "", ""],
      ["STUDENT", "s.7004", "Nora", "7004", "4", "5A", "", "", "", ""],
      ["PARENT", "p.7001", "Parent", "", "", "", "", "", "9999", ""],
      ["TEACHER", "t.x", "Teacher", "", "", "8Z", "", "", "", ""],
      ["WIZARD", "w.1", "Wizard", "", "", "", "", "", "", ""],
      ["STUDENT", "demo.admin", "Clash", "7005", "4", "", "", "", "", ""],
    ]));
    const at = (line: number, column: string) => plan.problems.some((p) => p.line === line && p.column === column);
    assert.ok(at(3, "username") && at(4, "grade") && at(5, "class") && at(6, "parent_of") && at(7, "class") && at(8, "role") && at(9, "role"), JSON.stringify(plan.problems));
    assert.equal(await repo.count("User", {}), users0);
  });

  test("apply: one transaction creates users, new classes, teacher classes and parent links; passwords returned once", async () => {
    const { repo, admin, actorFor } = ctx;
    const bytes = file([
      H,
      ["STUDENT", "s.8001", "Hessa Saleh", "8001", "4", "4D", "", "", "", ""],
      ["STUDENT", "s.8002", "Faisal Omar", "8002", "4", "4D", "", "", "", ""],
      ["TEACHER", "t.reem", "Reem Nasser", "", "", "4D;4A", "reem@example.edu.sa", "Miss", "", ""],
      ["PARENT", "p.8001", "Saleh Ali", "", "", "", "", "", "8001;8002", "father"],
    ]);
    const plan = await planRoster(repo, admin, "r.csv", bytes);
    assert.deepEqual(plan.problems, []);
    assert.deepEqual(plan.newClasses, [{ name: "4D", grade: 4 }]);
    await assert.rejects(applyRoster(repo, admin, "r.csv", bytes, "0".repeat(64)), /not the file you previewed/);
    const res = await applyRoster(repo, admin, "r.csv", bytes, plan.sha256, now);
    assert.deepEqual([res.created, res.updated, res.classesCreated, res.links], [4, 0, 1, 2]);
    const creds = parseCsv(res.credentialsCsv);
    assert.equal(creds.length, 5);
    const reem = creds.find((r) => r[0] === "t.reem")!;
    assert.ok(await verifyPassword(reem[3], String((await repo.findUnique("User", { username: "t.reem" }))!.passwordHash)));
    const parent = await actorFor("p.8001");
    assert.equal((await parentChildren(repo, parent)).length, 2);
    const t = await actorFor("t.reem");
    assert.equal(t.teacherStudentIds!.has((await actorFor("s.8001")).studentId!), true);
    const audits = await repo.findMany("AuditLog", { action: "roster.import" });
    assert.ok(!JSON.stringify(audits).includes(reem[3]));

    // same file again: updates only, no new passwords
    const again = await applyRoster(repo, admin, "r.csv", bytes, plan.sha256, now);
    assert.deepEqual([again.created, again.updated], [0, 4]);
    assert.equal(parseCsv(again.credentialsCsv).length, 1);
  });

  test("a file with problems is never applied, even with the right hash; nothing is written", async () => {
    const { repo, admin } = ctx;
    const bytes = file([H, ["STUDENT", "s.9001", "Good Row", "9001", "4", "4A", "", "", "", ""], ["STUDENT", "s.9002", "Bad Row", "9002", "9", "", "", "", "", ""]]);
    const plan = await planRoster(repo, admin, "bad.csv", bytes);
    assert.equal(plan.problems.length, 1);
    const users0 = await repo.count("User", {});
    await assert.rejects(applyRoster(repo, admin, "bad.csv", bytes, plan.sha256), /still has 1 problem/);
    assert.equal(await repo.count("User", {}), users0, "the valid row was not imported either");
  });

  test("teachers cannot import rosters", async () => {
    await assert.rejects(planRoster(ctx.repo, ctx.teacherA, "t.csv", new TextEncoder().encode(rosterTemplateCsv())), ForbiddenError);
  });
});
