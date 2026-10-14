/**
 * 🗓️ ReadRise placement THREE times a year (owner r69 item 1): the first placement (start of year, required), then a
 * "Check your reading level" in the middle and end windows (from the school's assessment plan / terms; default end =
 * the last 6 weeks). A check sets the level but keeps the year's start, so growth runs start → middle → end. A teacher
 * can still allow an extra retake.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { parsePlacement, type PlacementPassage } from "../src/server/readrise/content-loader";
import { answerPlacement, placementStatus, placementView, startPlacement, teacherResetPlacement } from "../src/server/readrise/placement";
import { readRiseHome } from "../src/server/readrise/student";
import { studentGrowthReport } from "../src/server/readrise/growth-report";
import { dueCheck, loadReadRiseWindows, periodOf, placementChecks, readRiseWindows } from "../src/server/readrise/windows";
import { CYCLE_KEY, defaultCycle } from "../src/server/assessment-cycle/cycle";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const PASSAGES: PlacementPassage[] = parsePlacement({
  passages: RR_LEVELS.flatMap((level) => [1, 2, 3].map((k) => ({ id: `P${level}-${k}`, level, title: `P ${level}/${k}`, text: "Text.", questions: [1, 2, 3].map((n) => ({ stem: `Q${n}`, options: ["a", "b", "c", "d"], answer: "A", skill: "detail" })) }))),
});
const pAns = (right: number) => [0, 1, 2].map((i) => (i < right ? "A" : "B"));
const D = (iso: string, h = 8) => new Date(`${iso}T${String(h).padStart(2, "0")}:00:00Z`);

/** Takes the whole placement; `right(n)` = correct answers on passage n. */
async function takePlacement(repo: SqliteRepo, s: Actor, now: Date, right: (n: number) => number): Promise<number> {
  const pid = await startPlacement(repo, s, now);
  let n = 0, res;
  do {
    const v = await placementView(repo, s, PASSAGES, now);
    assert.equal(v.state, "IN_PROGRESS");
    res = await answerPlacement(repo, s, pid, v.passage!.id, pAns(right(n)), PASSAGES, new Date(now.getTime() + n * 60_000));
    n++;
  } while (!res.done);
  return res.result!;
}

describe("🗓️ ReadRise: three reading checks a year", () => {
  test("windows (pure): start / middle / end; default end = the last 6 weeks; the middle from the terms or half way", () => {
    const w = readRiseWindows({ yearStart: "2026-08-23", yearEnd: "2027-06-10", midOpens: "2027-01-10" });
    assert.deepEqual(w.BOY, { opens: "2026-08-23", closes: "2027-01-09" });
    assert.deepEqual(w.MOY, { opens: "2027-01-10", closes: "2027-04-28" });
    assert.deepEqual(w.EOY, { opens: "2027-04-29", closes: "2027-06-10" }, "the last 6 weeks");
    const half = readRiseWindows({ yearStart: "2026-08-23", yearEnd: "2027-06-10" });
    assert.ok(half.MOY.opens > "2026-12-01" && half.MOY.opens < "2027-01-31", "half way when no date is given");
    assert.equal(readRiseWindows({ yearStart: "2026-08-23", yearEnd: "2027-06-10", midOpens: "2027-05-30" }).MOY.opens, half.MOY.opens, "a middle date inside the end window is ignored");
    assert.equal(periodOf(w, D("2026-09-01")), "BOY");
    assert.equal(periodOf(w, D("2027-02-01")), "MOY");
    assert.equal(periodOf(w, D("2027-05-20")), "EOY");
    // due: only for a placed student, only middle / end, only once per window
    assert.equal(dueCheck(w, D("2027-02-01"), []), null, "never placed: the first placement, not a check");
    assert.equal(dueCheck(w, D("2026-10-01"), [D("2026-09-01")]), null, "the start of the year is the first placement");
    assert.equal(dueCheck(w, D("2027-02-01"), [D("2026-09-01")]), "MOY");
    assert.equal(dueCheck(w, D("2027-02-01"), [D("2026-09-01"), D("2027-01-20")]), null, "done in this window");
    assert.equal(dueCheck(w, D("2027-05-01"), [D("2026-09-01"), D("2027-01-20")]), "EOY");
    // the year's three results (the latest of each period)
    const c = placementChecks(w, [
      { completedAt: D("2026-09-01"), result: 600 }, { completedAt: D("2026-09-20"), result: 650, period: "BOY" },
      { completedAt: D("2027-01-20"), result: 720, period: "MOY" }, { completedAt: D("2025-09-01"), result: 400 }, { completedAt: null, result: null },
    ]);
    assert.deepEqual([c.BOY?.level, c.MOY?.level, c.EOY], [650, 720, null], "last year's test is left out");
  });

  describe("with a school's saved assessment plan", () => {
    let repo: SqliteRepo; let s: Actor; let teacher: Actor; /* a school admin (reads every class) */ let schoolId: string; let classId: string;
    const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
      [s, teacher] = await Promise.all(["test.student.004", "test.admin"].map(actorOf));
      schoolId = String(s.schoolId);
      classId = String((await repo.findMany("ClassMembership", { studentId: s.studentId!, leftAt: null }))[0].classId);
      // the school's plan for 2026-2027: MOY window from 2027-01-10, EOY from 2027-05-16
      await repo.create("SchoolSetting", { schoolId, key: CYCLE_KEY, value: defaultCycle(D("2026-09-01")) as unknown as Record<string, unknown> });
    });

    test("the windows come from the saved plan", async () => {
      const w = await loadReadRiseWindows(repo, schoolId, D("2026-09-01"));
      const c = defaultCycle(D("2026-09-01"));
      assert.deepEqual([w.yearStart, w.MOY.opens, w.EOY.opens, w.yearEnd], [c.yearStart, c.diagnostic.MOY.opens, c.diagnostic.EOY.opens, c.yearEnd]);
    });

    test("start → middle → end: the card shows in each window, the start is kept, growth compares the three", async () => {
      const c = defaultCycle(D("2026-09-01"));
      // the first placement (start of the year)
      const start = await takePlacement(repo, s, D("2026-09-06"), (n) => (n % 2 ? 1 : 2));
      const rr0 = (await repo.findUnique("RRStudent", { studentId: s.studentId }))!;
      assert.deepEqual([Number(rr0.startLevel), Number(rr0.level), rr0.source], [start, start, "PLACEMENT"]);
      assert.equal((await repo.findMany("RRPlacement", { studentId: s.studentId }))[0].period, "BOY");
      // nothing due before the middle window
      assert.equal((await placementStatus(repo, s.studentId!, D("2026-12-01"))).due, null);
      assert.equal((await readRiseHome(repo, s, {}, D("2026-12-01"), PASSAGES)).placement.state, "NONE");
      // middle of the year: "Check your reading level"
      const mid = D(c.diagnostic.MOY.opens, 9);
      const st = await placementStatus(repo, s.studentId!, mid);
      assert.deepEqual([st.due, st.canStart, st.retake], ["MOY", true, false]);
      const home = await readRiseHome(repo, s, {}, mid, PASSAGES);
      assert.equal(home.placement.state, "CHECK");
      assert.equal((await placementView(repo, s, PASSAGES, mid)).check, "MOY");
      const middle = await takePlacement(repo, s, mid, () => 3);
      const rr1 = (await repo.findUnique("RRStudent", { studentId: s.studentId }))!;
      assert.equal(Number(rr1.level), middle);
      assert.equal(String(rr1.placedAt), String(rr0.placedAt), "the start of the year is kept");
      assert.ok(Number(rr1.startLevel) === start, "startLevel stays the start");
      const p = (await repo.findMany("RRPlacement", { studentId: s.studentId })).find((x) => Number(x.result) === middle && x.period === "MOY");
      assert.ok(p, "the middle check is stored with its period");
      const ch = (await repo.findMany("RRLevelChange", { studentId: s.studentId })).map((x) => String(x.reason));
      assert.ok(ch.some((r) => /^Placement \(middle of year reading check\): \d+ passages, result \d+/.test(r)), ch.join(" | "));
      // done for this window: no card
      assert.equal((await placementStatus(repo, s.studentId!, new Date(mid.getTime() + 86_400_000))).due, null);
      assert.equal((await readRiseHome(repo, s, {}, new Date(mid.getTime() + 86_400_000), PASSAGES)).placement.state, "NONE");
      // end of the year
      const end = D(c.diagnostic.EOY.opens, 9);
      assert.equal((await placementStatus(repo, s.studentId!, end)).due, "EOY");
      const last = await takePlacement(repo, s, end, (n) => (n < 2 ? 3 : 2));
      const h = await readRiseHome(repo, s, {}, new Date(end.getTime() + 3_600_000), PASSAGES);
      assert.deepEqual([h.placement.checks!.BOY?.level, h.placement.checks!.MOY?.level, h.placement.checks!.EOY?.level], [start, middle, last]);
      assert.equal(h.summary.startLevel, start, "growth since the start of the year");
      // the teacher's student page shows the three checks
      const g = await studentGrowthReport(repo, teacher, classId, s.studentId!, new Date(end.getTime() + 3_600_000));
      assert.deepEqual([g.checks.BOY?.level, g.checks.MOY?.level, g.checks.EOY?.level], [start, middle, last]);
      assert.ok(g.history.filter((e) => e.kind === "PLACEMENT").length >= 3, "each check is a point on the level line");
      await afterResponseSettled();
    });

    test("without a saved plan: the school year and its middle term (Terms), the end = the last 6 weeks", async () => {
      const other = String((await repo.findMany("School", {})).find((x) => x.id !== schoolId)!.id);
      await repo.updateMany("AcademicYear", { schoolId: other }, { isCurrent: false });
      const y = await repo.create("AcademicYear", { schoolId: other, name: "LS3 2026-2027", startDate: D("2026-08-30", 0), endDate: D("2027-06-17", 0), isCurrent: true });
      for (const [name, start, end] of [["T1", "2026-08-30", "2026-11-19"], ["T2", "2026-11-29", "2027-03-04"], ["T3", "2027-03-14", "2027-06-17"]]) await repo.create("Term", { academicYearId: y.id, name, startDate: D(start, 0), endDate: D(end, 0) });
      const w = await loadReadRiseWindows(repo, other, D("2026-10-01"));
      assert.deepEqual([w.yearStart, w.MOY.opens, w.EOY.opens, w.EOY.closes], ["2026-08-30", "2026-11-29", "2027-05-06", "2027-06-17"]);
    });

    test("a teacher can still allow an extra retake (outside the windows), and not while a check is open", async () => {
      const other = await actorOf("test.student.005");
      await takePlacement(repo, other, D("2026-09-07"), () => 2);
      await teacherResetPlacement(repo, teacher, other.studentId!, "Was unwell", D("2026-10-01"));
      const st = await placementStatus(repo, other.studentId!, D("2026-10-02"));
      assert.deepEqual([st.retake, st.due, st.canStart], [true, null, true]);
      await takePlacement(repo, other, D("2026-10-02"), () => 3);
      const rr = (await repo.findUnique("RRStudent", { studentId: other.studentId }))!;
      assert.equal(Number(rr.startLevel), Number(rr.level), "a retake at the start of the year sets the start again");
      const mid = D(defaultCycle(D("2026-09-01")).diagnostic.MOY.opens, 9);
      await assert.rejects(teacherResetPlacement(repo, teacher, other.studentId!, "x", mid), /reading check is open/);
    });
  });
});
