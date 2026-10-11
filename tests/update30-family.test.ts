import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { approvedForFamily, createFamilyReport, familyReport, pendingApprovals, pendingCount, reviewFamilyReport, saveFamilyReport, staffFamilyReports, submitFamilyReport, withdrawFamilyReport } from "../src/server/reports/family-reports";
import { contentFromForm } from "../src/components/reports/family-report-view";
import { isReportShared, shareParentReport } from "../src/server/insights/parent-report";
import { demoDatabase } from "./helpers/db";

describe("👪 Family reports: the teacher prepares, the admin approves, the family sees", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let parent: Actor; let student: Actor; let sid: string; let parentUser: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); teacher = await as("test.teacher.1"); other = await as("test.teacher.3");
    sid = (await teacherRoster(repo, teacher))[0].students[0].id;
    await repo.create("MapResult", { studentId: sid, testDate: new Date("2026-09-15"), subject: "Reading", goalName: null, rit: 196, achievementPercentile: 40, projectedGrowth: 8, termName: "Fall 2026", importedAt: new Date() });
    const pu = await repo.create("User", { username: "test.parent.fr", displayName: "Test Parent", role: "PARENT", schoolId: admin.schoolId, isActive: true });
    const p = await repo.create("Parent", { userId: pu.id });
    await repo.create("ParentStudent", { parentId: p.id, studentId: sid, relationship: "mother" });
    parent = await resolveActor(repo, pu); parentUser = String(pu.id);
    const st = await repo.findUnique("Student", { id: sid });
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st!.userId }))!);
  });

  test("the platform prepares a report from the student's data (MAP, practice, next steps, help at home)", async () => {
    const id = await createFamilyReport(repo, teacher, { studentId: sid, kind: "AUTO" });
    const r = await familyReport(repo, teacher, id);
    assert.equal(r.status, "DRAFT");
    const heads = r.content.sections.map((x) => x.heading);
    assert.ok(heads.includes("MAP Growth") && heads.includes("Practice on the platform") && heads.includes("How to help at home"), heads.join(","));
    assert.match(r.content.sections.find((x) => x.heading === "MAP Growth")!.lines[0], /RIT 196, percentile 40 · Spring goal 204/);
    await assert.rejects(createFamilyReport(repo, other, { studentId: sid, kind: "AUTO" }), ForbiddenError, "not their student");
  });

  test("written by hand → sent → the admin is notified; nothing reaches the family before approval", async () => {
    const id = await createFamilyReport(repo, teacher, { studentId: sid, kind: "MANUAL" });
    await assert.rejects(submitFamilyReport(repo, teacher, id), /Write the report first/);
    const f = new FormData();
    f.set("sections", "2"); f.set("title", "A note"); f.set("summary", "Sam worked very hard this month and reads every day.");
    f.set("icon0", "⭐"); f.set("heading0", "Strengths"); f.set("lines0", "Finds the main idea\n\nUses text evidence");
    f.set("icon1", "📌"); f.set("heading1", ""); f.set("lines1", "");
    f.set("message", "Thank you for your support!");
    await saveFamilyReport(repo, teacher, id, contentFromForm(f));
    const saved = await familyReport(repo, teacher, id);
    assert.deepEqual(saved.content.sections, [{ heading: "Strengths", icon: "⭐", lines: ["Finds the main idea", "Uses text evidence"] }], "empty lines and sections dropped");
    assert.equal(await submitFamilyReport(repo, teacher, id), "PENDING");
    assert.equal(await pendingCount(repo, String(admin.schoolId)), 1);
    assert.ok((await repo.findMany("Notification", { userId: admin.userId })).some((n) => n.type === "REPORT_APPROVAL" && String(n.link).endsWith(id)));
    await assert.rejects(familyReport(repo, parent, id), ForbiddenError);
    assert.equal((await approvedForFamily(repo, parent, sid)).length, 0);
    await assert.rejects(saveFamilyReport(repo, teacher, id, { content: saved.content }), /waiting for approval/);
    await assert.rejects(reviewFamilyReport(repo, teacher, id, { approve: true }), ForbiddenError, "teachers cannot approve");
    // take back, then send again
    await withdrawFamilyReport(repo, teacher, id);
    assert.equal((await familyReport(repo, teacher, id)).status, "DRAFT");
    await submitFamilyReport(repo, teacher, id);
  });

  test("returned with a note → the teacher fixes it → approved: the student and the parent are notified and see it", async () => {
    const [p] = await pendingApprovals(repo, admin);
    await assert.rejects(reviewFamilyReport(repo, admin, p.id, { approve: false }), /Write a note/);
    await reviewFamilyReport(repo, admin, p.id, { approve: false, note: "Please add one next step." });
    const back = await familyReport(repo, teacher, p.id);
    assert.deepEqual([back.status, back.reviewNote], ["RETURNED", "Please add one next step."]);
    assert.ok((await repo.findMany("Notification", { userId: teacher.userId })).some((n) => String(n.title).includes("returned")));
    await saveFamilyReport(repo, teacher, p.id, { content: { ...back.content, sections: [...back.content.sections, { heading: "Next steps", icon: "🎯", lines: ["Read 15 minutes a day"] }] } });
    await submitFamilyReport(repo, teacher, p.id);
    await reviewFamilyReport(repo, admin, p.id, { approve: true });
    const list = await approvedForFamily(repo, parent, sid);
    assert.equal(list.length, 1);
    assert.ok((await repo.findMany("Notification", { userId: parentUser })).some((n) => String(n.link) === `/family-report/${p.id}`));
    const seen = await familyReport(repo, parent, p.id);
    assert.equal(seen.status, "APPROVED");
    assert.ok((await familyReport(repo, teacher, p.id)).seenByParentAt, "the teacher sees the parent read it");
    assert.equal((await approvedForFamily(repo, student, sid)).length, 1);
    await assert.rejects(approvedForFamily(repo, parent, (await teacherRoster(repo, teacher))[0].students[1].id), ForbiddenError, "not another child");
  });

  test("a teacher's “share the progress report” also waits for the admin; an admin shares at once", async () => {
    assert.equal(await shareParentReport(repo, teacher, sid, true, "Well done!"), "PENDING");
    assert.equal(await isReportShared(repo, String(admin.schoolId), sid), false);
    const p = (await pendingApprovals(repo, admin)).find((x) => x.kind === "PROGRESS")!;
    assert.equal(p.content.message, "Well done!");
    await reviewFamilyReport(repo, admin, p.id, { approve: true });
    assert.equal(await isReportShared(repo, String(admin.schoolId), sid), true);
    assert.equal(await shareParentReport(repo, teacher, sid, false, null), "STOPPED", "stopping is immediate");
    assert.equal(await shareParentReport(repo, admin, sid, true, null), "SHARED");
    assert.ok((await staffFamilyReports(repo, teacher)).length >= 2);
  });
});
