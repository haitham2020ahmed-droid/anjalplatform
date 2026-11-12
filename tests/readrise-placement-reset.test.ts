/**
 * 🔄 ReadRise admin "Reset placement" + the placement move fix (owner, 4 Nov 2026) — FAKE data only.
 *  - from 1200 up a 2 of 3 is not a pass, so it no longer moves the test up (it stays for another passage);
 *  - doubtful results: placed before 30 Oct 2026, far from MAP, or weak own readings;
 *  - a reset lets the student take the test again; the level stays until it ends; the new result replaces the start
 *    level too; it never uses up the teacher's retake of the term; admins only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { parsePlacement, type PlacementPassage } from "../src/server/readrise/content-loader";
import { answerPlacement, placementPlan, placementStatus, placementView, startPlacement, teacherResetPlacement, type PlacementStep } from "../src/server/readrise/placement";
import { adminResetPlacements, resetCandidates } from "../src/server/readrise/placement-reset";
import { classReport } from "../src/server/readrise/dashboards";
import { demoDatabase } from "./helpers/db";

const PASSAGES: PlacementPassage[] = parsePlacement({
  passages: RR_LEVELS.flatMap((level) => [1, 2, 3].map((k) => ({ id: `P${level}-${k}`, level, title: `P ${level}/${k}`, text: "Text.", questions: [1, 2, 3].map((n) => ({ stem: `Q${n}`, options: ["a", "b", "c", "d"], answer: "A", skill: "detail" })) }))),
});
const OLD = new Date("2026-10-20T08:00:00Z");
const NOW = new Date("2026-11-04T08:00:00Z");

async function takeTest(repo: SqliteRepo, s: Actor, at: Date, answers: (step: number) => string[]): Promise<number | null> {
  const pid = await startPlacement(repo, s, at);
  for (let i = 0; i < 12; i++) {
    const v = await placementView(repo, s, PASSAGES, at);
    if (v.state !== "IN_PROGRESS") break;
    const a = await answerPlacement(repo, s, pid, v.passage!.id, answers(i), PASSAGES, new Date(at.getTime() + (i + 1) * 60_000));
    if (a.done) return a.result;
  }
  return null;
}

describe("🔄 ReadRise: admin reset placement and the 2-of-3 move fix", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let st: Actor[];
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorOf("test.admin");
    teacher = await actorOf("test.teacher.1");
    st = await Promise.all(["001", "002", "003"].map((x) => actorOf(`test.student.${x}`)));
  });

  test("the move fix: 2 of 3 at 1200+ stays at the same level (not up); 2 of 3 below 1200 still goes up", () => {
    const step = (level: number, correct: number, k = 1): PlacementStep => ({ level, passageId: `P${level}-${k}`, answers: [], correct });
    assert.equal(placementPlan(1300, [step(1300, 2)], PASSAGES).nextLevel, 1300, "2/3 at 1300: another 1300 passage");
    assert.equal(placementPlan(1300, [step(1300, 3)], PASSAGES).nextLevel, 1500, "3/3 at 1300: +200");
    assert.equal(placementPlan(900, [step(900, 2)], PASSAGES).nextLevel, 1000, "2/3 at 900: +100 (unchanged)");
    const p = placementPlan(1300, [step(1300, 2, 1), step(1300, 2, 2)], PASSAGES);
    assert.equal(p.nextLevel, 1300, "still 1300 (third passage there)"); assert.equal(p.reversals, 0, "a stay is not a reversal");
  });

  test("doubtful list, reset, retake from a fresh start, and the start level replaced", async () => {
    const s = st[0], sid = s.studentId!;
    // an old (pre-fix) placement that ended high
    const old = await takeTest(repo, s, OLD, () => ["A", "A", "A"]);
    // round 10: the grade cap keeps even an "all right" test within the grade (+150), so the old result is no longer 1400+
    assert.ok(old !== null && old >= 1000, `old result ${old}`);
    const doubt = await resetCandidates(repo, admin, { doubtful: true });
    const row = doubt.find((x) => x.studentId === sid);
    assert.ok(row, "listed as doubtful"); assert.match(row!.reasons.join(" "), /before the placement fix/);
    await assert.rejects(adminResetPlacements(repo, teacher, [sid]), /Only admins/);
    const r = await adminResetPlacements(repo, admin, [sid], "Grade 11 before the fix", NOW);
    assert.equal(r.reset, 1);
    const status = await placementStatus(repo, sid, NOW);
    assert.equal(status.canStart, true); assert.equal(status.retake, true);
    assert.equal(Number((await repo.findUnique("RRStudent", { studentId: sid }))!.level), old, "the level stays until the new test ends");
    assert.equal((await resetCandidates(repo, admin, { doubtful: true })).find((x) => x.studentId === sid)?.pending, true, "shown as waiting");
    // round 9 review: the teacher's class page shows the retake waiting (🔄)
    const cls = String((await repo.findMany("ClassMembership", { studentId: sid }))[0].classId);
    const rep = await classReport(repo, admin, cls, NOW);
    assert.equal(rep.students.find((x) => x.studentId === sid)?.retakeWaiting, true);
    assert.ok(rep.summary.retakeWaiting >= 1);
    assert.equal((await adminResetPlacements(repo, admin, [sid], "", NOW)).skipped, 1, "a second reset: nothing to do");
    // the teacher's retake of the term is not used up by the admin reset (the retake is just already waiting)
    await assert.rejects(teacherResetPlacement(repo, admin, sid, "", NOW), /already allowed/);
    // the new test: a weak reader
    const fresh = await takeTest(repo, s, new Date(NOW.getTime() + 3_600_000), () => ["B", "B", "B"]);
    assert.ok(fresh !== null && fresh < old!, `new result ${fresh} below ${old}`);
    const rr = (await repo.findUnique("RRStudent", { studentId: sid }))!;
    assert.equal(Number(rr.level), fresh);
    assert.equal((await classReport(repo, admin, cls, new Date(NOW.getTime() + 7_200_000))).students.find((x) => x.studentId === sid)?.retakeWaiting, false, "done: no longer waiting"); assert.equal(Number(rr.startLevel), fresh, "the start level is replaced (fresh start)");
    const hist = await repo.findMany("RRLevelChange", { studentId: sid });
    assert.ok(hist.some((c) => String(c.reason).includes("(admin reset): Grade 11 before the fix")), "the reset is in the level history");
    assert.ok((await repo.findMany("RRPlacement", { studentId: sid })).length >= 2, "nothing deleted");
  });

  test("a never-placed student is not listed and is skipped; an open test is restarted", async () => {
    const sid = st[1].studentId!;
    assert.equal((await resetCandidates(repo, admin, {})).some((x) => x.studentId === sid), false);
    assert.equal((await adminResetPlacements(repo, admin, [sid], "", NOW)).skipped, 1);
    const pid = await startPlacement(repo, st[1], NOW);
    const v = await placementView(repo, st[1], PASSAGES, NOW);
    await answerPlacement(repo, st[1], pid, v.passage!.id, ["A", "A", "A"], PASSAGES, new Date(NOW.getTime() + 60_000));
    assert.equal((await adminResetPlacements(repo, admin, [sid], "", NOW)).restarted, 1);
    const p = (await repo.findUnique("RRPlacement", { id: pid }))!;
    assert.equal((typeof p.steps === "string" ? JSON.parse(p.steps) : p.steps).length, 0, "back to the first passage");
  });
});
