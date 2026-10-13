/**
 * 🧭 Trust in the levels (FAKE data only — the Test School): the Level Story shows every source and where each
 * level comes from; strong disagreement between sources is found, alerted and grouped; Data Health counts gaps.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { levelStory, levelConflicts, dataHealth } from "../src/server/insights/level-story";
import { findAlerts } from "../src/server/insights/alerts";
import { supportGroups } from "../src/server/teacher/support";
import { demoDatabase } from "./helpers/db";

describe("level story, conflicts and data health", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let classId: string; let roster: { id: string }[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, other] = await Promise.all([a("test.teacher.1"), a("test.teacher.3")]);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
    // student 0: MAP high (Above) but the platform says Below (12 careful answers, 3 right)
    const sid = roster[0].id;
    await repo.create("MapResult", { studentId: sid, testDate: new Date(), subject: "Reading", goalName: null, rit: 230, achievementPercentile: 90, termName: "Fall 2026", importedAt: new Date() });
    const q = (await repo.findMany("Question", {}))[0];
    const ses = await repo.create("PracticeSession", { studentId: sid, skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    for (let i = 0; i < 12; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: q.id, skillId: q.skillId, response: "A", isCorrect: i < 3, responseMs: 30_000, rapidGuess: false, difficultyB: 0, createdAt: new Date(Date.now() - i * 60_000) } as never);
  });

  test("the Level Story: every section with where it comes from, every source, the disagreement", async () => {
    const v = await levelStory(repo, teacher, roster[0].id);
    assert.equal(v.sections.length, 4);
    assert.equal(v.sections[0].from, "PLATFORM", "recent work comes before MAP");
    assert.equal(v.sources.find((x) => x.key === "MAP")!.level, "ABOVE");
    assert.equal(v.sources.find((x) => x.key === "PLATFORM")!.level, "BELOW");
    assert.ok(v.conflict && /recent work says Approaching/.test(v.conflict.note));
    await assert.rejects(levelStory(repo, other, roster[0].id), ForbiddenError);
  });

  test("the disagreement is listed, alerted once, and a Support Group to check", async () => {
    const c = await levelConflicts(repo, teacher, [classId]);
    assert.deepEqual(c.map((x) => x.studentId), [roster[0].id]);
    const alerts = (await findAlerts(repo, String(teacher.schoolId))).filter((a) => a.kind === "LEVEL_CONFLICT");
    assert.deepEqual(alerts.map((a) => a.studentId), [roster[0].id]);
    const g = await supportGroups(repo, teacher, classId);
    assert.ok(g.groups.some((x) => x.kind === "CHECK" && x.students[0].id === roster[0].id));
  });

  test("Data Health: who lacks MAP, the Diagnostic, recent practice, or any data", async () => {
    const h = await dataHealth(repo, teacher);
    const row = h.rows.find((r) => r.classId === classId)!;
    assert.equal(row.noMap.length, row.students - 1);
    assert.ok(!row.noData.includes(roster[0].id));
    assert.ok(row.noData.includes(roster[1].id));
    assert.equal(row.conflicts, 1);
  });
});
