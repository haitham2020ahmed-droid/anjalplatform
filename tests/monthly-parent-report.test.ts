/**
 * 📅 The monthly parent report (owner r67 point 16) — demo school in memory, never a real database:
 *   written automatically at month end per student (skills mastered, effort, reading, next steps; positive; English
 *   AND Arabic; no level words) → the TEACHER reviews it and adds a note → the ADMIN approves → only then the student
 *   and the family see it. The same family reports and approval flow (no second system); idempotent.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { approvedForFamily, contentIn, familyReport, reviewFamilyReport, saveFamilyReport, staffFamilyReports, submitFamilyReport, type FamilyContent } from "../src/server/reports/family-reports";
import { generateMonthlyReports, monthlyContent, monthToReport, MONTHLY, prepareMonthlyReports } from "../src/server/reports/monthly-report";
import { hasLevelWords } from "../src/server/reports/family-words";

const s = (v: unknown) => String(v ?? "");
const NOW = new Date(Date.UTC(2026, 10, 3, 8)); // 3 November: October's reports
const OCT = (d: number) => new Date(Date.UTC(2026, 9, d, 9));

describe("📅 monthly report: the content (pure)", () => {
  test("the month: in the first 7 days the month that ended, else this month", () => {
    assert.equal(monthToReport(NOW).key, "2026-10");
    assert.equal(monthToReport(new Date(Date.UTC(2027, 0, 2))).key, "2026-12", "January → December of the year before");
    assert.equal(monthToReport(new Date(Date.UTC(2026, 10, 20))).key, "2026-11");
  });

  test("positive, English and Arabic, never a level word", () => {
    const c = monthlyContent({ name: "Sara Ahmed", mastered: ["Theme", "Context Clues"], days: 9, minutes: 140, answers: 210, accuracy: 82, articles: ["Desert Life"], fluencyReadings: 2, next: ["Main Idea"] });
    assert.equal(c.summary, "Sara had a great month: 2 new skills mastered and 9 days of practice. Well done!");
    assert.deepEqual(c.sections.map((x) => x.heading), ["Skills mastered this month", "Effort", "Reading", "Next steps", "How to help at home"]);
    assert.deepEqual(c.sections[0].lines, ["Theme", "Context Clues"]);
    assert.equal(c.message, "", "the teacher writes the note");
    assert.ok(c.ar && /[؀-ۿ]/.test(c.ar.summary) && c.ar.summary.includes("Sara"), "the Arabic copy");
    assert.equal(c.ar!.sections.length, c.sections.length);
    for (const l of [c.summary, ...c.sections.flatMap((x) => x.lines)]) assert.ok(!hasLevelWords(l), l);
    const quiet = monthlyContent({ name: "Omar", mastered: [], days: 0, minutes: 0, answers: 0, accuracy: null, articles: [], fluencyReadings: 0, next: [] });
    assert.match(quiet.summary, /fresh start/, "never negative");
    assert.deepEqual(contentIn(c, "ar").sections.map((x) => x.heading), c.ar!.sections.map((x) => x.heading));
    assert.equal(contentIn(c, "en"), c);
  });
});

describe("📅 monthly report: teacher review → admin approval → visible", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let student: Actor; let parent: Actor | null = null;
  let classId = ""; let sid = ""; let reportId = "";
  before(async () => {
    ({ repo } = await demoDatabase());
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("demo.admin"); teacher = await as("demo.teacher.4a"); other = await as("demo.teacher.5a");
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    sid = s((await repo.findMany("ClassMembership", { classId }))[0].studentId);
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const link = (await repo.findMany("ParentStudent", { studentId: sid }))[0];
    if (link) parent = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Parent", { id: link.parentId }))!.userId }))!);
    // October: one skill mastered and some practice
    const skill = (await repo.findMany("Skill", {}, { take: 1 }))[0];
    await repo.create("StudentSkillMastery", { studentId: sid, skillId: skill.id, score: 95, attempts: 20, correct: 19, isMastered: true, masteredAt: OCT(12), updatedAt: OCT(12) });
    await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", skillId: skill.id, startedAt: OCT(12), activeMs: 25 * 60_000 });
  });

  test("month end: a DRAFT per student, written by the platform for the class's teacher; never twice", async () => {
    assert.equal(await generateMonthlyReports(repo, admin.schoolId!, new Date(Date.UTC(2026, 10, 15))), 0, "only in the first days of a month");
    const n = await generateMonthlyReports(repo, admin.schoolId!, NOW);
    assert.ok(n >= 3, `${n} drafts`);
    const mine = (await repo.findMany("FamilyReport", { studentId: sid, kind: MONTHLY }));
    assert.equal(mine.length, 1);
    const r = mine[0];
    assert.deepEqual([s(r.status), s(r.refId), s(r.createdById)], ["DRAFT", "2026-10", teacher.userId]);
    reportId = s(r.id);
    const c = (typeof r.content === "string" ? JSON.parse(r.content) : r.content) as FamilyContent;
    assert.ok(c.sections[0].lines.length >= 1 && c.ar, "skills mastered + the Arabic copy");
    assert.ok((await repo.findMany("Notification", { userId: teacher.userId, type: "REPORT_APPROVAL" })).some((x) => /Monthly family reports/.test(s(x.title))), "the teacher is told once per class");
    assert.equal(await generateMonthlyReports(repo, admin.schoolId!, NOW), 0, "idempotent");
    assert.equal(await prepareMonthlyReports(repo, teacher, classId, NOW), 0, "the teacher's button makes no second copy");
    await assert.rejects(prepareMonthlyReports(repo, other, classId, NOW), ForbiddenError, "another teacher's class");
    assert.ok((await staffFamilyReports(repo, teacher, { status: "DRAFT" })).some((x) => x.id === reportId && x.kind === "MONTHLY"), "in the teacher's Family Reports");
  });

  test("not visible before approval; the teacher must add a note", async () => {
    assert.deepEqual((await approvedForFamily(repo, student, sid)).map((x) => x.id), []);
    await assert.rejects(familyReport(repo, student, reportId), ForbiddenError);
    await assert.rejects(submitFamilyReport(repo, teacher, reportId, NOW), ValidationError, "no note yet");
    const r = await familyReport(repo, teacher, reportId);
    await saveFamilyReport(repo, teacher, reportId, { title: r.title, content: { summary: r.content.summary, sections: r.content.sections, message: "Great effort this month — keep reading every evening!" } }, NOW);
    const saved = await familyReport(repo, teacher, reportId);
    assert.ok(saved.content.ar, "the Arabic copy is kept while the platform's text is unchanged");
    assert.equal(await submitFamilyReport(repo, teacher, reportId, NOW), "PENDING");
    assert.ok((await repo.findMany("Notification", { userId: admin.userId, type: "REPORT_APPROVAL" })).some((x) => s(x.link) === `/admin/report-approvals/${reportId}`), "the admin is asked to approve");
    assert.deepEqual((await approvedForFamily(repo, student, sid)).map((x) => x.id), [], "waiting: still not visible");
    await assert.rejects(reviewFamilyReport(repo, teacher, reportId, { approve: true }, NOW), ForbiddenError, "only the admin approves");
  });

  test("the admin approves → the student and the family see it (in their language)", async () => {
    await reviewFamilyReport(repo, admin, reportId, { approve: true }, NOW);
    const seen = await approvedForFamily(repo, student, sid);
    assert.deepEqual(seen.map((x) => x.id), [reportId]);
    assert.equal(seen[0].content.message, "Great effort this month — keep reading every evening!");
    assert.ok(/[؀-ۿ]/.test(contentIn(seen[0].content, "ar").summary), "Arabic for an Arabic reader");
    assert.equal((await familyReport(repo, student, reportId, NOW)).status, "APPROVED");
    if (parent) assert.deepEqual((await approvedForFamily(repo, parent, sid)).map((x) => x.id), [reportId]);
    assert.ok((await repo.findMany("Notification", { userId: student.userId })).some((x) => s(x.link) === `/family-report/${reportId}`), "the student is told");
  });
});
