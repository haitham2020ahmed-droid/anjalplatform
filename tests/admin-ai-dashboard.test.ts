/**
 * 🏫 Admin "School AI" dashboard (src/app/admin/ai-dashboard): trend, growth/risk by grade, outcomes, intervention
 * effectiveness and how well the platform's own models are doing (schoolAi). The page itself (not schoolAi, which
 * takes only a schoolId and has no RBAC of its own) is gated to SCHOOL_ADMIN / SUPER_ADMIN — checked below by
 * reading its source, since requireActor needs a real Next.js session to exercise directly.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { schoolAi } from "../src/server/predict/school-ai";
import { demoDatabase, ROOT } from "./helpers/db";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("🏫 admin School AI dashboard", () => {
  let repo: SqliteRepo, admin: Actor, schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = String(admin.schoolId);
  });

  test("the page itself gates to SCHOOL_ADMIN / SUPER_ADMIN (schoolAi has no RBAC check of its own)", () => {
    const page = read("src/app/admin/ai-dashboard/page.tsx");
    assert.match(page, /requireActor\(\{\s*roles:\s*\["SCHOOL_ADMIN",\s*"SUPER_ADMIN"\]\s*\}\)/);
    assert.doesNotMatch(page, /"TEACHER"|"STUDENT"/, "neither role is in the allowed list");
  });

  test("a quiet school (no ability snapshots, no profiles, no MAP plans): every section renders zeros, never throws", async () => {
    const d = await schoolAi(repo, schoolId);
    assert.deepEqual(d.trend, []);
    assert.equal(d.outcomes.mastered, 0);
    assert.equal(d.outcomes.weeklyChecks, 0);
    assert.equal(d.outcomes.weeklyAvgChange, null, "no finished Weekly Checks: no average to show");
    assert.ok(d.outcomes.students > 0, "the demo school has students even with no activity yet");
    assert.ok(d.grades.length >= 1 && d.grades.every((g) => g.students > 0));
    assert.deepEqual(d.interventions, []);
    assert.ok(["EXPERT", "LEARNED"].includes(d.models.risk.source));
  });

  test("a weekly ability snapshot feeds the trend (one point per calendar day, averaged across students)", async () => {
    const [stA, stB] = await repo.findMany("Student", { schoolId }, { take: 2 });
    const day = new Date("2026-10-10T09:00:00Z");
    await repo.create("AbilitySnapshot", { studentId: stA.id, scope: "PROFILE", takenOn: day, theta: 0.4, mastery: 60 });
    await repo.create("AbilitySnapshot", { studentId: stB.id, scope: "PROFILE", takenOn: day, theta: 0.8, mastery: 80 });
    const now = new Date(day.getTime() + 5 * 86_400_000);
    const d = await schoolAi(repo, schoolId, now);
    assert.equal(d.trend.length, 1);
    assert.equal(d.trend[0].theta, 0.6, "averaged across the two students");
    assert.equal(d.trend[0].students, 2);
  });

  test("a student with a MAP goal set above 50% is on track for their grade's row", async () => {
    const st = (await repo.findMany("Student", { schoolId }, { take: 1 }))[0];
    await repo.create("StudentProfile", { studentId: st.id, schoolId, level: "ON", levelSource: "MAP", predictedReading: 210, goalReading: 205, goalChance: 72, riskScore: 20 });
    const d = await schoolAi(repo, schoolId);
    const grade = (await repo.findUnique("Grade", { id: st.gradeId }))!;
    const g = d.grades.find((x) => x.grade === Number(grade.level))!;
    assert.ok(g.withGoal >= 1 && g.onTrack >= 1);
    assert.ok(g.avgPredicted !== null && g.avgGoal !== null);
  });
});
