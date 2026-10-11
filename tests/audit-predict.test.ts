import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { demoDatabase } from "./helpers/db";
import { predictNext, buildProfiles, profilesOf } from "../src/server/insights/student-profile";
import { ritPosterior } from "../src/server/map/map-plan";
import { featuresOf, inTrainSet, perWeek, studentBucket, trainingExamples, trainRiskModel, type RawSignals } from "../src/server/predict/risk";
import type { MapSummary } from "../src/server/insights/student-data";

const DAY = 86_400_000, WEEK = 7 * DAY;
const base: RawSignals = { days14: 6, daysPrev14: 6, growthPerWeek: 5, theta: 0, goalChance: 50, rootGaps: 0, rapidRate: 0, weeklyChange: 0, interventionFailed: false, hasMap: true, weakSkill: null };
const fallOnly = (rit = 200, target = 208) => ({ fall: { rit, term: "Fall 2026", season: "FALL", date: 0, percentile: 50, growth: target - rit }, latest: { rit, term: "Fall 2026", season: "FALL", date: 0, percentile: 50 }, springTarget: target, springActual: null, gap: target - rit, goals: [], lexile: null, band: "ON", status: "ON_TRACK", statusWhy: "" }) as unknown as MapSummary;

describe("audit · prediction (pure)", () => {
  test("1. the goal chance comes from the student's own evidence: different students, different chances", () => {
    const now = 12 * WEEK;
    const chances = [0, 3, 5, 8, 12].map((d) => predictNext(fallOnly(), 4, null, d, { now })!.chance!);
    assert.equal(new Set(chances).size, chances.length, `Fall only: practice changes the chance (${chances})`);
    assert.ok(chances[0] < 50 && chances[4] > 50);
    // in-year evidence: Winter MAP on pace vs behind pace
    const winter = (rit: number) => ({ ...fallOnly(), latest: { rit, term: "Winter 2027", season: "WINTER", date: 16 * WEEK, percentile: 50 } }) as unknown as MapSummary;
    const ahead = predictNext(winter(206), 4, null, 5, { now: 17 * WEEK })!, behind = predictNext(winter(200), 4, null, 5, { now: 17 * WEEK })!;
    assert.equal(ahead.term, "Spring");
    assert.ok(ahead.chance! > 70 && behind.chance! < 30, `${ahead.chance} vs ${behind.chance}`);
    assert.ok(ahead.rit > behind.rit && /RIT a week/.test(ahead.why));
    // a Weekly Check well below the Fall score lowers the chance
    const low = predictNext(fallOnly(), 4, 194, 5, { now, weeklyAt: now })!;
    assert.ok(low.chance! < chances[2]);
  });

  test("2. the Weekly Check RIT is pulled toward the prior: all correct / all wrong stay finite and near it", () => {
    const b = Array.from({ length: 15 }, (_, i) => 195 + (i % 5) * 3);
    const right = ritPosterior(b, b.map(() => 1), 200), wrong = ritPosterior(b, b.map(() => 0), 200);
    assert.ok(Number.isFinite(right) && right > 200 && right < 225, `all correct: ${right}`);
    assert.ok(Number.isFinite(wrong) && wrong < 200 && wrong > 175, `all wrong: ${wrong}`);
    const mixed = ritPosterior(b, b.map((_, i) => (i % 2 ? 1 : 0)), 200);
    assert.ok(Math.abs(mixed - 200) < 5);
    // one noisy check can never dominate the risk
    assert.equal(featuresOf({ ...base, weeklyChange: -40 }).weeklyDrop, 2);
    assert.equal(featuresOf({ ...base, weeklyChange: 40 }).weeklyDrop, -1);
  });

  test("5. growth per week uses the days the student was active (at least one)", () => {
    const now = 100 * DAY;
    assert.equal(perWeek(10, null, now), 5);
    assert.equal(perWeek(10, now - 7 * DAY, now), 10);
    assert.equal(perWeek(10, now - 3_600_000, now), 70, "at least one day");
    assert.equal(perWeek(10, now - 30 * DAY, now), 5, "at most 14 days");
  });

  test("4. the split is by student and stable", () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `student-${i}`);
    const share = ids.filter(inTrainSet).length / ids.length;
    assert.ok(share > 0.65 && share < 0.75, String(share));
    assert.equal(studentBucket("abc"), studentBucket("abc"));
  });
});

describe("audit · prediction on the test school", () => {
  let repo: SqliteRepo; let admin: Actor; let ids: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    ids = (await repo.findMany("Student", { schoolId: admin.schoolId }, { select: ["id"] })).map((x) => String(x.id));
  });

  test("1. profiles: same Fall score, different Weekly Checks → different chances; θ is saved", async () => {
    const now = new Date(), fall = new Date(now.getTime() - 10 * WEEK);
    const [a, b] = [ids[0], ids[1]];
    for (const id of [a, b]) {
      await repo.deleteMany("MapResult", { studentId: id });
      await repo.create("MapResult", { studentId: id, testDate: fall, subject: "Reading", goalName: null, rit: 200, projectedGrowth: 8, termName: "Fall 2026", importedAt: fall });
    }
    const done = new Date(now.getTime() - DAY);
    await repo.create("WeeklyCheck", { studentId: a, week: "2099-01-01", assignmentId: "x1", correct: 5, total: 5, ritBefore: 200, ritAfter: 207, completedAt: done, createdAt: done });
    await repo.create("WeeklyCheck", { studentId: b, week: "2099-01-01", assignmentId: "x2", correct: 1, total: 5, ritBefore: 200, ritAfter: 196, completedAt: done, createdAt: done });
    await repo.upsert("StudentAbility", { studentId: a, scope: "SKILL:x" }, { theta: 0.8, thetaSE: 0.3, responses: 20 }, { theta: 0.8, responses: 20 });
    await buildProfiles(repo, String(admin.schoolId), now, [a, b]);
    const p = await profilesOf(repo, [a, b]);
    const pa = p.get(a)!, pb = p.get(b)!;
    assert.equal(pa.goalReading, 208);
    assert.ok(pa.goalChance! > pb.goalChance!, `${pa.goalChance} vs ${pb.goalChance}`);
    assert.equal(Number((await repo.findUnique("StudentProfile", { studentId: a }))!.theta), 0.8);
  });

  test("4. training: one example per student and Spring outcome, projection of the same school year only", async () => {
    const now = new Date();
    const sts = ids.slice(10, 70);
    const fall = new Date(now.getTime() - 230 * DAY), spring = new Date(now.getTime() - 20 * DAY);
    for (const [i, id] of sts.entries()) {
      await repo.deleteMany("MapResult", { studentId: id });
      // daily snapshots for 60 days (only the latest one 14+ days before Spring may be used)
      for (let d = 10; d < 70; d++) await repo.create("RiskSnapshot", { studentId: id, schoolId: admin.schoolId, takenOn: new Date(new Date(now.getTime() - d * DAY).toISOString().slice(0, 10)), score: 50, features: featuresOf({ ...base, days14: i % 2 ? 9 : 1 }), model: "EXPERT" });
      if (i < 50) await repo.create("MapResult", { studentId: id, testDate: fall, subject: "Reading", goalName: null, rit: 200, projectedGrowth: 8, termName: "Fall 2025", importedAt: fall });
      else await repo.create("MapResult", { studentId: id, testDate: new Date(fall.getTime() - 365 * DAY), subject: "Reading", goalName: null, rit: 195, projectedGrowth: 8, termName: "Fall 2024", importedAt: fall });
      await repo.create("MapResult", { studentId: id, testDate: spring, subject: "Reading", goalName: null, rit: i % 2 ? 210 : 203, termName: "Spring 2026", importedAt: spring });
    }
    const ex = (await trainingExamples(repo, String(admin.schoolId), now)).filter((e) => sts.includes(e.studentId));
    assert.equal(ex.length, 50, "one per student; last year's projection is not used");
    assert.equal(new Set(ex.map((e) => e.studentId)).size, 50);
    assert.ok(ex.every((e) => e.missed === (sts.indexOf(e.studentId) % 2 === 0)));
    const train = new Set(ex.filter((e) => inTrainSet(e.studentId)).map((e) => e.studentId));
    assert.ok(ex.filter((e) => !inTrainSet(e.studentId)).every((e) => !train.has(e.studentId)), "no student on both sides");
    const r = await trainRiskModel(repo, String(admin.schoolId), now);
    assert.ok(r.n >= 50 && r.positives >= 20, JSON.stringify(r));
  });
});
