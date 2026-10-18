/**
 * MAP Family Report — per-student Send and Edit (owner: the ELA lead could only view/print this report, never send
 * just one student's, and nothing about it was editable).
 *   - Send: the Reports hub already has "Send to family" / "Send to every family" for any report whose catalogue
 *     entry says `send: true` (src/components/teacher/report-bar.tsx) — the MAP family report now opts in, reusing
 *     the same share → admin-approval → notify flow the general Family Reports already use (shareParentReport),
 *     per student AND for the whole class.
 *   - Edit: a teacher's own note, saved before Send, read with the report by the family (and never printed as the
 *     teacher's own editor, only as "A note from your teacher").
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { familyReport, saveMapFamilyNote } from "../src/server/map/map-reports";
import { isReportShared, shareParentReport } from "../src/server/insights/parent-report";
import { matchReport, REPORTS } from "../src/components/teacher/report-catalog";
import { demoDatabase } from "./helpers/db";

describe("MAP Family Report: per-student Send (via the Reports hub) and Edit (a note before sending)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let otherTeacher: Actor; let classId = ""; let studentId = "";
  const now = new Date(Date.UTC(2026, 9, 9));
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.3" }))!);
    const t = (await repo.findMany("Teacher", { userId: teacher.userId }))[0];
    classId = String((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    const members = await repo.findMany("ClassMembership", { classId, leftAt: null });
    studentId = String(members[0].studentId);
    const st = await repo.findUnique("Student", { id: studentId });
    const H = [...MAP_TEMPLATE_HEADERS], c = (h: string) => H.indexOf(h);
    const row = H.map(() => ""); row[0] = String(st!.studentNumber); row[c("Reading Fall RIT")] = "195"; row[c("Reading Spring Projection")] = "204";
    await importMapScores(repo, admin, [H, row], 2026, now, { term: { name: "Fall 2026", date: now } });
  });

  test("the catalogue offers Send on the MAP family report, per student and per class", () => {
    const def = REPORTS.find((r) => r.key === "map-family")!;
    assert.equal(def.send, true, "the Reports hub draws its Send to family / Send to every family buttons from this flag");
    assert.equal(matchReport(`/map-report/family/${studentId}`)?.report.key, "map-family");
    assert.equal(matchReport(`/map-report/family/${studentId}`)?.at.studentId, studentId);
    assert.equal(matchReport(`/map-report/class/${classId}/family`)?.at.classId, classId);
  });

  test("Send to family shares this one student's report (the same gate the MAP family report already checks)", async () => {
    assert.equal(await isReportShared(repo, String(admin.schoolId), studentId), false);
    assert.equal(await shareParentReport(repo, teacher, studentId, true, null, now), "PENDING", "a teacher's share waits for the admin, like the general Family Reports");
    assert.equal(await isReportShared(repo, String(admin.schoolId), studentId), false, "not shared yet");
    assert.equal(await shareParentReport(repo, admin, studentId, true, null, now), "SHARED", "an admin shares at once");
    assert.equal(await isReportShared(repo, String(admin.schoolId), studentId), true);
  });

  test("Edit: a teacher writes a note before sending; it is read with the report, never by another class's teacher", async () => {
    const before1 = await familyReport(repo, teacher, studentId, now);
    assert.equal(before1.note, null, "nothing written yet");

    await saveMapFamilyNote(repo, teacher, studentId, "Great progress on vocabulary this term!   ");
    const after1 = await familyReport(repo, teacher, studentId, now);
    assert.equal(after1.note, "Great progress on vocabulary this term!", "trimmed, extra spaces collapsed");

    // the family (student / parent, once shared) reads the very same note
    const st = await repo.findUnique("Student", { id: studentId });
    const studentActor = await resolveActor(repo, (await repo.findUnique("User", { id: st!.userId }))!);
    assert.equal((await familyReport(repo, studentActor, studentId, now)).note, "Great progress on vocabulary this term!");

    // a teacher of another class may not write (or even read) this student's note
    await assert.rejects(saveMapFamilyNote(repo, otherTeacher, studentId, "nope"), ForbiddenError);

    // clearing it removes the note
    await saveMapFamilyNote(repo, teacher, studentId, "");
    assert.equal((await familyReport(repo, teacher, studentId, now)).note, null);
  });
});
