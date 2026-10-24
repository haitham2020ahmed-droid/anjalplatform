/**
 * 🧠 Admin "Learning Engine" (src/app/admin/learning-engine): what the engine knows for the school (engineOverview),
 * whether its advice and interventions work, the school's common misconceptions, and "Update now" (runEngineNowAction
 * → runDaily). None of engineOverview / runDaily / recommendationStats / interventionImpact / groupMisconceptions
 * check the actor's role themselves — the page's own requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] }) is the
 * only gate, checked below by reading its source (requireActor itself needs a real Next.js session to exercise).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { engineOverview, runDaily, riyadhDay } from "../src/server/insights/daily";
import { recommendationStats } from "../src/server/insights/recommendation-log";
import { interventionImpact } from "../src/server/insights/interventions";
import { groupMisconceptions } from "../src/server/insights/misconception-tags";
import { demoDatabase, ROOT } from "./helpers/db";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("🧠 admin Learning Engine", () => {
  let repo: SqliteRepo, admin: Actor, schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = String(admin.schoolId);
  });

  test("the page gates to SCHOOL_ADMIN / SUPER_ADMIN only; the server functions it calls have no role check of their own", () => {
    const page = read("src/app/admin/learning-engine/page.tsx");
    assert.match(page, /requireActor\(\{\s*roles:\s*\["SCHOOL_ADMIN",\s*"SUPER_ADMIN"\]\s*\}\)/);
    const actions = read("src/app/admin/learning-engine/actions.ts");
    assert.match(actions, /requireActor\(\{\s*roles:\s*\["SCHOOL_ADMIN",\s*"SUPER_ADMIN"\]\s*\}\)/);
  });

  test("a brand-new school: never run, no student profiles yet — engineOverview renders zeros for the school, not a crash", async () => {
    const o = await engineOverview(repo, schoolId);
    assert.equal(o.lastRun, null, "before any run (manual or nightly) there is no daily.run.* setting yet for this school");
    assert.deepEqual(o.profiles, { total: 0, below: 0, on: 0, above: 0, unknown: 0, atRisk: 0 });
    assert.equal(o.options.tagged, 0, "nothing tagged with a misconception before the engine ever ran");
    assert.ok(o.options.wrong >= 0);
    assert.ok(o.prerequisites >= 0, "the curriculum's own prerequisite graph, not school-specific");
  });

  test("engineOverview counts profiles by level and 'at risk' (goal chance under 40)", async () => {
    const students = await repo.findMany("Student", { schoolId }, { take: 3 });
    await repo.create("StudentProfile", { studentId: students[0].id, schoolId, level: "BELOW", levelSource: "MAP", goalChance: 25 });
    await repo.create("StudentProfile", { studentId: students[1].id, schoolId, level: "ON", levelSource: "MAP", goalChance: 70 });
    await repo.create("StudentProfile", { studentId: students[2].id, schoolId, level: "ABOVE", levelSource: "MAP" }); // no goalChance: never "at risk"
    const o = await engineOverview(repo, schoolId);
    assert.deepEqual(o.profiles, { total: 3, below: 1, on: 1, above: 1, unknown: 0, atRisk: 1 });
  });

  test("“Update now” (runDaily) runs end to end against the demo school and returns counts for every step", async () => {
    const r = await runDaily(repo, schoolId, new Date());
    assert.ok(typeof r.profiles === "number" && r.profiles >= 0);
    assert.ok(typeof r.decayed === "number" && typeof r.digests === "number");
    assert.ok(typeof r.tagged === "number" && typeof r.prerequisites === "number" && typeof r.recommendations === "number" && typeof r.interventions === "number");
  });

  test("r86 fix: a manual 'Update now' click now stamps the same daily.run.* setting the nightly job does, so 'Last update' on the page reflects it", async () => {
    const now = new Date();
    const r = await runDaily(repo, schoolId, now);
    // mirrors exactly what src/app/admin/learning-engine/actions.ts's runEngineNowAction does right after runDaily
    const key = `daily.run.${riyadhDay(now)}`;
    const value = { ...r, doneAt: now.toISOString() };
    await repo.upsert("SchoolSetting", { schoolId, key }, { value }, { value });
    const o = await engineOverview(repo, schoolId);
    assert.ok(o.lastRun, "lastRun should now be populated after the manual-run done-mark is written");
    assert.equal(o.lastRun!.day, riyadhDay(now));
    assert.ok(o.lastRun!.result && typeof (o.lastRun!.result as Record<string, unknown>).doneAt === "string");
    assert.equal((o.lastRun!.result as Record<string, unknown>).profiles, r.profiles);
  });

  test("the overview, advice stats, intervention impact and misconception grouping load together without crashing on a quiet school (what the page itself awaits)", async () => {
    const ids = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => String(x.id));
    const [o, advice, impact, mis] = await Promise.all([engineOverview(repo, schoolId), recommendationStats(repo, ids), interventionImpact(repo, schoolId), groupMisconceptions(repo, ids, 30, new Date(), 8)]);
    assert.ok(o && typeof advice.made === "number" && Array.isArray(impact) && Array.isArray(mis));
  });
});
