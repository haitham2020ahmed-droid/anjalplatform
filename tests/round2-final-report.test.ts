/**
 * Round 2 · Final Report (owner, 1 Nov 2026: "fix everything, linked to the same system"):
 *  - Questions / Accuracy / Minutes = the Practice and time numbers (practiceTotals): rapid guesses out of accuracy,
 *    tests counted apart;
 *  - growth = the change of the stars (starChange), no engine "paired growth" / regression banner;
 *  - the whole-class view = the single-student reports (built 3 at a time, plans once);
 *  - MAP grouped by subject; a missing plan says why;
 *  - alerts: every rule has a next step; a new ⭐ closes the skill's open alerts.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Period } from "../src/analytics/periods";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { practiceTotalsFor } from "../src/server/analytics/practice-totals";
import { finalReportForStudent, finalReportsForClass, groupMap } from "../src/server/reports/school-reports";
import { starChange } from "../src/server/skills/star-read";
import { NEXT_ACTION } from "../src/server/teacher/interventions";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank, simulatePractice } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);

describe("round 2 · Final Report on the one system", () => {
  let repo: SqliteRepo; let admin: Actor; let classId = ""; let s1 = "";
  const year: Period = { name: "SCHOOL_YEAR", label: "School year", from: ago(60), to: new Date(Date.now() + DAY) } as Period;

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    s1 = s((await repo.findUnique("Student", { userId: (await repo.findUnique("User", { username: "demo.s1001" }))!.id }))!.id);
    classId = s((await repo.findMany("ClassMembership", { studentId: s1 }))[0].classId);
    await simulatePractice(repo, ["demo.s1001"], [{ date: ago(5).toISOString().slice(0, 10), skill: "G4.theme" }]);
    // one rapid guess and one hour-long answer: neither may inflate the report
    const [a, b] = await repo.findMany("QuestionAttempt", { studentId: s1 });
    await repo.updateMany("QuestionAttempt", { id: a.id }, { rapidGuess: true });
    await repo.updateMany("QuestionAttempt", { id: b.id }, { responseMs: 3_600_000 });
  });

  test("KPIs are the Practice and time numbers; growth is the stars", async () => {
    const r = await finalReportForStudent(repo, admin, s1, year);
    const tot = await practiceTotalsFor(repo, s1, year.from, year.to, { days: true });
    assert.ok(tot.questions > 0);
    assert.deepEqual([r.kpis.questions, r.kpis.accuracyPct, r.kpis.minutes], [tot.questions, tot.accuracy, tot.minutes]);
    assert.ok(r.kpis.minutes < 60, "an hour-long answer counts at most 5 minutes");
    assert.deepEqual(r.otherAnswers, { tests: tot.bySource.TESTS, other: tot.bySource.OTHER });
    assert.deepEqual(r.starChange, (await starChange(repo, [s1], year.from, year.to)).get(s1));
    assert.equal(r.kpis.newStars, r.starChange.gained);
    assert.ok(!("regressionSignal" in r) && !("pairedGrowth" in r.kpis), "no engine-score growth or regression banner");
    assert.equal(r.period.name, "SCHOOL_YEAR");
    for (const m of r.missingPlans) assert.ok(["NO_MAP", "NO_CLASS"].includes(m.reason));
  });

  test("the whole class = each student's own report", async () => {
    const one = await finalReportForStudent(repo, admin, s1, year, { classId });
    const all = await finalReportsForClass(repo, admin, classId, year);
    const mine = all.reports.find((x) => x.studentId === s1)!;
    assert.deepEqual(mine.kpis, one.kpis);
    assert.deepEqual(mine.starChange, one.starChange);
    assert.equal(mine.className, all.className, "the class it was opened from");
    const src = readFileSync(join(process.cwd(), "src/server/reports/school-reports.ts"), "utf8");
    assert.doesNotMatch(src, /Promise\.all\(ids\.map/, "never every student at once");
  });

  test("MAP grouped by subject: overall RIT per test, change, the latest test's goal areas", () => {
    const g = groupMap([
      { testDate: "2025-09-15", subject: "Reading", goalArea: null, rit: 190, percentile: 40 },
      { testDate: "2025-09-15", subject: "Reading", goalArea: "Vocabulary", rit: 185, percentile: null },
      { testDate: "2026-01-20", subject: "Reading", goalArea: null, rit: 197, percentile: 52 },
      { testDate: "2026-01-20", subject: "Reading", goalArea: "Vocabulary", rit: 199, percentile: null },
      { testDate: "2026-01-20", subject: "Reading", goalArea: "Informational Text", rit: 192, percentile: null },
    ]);
    assert.equal(g.length, 1);
    assert.deepEqual(g[0].tests.map((x) => x.rit), [190, 197]);
    assert.equal(g[0].change, 7);
    assert.deepEqual(g[0].areas.map((x) => x.goal), ["Informational Text", "Vocabulary"], "latest test only, weakest first");
  });

  test("alerts: every rule has a next step; a new ⭐ closes the skill's open alerts", () => {
    for (const rule of ["NEEDS_SUPPORT", "REVIEW_FAILED", "LOW_ACCURACY", "DECLINING_MASTERY"] as const) assert.ok(NEXT_ACTION[rule].length > 10, rule);
    const status = readFileSync(join(process.cwd(), "src/server/skills/status.ts"), "utf8");
    const onStar = status.slice(status.indexOf("async function onStarEarned"), status.indexOf("async function onNeedsSupport"));
    assert.ok(onStar.includes('updateMany("InterventionAlert"') && onStar.includes("resolvedAt: null }, { resolvedAt: now })"));
  });

  test("the Arabic page has no hard-coded English labels", () => {
    const page = readFileSync(join(process.cwd(), "src/app/school-reports/final-report/page.tsx"), "utf8");
    for (const w of ['"Questions"', '"Accuracy"', '"Minutes"', "Goals:</b>", "Strengths:</b>", ">Date<", ">Percentile<", "Paired growth", "regression"]) assert.ok(!page.includes(w), w);
    assert.match(page, /<BySourceView r=\{r\.bySource\} lang=\{L\} \/>/);
  });
});

describe("round 2 · the star at a date (pairOfRows)", () => {
  const D = (d: number) => new Date(Date.UTC(2026, 9, d)).toISOString();
  const at = (d: number) => Date.UTC(2026, 9, d);
  test("no history: ⭐ from masteredAt on, even when the star is 🔄 now (a real drop)", async () => {
    const { pairOfRows } = await import("../src/server/skills/star-read");
    const p = pairOfRows([{ level: 1, status: "NEEDS_REVIEW", startedAt: D(1), masteredAt: D(5), history: null }], at(10), at(20), true);
    assert.deepEqual(p, { then: "MASTERED", now: "NEEDS_REVIEW" });
  });
  test("a level-up is never a drop: ⭐ at level 1, ◐ at level 2 = ☆⬆", async () => {
    const { pairOfRows, starChangeOf } = await import("../src/server/skills/star-read");
    const p = pairOfRows([
      { level: 1, status: "MASTERED", startedAt: D(1), masteredAt: D(5), history: null },
      { level: 2, status: "IN_PROGRESS", startedAt: D(12), masteredAt: null, history: null },
    ], at(10), at(20), true)!;
    assert.equal(p.now, "NEXT_LEVEL");
    const c = starChangeOf([p]);
    assert.equal(c.down, 0); assert.notEqual(c.trend, "DOWN");
  });
});
