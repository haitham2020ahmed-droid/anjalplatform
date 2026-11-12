/**
 * 🧹 ReadRise round 13 (owner, 12 Nov 2026: "fix the students whose levels went too high, automatically") — the
 * one-time level check after the question rewrite. FAKE data only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { LEVEL_CHECK_PREFIX, isAnchorChange, levelDecision, onProbation } from "../src/server/readrise/engine";
import { LIBRARY_SYNC_JOB, READRISE_ROUND13_JOB, ROUND13_TAG, librarySynced, round13Limit, round13School } from "../src/server/readrise/round13";
import { saveSetting } from "../src/server/jobs/runner";
import { demoDatabase } from "./helpers/db";

const NOW = new Date("2026-11-12T08:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

describe("🧹 round 13: the limit (pure)", () => {
  test("recent MAP: MAP + 150; no MAP: the grade cap; nothing known: no limit", () => {
    assert.equal(round13Limit(760, 5)!.limit, 910);
    assert.equal(round13Limit(null, 5)!.limit, 1160);
    assert.equal(round13Limit(null, null), null);
  });
  test("a level check starts the 3-article probation", () => {
    assert.equal(isAnchorChange(`${LEVEL_CHECK_PREFIX}: ${ROUND13_TAG}`), true);
    assert.equal(levelDecision([40], { probation: true }).delta, -100);
    assert.match(String(levelDecision([40], { probation: true }).reason), /level check/);
  });
});

describe("🧹 round 13: the one-time check (DB)", () => {
  let repo: SqliteRepo; let ids: string[]; let schoolId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const users = await Promise.all(["001", "002", "003", "004"].map(async (x) => resolveActor(repo, (await repo.findUnique("User", { username: `test.student.${x}` }))!)));
    ids = users.map((u) => u.studentId!);
    schoolId = String(users[0].schoolId);
    const g5 = (await repo.findMany("Grade", { schoolId })).find((g) => Number(g.level) === 5);
    const g5id = g5 ? g5.id : (await repo.create("Grade", { schoolId, level: 5, name: "Grade 5" })).id;
    for (const id of ids) await repo.updateMany("Student", { id }, { gradeId: g5id });
    const rr = (studentId: string, level: number) => repo.create("RRStudent", { studentId, schoolId, level, startLevel: 700, source: "PLACEMENT", placedAt: ago(40), weeklyGoal: 2, updatedAt: ago(40) });
    const placed = (studentId: string, level: number) => repo.create("RRLevelChange", { studentId, schoolId, fromLevel: 300, toLevel: level, reason: `Placement: 13 passages, result ${level}L`, createdAt: ago(40) });
    const up = (studentId: string, from: number, to: number) => repo.create("RRLevelChange", { studentId, schoolId, fromLevel: from, toLevel: to, reason: `Up ${to - from}: 3 of the last 4 first-try scores were 75% or higher`, createdAt: ago(5) });
    // 0: climbed by articles to 1300, MAP 760 → 910
    await rr(ids[0], 1300); await placed(ids[0], 800); await up(ids[0], 800, 1300);
    await repo.create("MapResult", { studentId: ids[0], testDate: ago(40), subject: "Reading", rit: 205, lexile: 760 });
    // 1: climbed by articles to 1400, no MAP → the Grade 5 cap (1160)
    await rr(ids[1], 1400); await placed(ids[1], 900); await up(ids[1], 900, 1400);
    // 2: a fitting level → stays, only the check note
    await rr(ids[2], 800); await placed(ids[2], 800);
    // 3: not placed yet (no level change) → skipped
    await rr(ids[3], 700);
  });

  test("waits for the library sync", async () => {
    assert.equal(await librarySynced(repo), false);
    await assert.rejects(READRISE_ROUND13_JOB.step(repo, schoolId, null, {} as never, NOW), /waiting/);
    const first = (await LIBRARY_SYNC_JOB.schools!(repo))[0];
    await saveSetting(repo, first, "job.readrise-library-sync", { version: "r13", done: true, cursor: null, progress: {}, batches: 1, startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), error: null });
    assert.equal(await librarySynced(repo), true);
  });

  test("brings too-high levels down, notes the rest, once", async () => {
    const r = await round13School(repo, schoolId, NOW);
    assert.deepEqual({ lowered: r.lowered, checked: r.checked }, { lowered: 2, checked: 1 });
    const level = async (i: number) => Number((await repo.findUnique("RRStudent", { studentId: ids[i] }))!.level);
    assert.equal(await level(0), 910);
    assert.equal(await level(1), 1160);
    assert.equal(await level(2), 800);
    assert.equal(await level(3), 700);
    const again = await round13School(repo, schoolId, NOW);
    assert.deepEqual({ lowered: again.lowered, checked: again.checked }, { lowered: 0, checked: 0 });
    assert.equal(await level(0), 910);
  });

  test("the next article after the check is on probation (one low score → down 100)", async () => {
    const changes = (await repo.findMany("RRLevelChange", { studentId: ids[2] })).sort((a, b) => new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime());
    assert.match(String(changes[changes.length - 1].reason), new RegExp(`^${LEVEL_CHECK_PREFIX}`));
    const art = (await repo.findMany("RRArticle", {}))[0];
    if (!art) return; // no library in this test database
    await repo.create("RRRun", { studentId: ids[2], schoolId, articleId: art.id, band: "MID", firstTry: true, score: 40, startedAt: new Date(NOW.getTime() + 60_000), completedAt: new Date(NOW.getTime() + 600_000), readSeconds: 400 });
    assert.equal(await onProbation(repo, ids[2], changes), true);
  });
});
