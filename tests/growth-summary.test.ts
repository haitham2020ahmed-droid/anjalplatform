/**
 * Class / grade / school growth uses PAIRED skill growth (decision after Phase 13).
 * Scenario from the Phase 10 review: students improve on every skill they practise
 * but keep starting new skills, so their overall average falls. The old calculation
 * showed the class as declining (-13.9 in the demo); the class figure must now agree
 * with the students' paired growth.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolvePeriod } from "../src/analytics/periods";
import { mean, round1 } from "../src/analytics/stats";
import { resolveActor } from "../src/server/auth/actor";
import { loadCalendar } from "../src/server/analytics/calendar";
import { groupGrowth, pairedGrowth, studentGrowth } from "../src/server/analytics/growth";
import { classComparison } from "../src/server/analytics/reports";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank, simulatePractice } from "./helpers/practice";

describe("class growth uses paired skill growth", () => {
  let repo: SqliteRepo;
  const students = ["demo.s1001", "demo.s1002", "demo.s1003"];
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    // same pattern as the report preview: a skill revisited later, plus new skills started on the way
    await simulatePractice(repo, students, [
      { date: "2026-09-15", skill: "G4.theme" }, { date: "2026-10-15", skill: "G4.context-clues" }, { date: "2026-11-15", skill: "G4.central-idea" }, { date: "2026-12-01", skill: "G4.theme" },
    ]);
  });

  test("the class figure is the mean of each student's paired growth, not the change in overall average", async () => {
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const period = resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, admin.schoolId!), new Date("2026-12-20T09:00:00Z"));
    const ids = await Promise.all(students.map(async (u) => String((await repo.findUnique("Student", { userId: (await repo.findUnique("User", { username: u }))!.id }))!.id)));
    const per = await Promise.all(ids.map((id) => studentGrowth(repo, id, period)));
    const paired = per.map(pairedGrowth).filter((x): x is number => x !== null);
    const overall = per.map((g) => g.growth).filter((x): x is number => x !== null);
    assert.ok(paired.length === students.length, "every student has at least one paired skill");
    assert.ok(paired.every((x) => x > 0), `students improved on their skills: ${paired}`);
    assert.ok(round1(mean(overall))! < 0, `scenario check: the overall average falls (${round1(mean(overall))})`);

    const g = await groupGrowth(repo, ids, period);
    assert.equal(g.meanGrowth, round1(mean(paired)));
    assert.ok(g.meanGrowth! > 0, "the class shows growth, as its students do");

    const classId = String((await repo.findMany("ClassMembership", { studentId: ids[0] }))[0].classId);
    const c = await classComparison(repo, admin, classId, period);
    assert.equal(c.rows[0].meanGrowth, g.meanGrowth, "comparison table (screen and class report) uses the same figure");
  });
});
