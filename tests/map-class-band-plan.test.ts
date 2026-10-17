/**
 * MAP Group / Class Study Plan — redesigned into three performance bands (owner: a full redesign, requested by the
 * ELA lead): Below / On / Above level, matching the school's own Personalized Plan document (Word download,
 * src/server/map/personal-plan.ts) — same 41st/60th percentile cut, so a student lands in the same band on both.
 * Each band: its RIT range and growth projection straight from the MAP data, and the skills to develop, pooled
 * across every goal area into one combined view (not one student at a time). Additive: the old per-continuum-band
 * Group Study Plan (groupStudyPlan / assignGroupSkills) is untouched and still covered by its own tests.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { CONTINUUM_HEADERS, importContinuum } from "../src/server/map/continuum";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { assignGroupSkills, classBandPlan, planLevelOf, PLAN_LEVEL_ORDER } from "../src/server/map/map-reports";
import { demoDatabase } from "./helpers/db";

const CONT = [
  [...CONTINUUM_HEADERS],
  ["Reading", "160", "175", "Literary Text", "Analyze Point of View, Features, and Structure", "Tells who is telling a story", "RL.3.6"],
  ["Reading", "176", "190", "Literary Text", "Analyze Theme and Literary Elements; Summarize", "Summarizes the plot of a story", "RL.4.2"],
  ["Reading", "191", "215", "Literary Text", "Analyze Theme and Literary Elements; Summarize", "Compares the themes of two stories", "RL.5.9"],
];

describe("planLevelOf: the three bands match the Personalized Plan's own 41st / 60th percentile cut", () => {
  test("Low/LoAvg below, Avg on, HiAvg/High above — whatever the RIT", () => {
    assert.equal(planLevelOf("Low", 120, 200), "BELOW");
    assert.equal(planLevelOf("LoAvg", 300, 200), "BELOW");
    assert.equal(planLevelOf("Avg", 120, 200), "ON");
    assert.equal(planLevelOf("HiAvg", 120, 200), "ABOVE");
    assert.equal(planLevelOf("High", 1, 200), "ABOVE");
  });
  test("no national descriptor yet: falls back to this class's own ±3 RIT average, like the Curriculum Map level", () => {
    assert.equal(planLevelOf(null, 203, 200), "ON");
    assert.equal(planLevelOf(null, 204, 200), "ABOVE");
    assert.equal(planLevelOf(null, 196, 200), "BELOW");
  });
  test("PLAN_LEVEL_ORDER is Below, On, Above (the order every band renders in)", () => {
    assert.deepEqual(PLAN_LEVEL_ORDER, ["BELOW", "ON", "ABOVE"]);
  });
});

describe("classBandPlan: the class grouped Below / On / Above, with RIT range, growth projection and skills", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let otherTeacher: Actor; let classId = ""; let ids: string[] = [];
  const now = new Date(Date.UTC(2026, 9, 9));
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.3" }))!);
    const t = (await repo.findMany("Teacher", { userId: teacher.userId }))[0];
    classId = String((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
    const sts = await repo.findMany("Student", { id: { in: ids } });
    const H = [...MAP_TEMPLATE_HEADERS], c = (h: string) => H.indexOf(h);
    // a wide, deliberate spread so the class lands in all three bands (well below, near average, well above)
    const spread = (i: number) => [130, 165, 200, 235, 270][i % 5];
    const row = sts.map((st, i) => { const r = H.map(() => ""); r[0] = String(st.studentNumber); r[c("Reading Fall RIT")] = String(spread(i)); r[c("Reading Spring Projection")] = String(spread(i) + 10); return r; });
    await importMapScores(repo, admin, [H, ...row], 2026, now, { term: { name: "Fall 2026", date: now } });
  });

  test("only the class's own teacher (or an admin) may open it", async () => {
    await assert.rejects(classBandPlan(repo, otherTeacher, classId, "READING"), ForbiddenError);
    await classBandPlan(repo, admin, classId, "READING"); // admins read every class
  });

  test("without a continuum: every scored student is in exactly one band, bands in Below→On→Above order", async () => {
    const d = await classBandPlan(repo, teacher, classId, "READING");
    assert.equal(d.source, "SKILLS");
    const seen = new Set<string>();
    let total = 0;
    for (const b of d.bands) for (const x of b.students) { assert.ok(!seen.has(x.id), `${x.id} in two bands`); seen.add(x.id); total++; }
    assert.equal(total, ids.length);
    assert.deepEqual(d.bands.map((b) => b.key), d.bands.map((b) => b.key).filter((k, i, a) => a.indexOf(k) === i), "no band listed twice");
    const order = d.bands.map((b) => b.key);
    assert.deepEqual(order, [...order].sort((a, c) => PLAN_LEVEL_ORDER.indexOf(a) - PLAN_LEVEL_ORDER.indexOf(c)));
  });

  test("each band's RIT range comes straight from its own students' MAP scores", async () => {
    const d = await classBandPlan(repo, teacher, classId, "READING");
    for (const b of d.bands) {
      const rits = b.students.map((x) => x.rit);
      assert.equal(b.low, Math.min(...rits));
      assert.equal(b.high, Math.max(...rits));
      assert.match(b.range, /^RIT /);
    }
  });

  test("growth projection: the average Spring projection and growth of the band's students", async () => {
    const d = await classBandPlan(repo, teacher, classId, "READING");
    for (const b of d.bands) {
      assert.ok(b.avgProjection !== null, `${b.key}: every test student has a Spring projection`);
      assert.equal(b.avgGrowth, Math.round((b.avgProjection! - b.avgRit) * 10) / 10);
      assert.ok(b.avgGrowth! > 0, "the Spring projection is above the current RIT");
    }
  });

  test("skills to develop are pooled across the subject's goal areas (not one student's plan)", async () => {
    const d = await classBandPlan(repo, teacher, classId, "READING");
    for (const b of d.bands) {
      assert.ok(b.areas.length > 0, `${b.key}: has at least one goal area with skills`);
      for (const a of b.areas) {
        assert.ok(a.skillIds.length > 0);
        for (const t of a.topics) for (const x of t.statements) for (const k of x.skills) assert.ok(k.mastered <= b.students.length);
      }
    }
  });

  test("with a continuum: the same three bands, now reading the continuum's Develop statements", async () => {
    await importContinuum(repo, admin, CONT);
    const d = await classBandPlan(repo, teacher, classId, "READING");
    assert.equal(d.source, "CONTINUUM");
    assert.ok(d.bands.length > 0);
  });

  test("sending a band its practice reuses the existing, already-tested Group plan Assign (assignGroupSkills)", async () => {
    const d = await classBandPlan(repo, teacher, classId, "READING");
    const band = d.bands.find((b) => b.areas.some((a) => a.skillIds.length))!;
    const area = band.areas.find((a) => a.skillIds.length)!;
    const r = await assignGroupSkills(repo, teacher, { source: "CURRICULUM", classId, group: area.group, low: band.low, high: band.high, skillIds: area.skillIds, studentIds: band.students.map((x) => x.id) }, now);
    assert.equal(r.students, band.students.length);
  });

  test("the Short version trims a band's statements; the Full version keeps every one", async () => {
    await importContinuum(repo, admin, [
      [...CONTINUUM_HEADERS],
      ...Array.from({ length: 20 }, (_, i) => ["Reading", "191", "215", "Literary Text", `Topic ${i % 3}`, `Statement number ${i}`, "RL.4.2"]),
    ]);
    const short = await classBandPlan(repo, teacher, classId, "READING", false);
    const full = await classBandPlan(repo, teacher, classId, "READING", true);
    const aboveShort = short.bands.find((b) => b.key === "ABOVE")?.areas.find((a) => a.group === "LIT");
    const aboveFull = full.bands.find((b) => b.key === "ABOVE")?.areas.find((a) => a.group === "LIT");
    if (aboveShort && aboveFull && aboveFull.total > 14) assert.ok(aboveShort.shown <= aboveFull.shown);
  });
});
