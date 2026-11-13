/**
 * 🩹 Round 15 (owner, 12 Nov 2026, Render log "daily.run.crash_loop_stopped"): the daily job continues where it
 * stopped (deploy / restart / memory pause) instead of starting over, and skips only a step that keeps stopping.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { DAILY_STEP_NAMES, MAX_STEP_TRIES, PAUSED_RETRY_MS, STALE_CLAIM_MS, maybeRunDaily, riyadhDay, runDailySteps, type DailyCheckpoint } from "../src/server/insights/daily";
import { JobPaused, configureRunner } from "../src/server/jobs/runner";
import { demoDatabase } from "./helpers/db";

describe("🩹 round 15: the daily job in steps", () => {
  let repo: SqliteRepo; let schoolId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    schoolId = (await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!)).schoolId!;
  });
  const fresh = (): DailyCheckpoint => ({ step: 0, result: {}, tries: {}, skipped: [] });

  test("every step runs once and the place is saved before and after each", async () => {
    const saves: number[] = [];
    const cp = fresh();
    const r = await runDailySteps(repo, schoolId, new Date(), cp, async (c) => { saves.push(c.step); });
    assert.equal(cp.step, DAILY_STEP_NAMES.length);
    assert.equal(saves.length, 2 * DAILY_STEP_NAMES.length);
    assert.ok(Object.values(cp.tries).every((n) => n === 1));
    assert.equal(typeof r.profiles, "number");
    assert.equal(r.skipped, undefined);
  });

  test("a continued run starts at its saved step; a step tried MAX_STEP_TRIES times is skipped, the rest runs", async () => {
    const at = DAILY_STEP_NAMES.indexOf("profiles");
    const cp: DailyCheckpoint = { step: at, result: { decayed: 7 }, tries: { profiles: MAX_STEP_TRIES }, skipped: [] };
    const ran: string[] = [];
    const r = await runDailySteps(repo, schoolId, new Date(), cp, async (c) => { if (c.step < DAILY_STEP_NAMES.length) ran.push(DAILY_STEP_NAMES[c.step]); });
    assert.deepEqual(r.skipped, ["profiles"]);
    assert.equal(r.decayed, 7, "results of the earlier attempt are kept");
    assert.ok(!ran.includes("decay"), "earlier steps are not run again");
    assert.ok(typeof r.digests === "number", "the steps after the skipped one ran");
  });

  test("a memory pause is not a try: the step stays at 0 tries and the run can continue", async () => {
    configureRunner({ enforce: true, memory: () => ({ rssMb: 9999, heapMb: 9999 }), maxWaitMs: 0, waitMs: 0 });
    const cp = fresh();
    try { await assert.rejects(runDailySteps(repo, schoolId, new Date(), cp), (e) => e instanceof JobPaused); }
    finally { configureRunner("reset"); }
    assert.equal(cp.step, 0); assert.equal(cp.tries.decay ?? 0, 0);
  });

  test("claims: a fresh run is not taken over; a run silent 15 min (or paused 5 min) is continued from its step", async () => {
    const now = new Date();
    const key = `daily.run.${riyadhDay(now)}`;
    const put = async (value: Record<string, unknown>) => { await repo.deleteMany("SchoolSetting", { schoolId, key }); await repo.create("SchoolSetting", { schoolId, key, value, updatedBy: null }); };
    const cp = { step: 3, result: {}, tries: { decay: 1, platform: 1, analyse: 1 }, skipped: [] };
    await put({ startedAt: now.toISOString(), beatAt: new Date(now.getTime() - 60_000).toISOString(), cp });
    assert.equal(await maybeRunDaily(repo, schoolId, now), false, "still running elsewhere");
    await put({ startedAt: now.toISOString(), beatAt: new Date(now.getTime() - STALE_CLAIM_MS - 1000).toISOString(), cp });
    assert.equal(await maybeRunDaily(repo, schoolId, now), true, "silent: continued");
    await put({ startedAt: now.toISOString(), beatAt: now.toISOString(), pausedAt: new Date(now.getTime() - PAUSED_RETRY_MS - 1000).toISOString(), cp });
    assert.equal(await maybeRunDaily(repo, schoolId, now), true, "paused a while: continued");
    await put({ startedAt: now.toISOString(), doneAt: now.toISOString() });
    assert.equal(await maybeRunDaily(repo, schoolId, now), false, "done for the day");
  });
});
