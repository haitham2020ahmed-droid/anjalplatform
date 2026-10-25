import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { bandOf, enterRitScores, ensureNationalNorms, levelsFromClassAverage, nationalNorm, ritView, seasonOf, updateNationalNorms } from "../src/server/map/rit";
import { studentLevels } from "../src/server/curriculum-map/levels";
import { demoDatabase } from "./helpers/db";

describe("MAP Reading RIT: national norms, ranking, class comparison", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let admin: Actor; let classId: string; let ids: string[];
  const RITS = [230, 210, 205, 200, 190, 170];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, other, admin] = await Promise.all(["test.teacher.1", "test.teacher.3", "test.admin"].map(a));
    const r = await teacherRoster(repo, teacher);
    classId = r[0].id; ids = r[0].students.slice(0, 6).map((x) => x.id);
  });

  test("seasons and NWEA bands", () => {
    assert.deepEqual(["Fall 2026", "Winter 2027", "spring 2027"].map((t) => seasonOf(t)), ["FALL", "WINTER", "SPRING"]);
    assert.equal(seasonOf(null, new Date("2027-01-20")), "WINTER");
    assert.deepEqual([10, 21, 40, 41, 60, 61, 80, 81].map(bandOf), ["Low", "LoAvg", "LoAvg", "Avg", "Avg", "HiAvg", "HiAvg", "High"]);
  });

  test("entering scores: own class only, valid term and RIT", async () => {
    await assert.rejects(enterRitScores(repo, teacher, { classId, term: "September", testDate: new Date("2026-09-15"), scores: [] }), /Term must look like/);
    await assert.rejects(enterRitScores(repo, other, { classId, term: "Fall 2026", testDate: new Date("2026-09-15"), scores: [{ studentId: ids[0], rit: 200 }] }), ForbiddenError);
    await assert.rejects(enterRitScores(repo, teacher, { classId, term: "Fall 2026", testDate: new Date("2026-09-15"), scores: [{ studentId: ids[0], rit: 999 }] }), /not a valid score/);
    assert.equal(await enterRitScores(repo, teacher, { classId, term: "Fall 2026", testDate: new Date("2026-09-15"), scores: ids.map((studentId, i) => ({ studentId, rit: RITS[i] })) }), 6);
    // entering again for the same term replaces, never duplicates
    await enterRitScores(repo, teacher, { classId, term: "Fall 2026", testDate: new Date("2026-09-15"), scores: [{ studentId: ids[0], rit: 230 }] });
    assert.equal((await repo.findMany("MapResult", { studentId: ids[0], termName: "Fall 2026" })).length, 1);
  });

  test("ranking against the national average (Grade 4 Fall: mean 196, SD 18) and the class average", async () => {
    const v = await ritView(repo, teacher, { classId });
    assert.deepEqual([v.term, v.season, v.norm?.mean, v.norm?.sd], ["Fall 2026", "FALL", 196, 18]);
    assert.deepEqual(v.rows.map((r) => [r.rank, r.rit]), RITS.map((x, i) => [i + 1, x]));
    const top = v.rows[0], low = v.rows[5];
    assert.deepEqual([top.national!.diff, top.national!.percentile, top.national!.band, top.national!.estimated], [34, 97, "High", true]);
    assert.deepEqual([low.national!.diff, low.national!.percentile, low.national!.band], [-26, 7, "Low"]);
    assert.equal(v.rows[0].classAvg, 200.8);
    assert.deepEqual(v.rows.map((r) => r.vsClass), ["ABOVE", "ABOVE", "ABOVE", "AT", "BELOW", "BELOW"]);
    assert.deepEqual([v.summary.average, v.summary.atOrAboveNational, v.summary.students], [200.8, 67, 6]);
    // NWEA's own percentile wins when it was imported
    await repo.updateMany("MapResult", { studentId: ids[3], termName: "Fall 2026" }, { achievementPercentile: 55 });
    const r = (await ritView(repo, teacher, { classId })).rows.find((x) => x.studentId === ids[3])!;
    assert.deepEqual([r.national!.percentile, r.national!.estimated, r.national!.band], [55, false, "Avg"]);
  });

  test("levels from the class comparison; the grade view ranks across classes", async () => {
    const out = await levelsFromClassAverage(repo, teacher, classId);
    assert.deepEqual(out, { above: 3, on: 1, below: 2 });
    const lv = await studentLevels(repo, ids);
    assert.deepEqual([lv.get(ids[0]), lv.get(ids[3]), lv.get(ids[5])], [{ level: "ABOVE", source: "MAP_RIT" }, { level: "ON", source: "MAP_RIT" }, { level: "BELOW", source: "MAP_RIT" }]);
    const g = await ritView(repo, admin, { grade: 4 });
    assert.ok(g.summary.classAverages.length >= 1 && g.rows.length === 6);
  });

  test("norms: bundled once, updatable by admins only", async () => {
    assert.deepEqual(await nationalNorm(repo, 6, "SPRING").then((n) => [n?.mean, n?.sd]), [212, 17]);
    await assert.rejects(updateNationalNorms(repo, teacher, [{ grade: 4, season: "FALL", mean: 197, sd: 18 }], "x"), ForbiddenError);
    await updateNationalNorms(repo, admin, [{ grade: 4, season: "FALL", mean: 197, sd: 18 }], "NWEA 2026 norms");
    assert.equal((await nationalNorm(repo, 4, "FALL"))?.mean, 197);
    await ritView(repo, teacher, { classId });   // re-running never overwrites the admin's change
    assert.equal((await nationalNorm(repo, 4, "FALL"))?.mean, 197);
  });

  // 🐛 fix (audit finding, Oct 2026 — "صف 11 كله ON غلط"): national-norms.ts used to cover grades 4-6 only, and
  // once a school's database had ANY national-norm row, insertNorms() bailed out for good — so a school whose DB
  // was already seeded under the old (4-6-only) table could never pick up the newly-added grades on a later
  // deploy, even after national-norms.ts grew to cover them. This is grade 11, available in this test suite only
  // because that fell-back-to-the-platform-wide norms and nothing else; a school's real DB is this scenario exactly.
  test("a school already seeded with only grades 4-6: a later deploy's wider table still backfills the rest", async () => {
    const { repo: fresh } = await demoDatabase();
    const now = new Date();
    // simulate an old, already-seeded database: only grades 4-6 present (what insertNorms() used to insert)
    const rows = [4, 5, 6].flatMap((g) => ["FALL", "WINTER", "SPRING"].flatMap((season) => [
      { scope: "NATIONAL", metric: "MAP_READING_RIT_MEAN", gradeLevel: g, season, value: 200, source: "old seed", importedAt: now },
      { scope: "NATIONAL", metric: "MAP_READING_RIT_SD", gradeLevel: g, season, value: 18, source: "old seed", importedAt: now },
    ]));
    await fresh.createMany("BenchmarkReference", rows);
    await ensureNationalNorms(fresh);
    // grade 11 (not in the old seed) is now filled in from the current, wider national-norms.ts table
    assert.deepEqual(await nationalNorm(fresh, 11, "FALL").then((n) => [n?.mean, n?.sd]), [218, 18]);
    // an existing grade-4 row from the "old seed" is left exactly as it was — never overwritten by the backfill
    assert.deepEqual(await nationalNorm(fresh, 4, "FALL").then((n) => [n?.mean, n?.sd]), [200, 18]);
  });
});
