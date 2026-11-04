import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { classProfile, cutScores, medianQuintile, quintileOf, schoolOverview, setCutScores, studentAreaQuintiles, studentProfile } from "../src/server/map/nwea-reports";
import { demoDatabase } from "./helpers/db";

describe("📊 MAP reports in NWEA style (fake scores)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let classId: string; let ids: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); teacher = await as("test.teacher.1"); other = await as("test.teacher.3");
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    // 12 students: Fall and Winter, with areas; one rushed test
    const now = new Date();
    for (const [i, sid] of ids.slice(0, 12).entries()) {
      const fall = 180 + i * 3, win = fall + (i % 3) * 3 - 1;
      await repo.create("MapResult", { studentId: sid, testDate: new Date("2025-09-15"), subject: "Reading", goalName: null, rit: fall, ritSE: 3.2, achievementPercentile: 10 + i * 7, projectedGrowth: 8, termName: "Fall 2025", importedAt: now });
      await repo.create("MapResult", { studentId: sid, testDate: new Date("2026-01-15"), subject: "Reading", goalName: null, rit: win, ritSE: 3.1, achievementPercentile: 12 + i * 7, growthPercentile: 20 + i * 6, observedGrowth: win - fall, metProjectedGrowth: win - fall >= 4 ? "Yes" : "No", testMinutes: i === 0 ? 9 : 35, rapidGuessPct: i === 0 ? 40 : 2, termName: "Winter 2026", importedAt: now });
      for (const [name, d] of [["Literary Text: Key Ideas", 6], ["Informational Text: Key Ideas", -7], ["Vocabulary: Acquisition", 0]] as const)
        await repo.create("MapResult", { studentId: sid, testDate: new Date("2026-01-15"), subject: "Reading", goalName: name, rit: win + d, ritSE: 6.5, descriptor: d > 0 ? "HiAvg" : d < 0 ? "Low" : "Avg", termName: "Winter 2026", importedAt: now });
    }
  });

  test("quintiles follow NWEA's bands", () => {
    assert.deepEqual([20, 21, 40, 41, 60, 61, 80, 81].map(quintileOf), [0, 1, 1, 2, 2, 3, 3, 4]);
  });

  test("Student Profile: tiles, history with percentile bands, areas (strength / focus), action plan, flags", async () => {
    const p = await studentProfile(repo, teacher, ids[0], new Date("2026-02-01"));
    const r = p.subjects.find((x) => x.subject === "READING")!;
    assert.equal(r.history.length, 2);
    assert.ok(r.history.every((h) => h.bands && h.bands.length === 4 && h.bands[0] < h.bands[3]));
    assert.equal(r.latest.term, "Winter 2026");
    assert.ok(r.latest.flags.some((f) => /Rapid/.test(f)) && r.latest.flags.some((f) => /Short/.test(f)));
    assert.deepEqual(r.areas.map((a) => [a.name, a.relative]), [["Literary Text", null], ["Vocabulary", null], ["Informational Text", "FOCUS"]], "+6 is inside the error (6.5); −7 is a focus");
    assert.ok(r.plan.some((x) => /Informational text/.test(x)) && r.plan.some((x) => /retest/.test(x)));
    await assert.rejects(studentProfile(repo, other, ids[0]), ForbiddenError);
  });

  test("Class Profile: distribution, national comparison, areas, flags, growth (10+), quadrants; cut scores", async () => {
    const c = await classProfile(repo, teacher, classId, "READING");
    assert.equal(c.term, "Winter 2026");
    assert.deepEqual(c.terms, ["Winter 2026", "Fall 2025"]);
    assert.equal(c.n, 12);
    assert.equal(c.quintiles.reduce((t, x) => t + x, 0), 12);
    assert.ok(c.national !== null && c.meanRit !== null);
    assert.deepEqual(c.areaNames, ["Informational Text", "Literary Text", "Vocabulary"]);
    assert.equal(c.areas.find((a) => a.name === "Informational Text")!.quintiles[0], 12, "all Low");
    assert.equal(c.flagged, 1);
    assert.equal(c.growth.n, 12); assert.equal(c.growth.enough, true);
    assert.ok(c.growth.pctMet !== null && c.growth.medianCgp !== null);
    assert.ok(c.students.every((x) => x.quadrant));
    assert.equal(c.proficiency.length, 0, "no cut scores, no data file proficiency");
    await assert.rejects(setCutScores(repo, teacher, { READING: { 4: 200 }, LANGUAGE: {} }), ForbiddenError);
    await assert.rejects(setCutScores(repo, admin, { READING: { 4: 900 }, LANGUAGE: {} }), /between 140 and 300/);
    const grade = c.grade;
    await setCutScores(repo, admin, { READING: { [grade]: 205 }, LANGUAGE: {} });
    assert.equal((await cutScores(repo, String(admin.schoolId))).READING[grade], 205);
    const fall = await classProfile(repo, teacher, classId, "READING", "Fall 2025");
    assert.ok(fall.proficiency.length >= 1, "projected from the Spring goal and the cut");
    assert.equal(fall.growth.n, 0);
    await assert.rejects(classProfile(repo, other, classId, "READING"), ForbiddenError);
  });

  test("📊 Instructional Area Achievement Percentiles: the true ordinal median band from counts (never an invented exact percentile)", () => {
    assert.equal(medianQuintile([12, 0, 0, 0, 0]), 0, "all 12 Low: the median is Low");
    assert.equal(medianQuintile([0, 0, 0, 0, 0]), null, "nobody banded: no median");
    assert.equal(medianQuintile([1, 1, 1, 0, 0]), 1, "3 students (Low, LoAvg, Avg): the middle one is LoAvg");
    assert.equal(medianQuintile([0, 0, 0, 1, 1]), 3, "2 students (HiAvg, High): the lower of the two middle positions is HiAvg");
  });

  test("📊 one student's own row (studentAreaQuintiles): one-hot in their own band, same area list and order as the whole-class chart", async () => {
    const c = await classProfile(repo, teacher, classId, "READING");
    const rows = studentAreaQuintiles(c, ids[0]);
    assert.deepEqual(rows.map((r) => r.name), c.areaNames, "same rows, same order as the class chart");
    const info = rows.find((r) => r.name === "Informational Text")!;
    assert.deepEqual(info.quintiles, [1, 0, 0, 0, 0], "this student's own Informational Text descriptor is Low (−7 of 6.5 SE)");
    const lit = rows.find((r) => r.name === "Literary Text")!;
    assert.deepEqual(lit.quintiles, [0, 0, 0, 1, 0], "this student's own Literary Text descriptor is HiAvg (+6)");
    assert.equal(rows.reduce((n, r) => n + r.quintiles.reduce((x, y) => x + y, 0), 0), c.areaNames.length, "exactly one band set per area, never more than one");
  });

  test("School overview: grades and classes", async () => {
    const o = await schoolOverview(repo, admin, "READING");
    assert.equal(o.term, "Winter 2026");
    const cls = o.classes.find((x) => x.classId === classId)!;
    assert.equal(cls.n, 12);
    assert.ok(o.grades.some((g) => g.n >= 12));
    const mine = await schoolOverview(repo, teacher, "READING");
    assert.ok(mine.classes.every((x) => x.classId !== null));
    assert.ok(mine.classes.length <= o.classes.length);
  });
});
