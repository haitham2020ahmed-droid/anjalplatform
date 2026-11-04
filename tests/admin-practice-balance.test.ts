/**
 * 👥 Admin → NAFS vs. Motivational Practice Balance (src/server/admin/practice-balance.ts): NAFS minutes
 * (NafsPracticeRun.seconds) vs. ReadRise minutes (RRRun.readSeconds), with games shown as a separate
 * questions-answered proxy (GamePlay has no time column). School-wide, admin only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { MIN_FLAG_MINUTES, NAFS_SHARE_FLAG, practiceBalance } from "../src/server/admin/practice-balance";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin · NAFS vs. motivational practice balance", () => {
  let repo: SqliteRepo; let admin: Actor; let teacherA: Actor; let student: Actor;
  let schoolId: string; let classA: string; let studentHeavy: string; let studentBalanced: string; let studentQuiet: string;
  const now = new Date("2026-10-20T08:00:00Z");

  let nafsRunSeq = 0;
  const nafsRun = (studentId: string, classId: string, seconds: number, startedAt: Date) =>
    repo.create("NafsPracticeRun", { practiceId: `practice-${nafsRunSeq++}`, studentId, classId, state: {}, asked: 5, correct: 3, seconds, startedAt, updatedAt: startedAt });
  const rrRun = (studentId: string, readSeconds: number, startedAt: Date) =>
    repo.create("RRRun", { studentId, schoolId, articleId: "article-1", versionLevel: 3, band: "B1", levelBefore: 3, readSeconds, startedAt });
  const gamePlay = (studentId: string, skillId: string, correct: number, incorrect: number, createdAt: Date) =>
    repo.create("GamePlay", { schoolId, studentId, skillId, gameId: "quiz-race", mode: "SOLO", correct, incorrect, points: 10, createdAt });

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacherA = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);

    const tA = await repo.findUnique("Teacher", { userId: teacherA.userId });
    classA = s((await repo.findMany("ClassTeacher", { teacherId: tA!.id }))[0].classId);
    const members = (await repo.findMany("ClassMembership", { classId: classA, leftAt: null })).map((m) => s(m.studentId));
    assert.ok(members.length >= 3);
    [studentHeavy, studentBalanced, studentQuiet] = members;
    const skill = (await repo.findMany("Skill", { isActive: true, deletedAt: null }, { select: ["id"] }))[0];

    // studentHeavy: 40 NAFS minutes, 5 ReadRise minutes → 89% NAFS share, over the 70% mark and over the 10-minute floor → flagged
    await nafsRun(studentHeavy, classA, 40 * 60, now);
    await rrRun(studentHeavy, 5 * 60, now);
    // studentBalanced: 10 NAFS minutes, 20 ReadRise minutes, plus games → well under the mark, not flagged
    await nafsRun(studentBalanced, classA, 10 * 60, now);
    await rrRun(studentBalanced, 20 * 60, now);
    await gamePlay(studentBalanced, s(skill.id), 8, 2, now);
    // studentQuiet: a single short NAFS session (3 minutes, 100% NAFS) → under MIN_FLAG_MINUTES, not flagged (too little to judge)
    await nafsRun(studentQuiet, classA, 3 * 60, now);
    // an old NAFS session outside the 30-day window must not count
    await nafsRun(studentHeavy, classA, 999 * 60, new Date(now.getTime() - 60 * 86_400_000));
  });

  test("NAFS and ReadRise minutes are summed per student from their real time columns, games are a separate question count, and the share flags only a student with both a high share and enough minutes", async () => {
    const d = await practiceBalance(repo, admin, { now });
    const row = d.classes.find((c) => c.classId === classA)!;
    assert.ok(row, "the class with practice shows up");

    const heavy = row.students.find((st) => st.studentId === studentHeavy)!;
    assert.equal(heavy.nafsMinutes, 40, "the 999-minute run outside the 30-day window is excluded");
    assert.equal(heavy.readriseMinutes, 5);
    assert.equal(heavy.nafsSharePct, Math.round((100 * 40) / 45));
    assert.ok(heavy.nafsSharePct! > Math.round(NAFS_SHARE_FLAG * 100));
    assert.equal(heavy.flagged, true);

    const balanced = row.students.find((st) => st.studentId === studentBalanced)!;
    assert.equal(balanced.nafsMinutes, 10);
    assert.equal(balanced.readriseMinutes, 20);
    assert.equal(balanced.gameAnswers, 10, "games are counted as questions answered (correct+incorrect), never minutes");
    assert.equal(balanced.flagged, false);

    const quiet = row.students.find((st) => st.studentId === studentQuiet)!;
    assert.equal(quiet.nafsMinutes, 3);
    assert.equal(quiet.nafsSharePct, 100, "share is still computed");
    assert.equal(quiet.flagged, false, "below MIN_FLAG_MINUTES, too little data to flag");
    assert.ok(quiet.nafsMinutes + quiet.readriseMinutes < MIN_FLAG_MINUTES);

    assert.equal(row.totals.flagged, 1);
    assert.equal(d.schoolTotals.flagged, 1);
  });

  test("empty state: a class with no NAFS, ReadRise or game activity in the window reports zero minutes and no flags, never crashes", async () => {
    const { repo: emptyRepo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
    const emptyAdmin = await resolveActor(emptyRepo, (await emptyRepo.findUnique("User", { username: "demo.admin" }))!);
    const d = await practiceBalance(emptyRepo, emptyAdmin);
    assert.equal(d.schoolTotals.flagged, 0);
    assert.equal(d.schoolTotals.nafsMinutes, 0);
    assert.equal(d.schoolTotals.readriseMinutes, 0);
    assert.ok(d.classes.length >= 1, "classes with students still show up, all at zero");
    for (const c of d.classes) for (const st of c.students) { assert.equal(st.nafsMinutes, 0); assert.equal(st.readriseMinutes, 0); assert.equal(st.nafsSharePct, null); assert.equal(st.flagged, false); }
  });

  test("permission gate: only school/platform admins see the school-wide practice balance", async () => {
    await assert.rejects(practiceBalance(repo, teacherA), ForbiddenError);
    await assert.rejects(practiceBalance(repo, student), ForbiddenError);
  });
});
