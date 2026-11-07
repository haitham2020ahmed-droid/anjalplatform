/**
 * 📉📈 ReadRise level rules (owner r69 item 2): faster DOWN, careful UP — pure and end to end.
 *   one first-try score ≤ 25% → −100 at once · two first-try scores in a row < 50% → −100 ·
 *   latest ≥ 75% and 3 of the last 4 ≥ 75% → +50 · never below RR_FLOOR −400 (round 6; was 200) / above 1700 (100 above the top version, 1600) · plain-word reasons for the teacher.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { ENGINE, clampEngine, countsForLevel, levelDecision, setLevelByTeacher } from "../src/server/readrise/engine";
import { finishReading, startRun, submitActivity, submitPostPoll, submitPrePoll, submitWriting } from "../src/server/readrise/student";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z");
const at = (d: number, h = 0) => new Date(T0.getTime() + d * DAY + h * 3_600_000);
const answers = (right: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < right ? "A" : "B"]));
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");

async function makeArticle(repo: SqliteRepo, code: string): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic: "Science", summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
  const id = String(a.id);
  for (const level of RR_LEVELS) await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body: `Bees ${"make honey ".repeat(40)}`, wordCount: 81, estLevel: level });
  for (const band of ["LOW", "MID", "HIGH"]) for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `Q${n}?`, options: ["r", "w", "w", "w"], answer: "A", skill: "detail" });
  return id;
}
async function read(repo: SqliteRepo, s: Actor, articleId: string, right: number, now: Date, stretch = false) {
  const v = await startRun(repo, s, articleId, { stretch }, now);
  if (!stretch) await submitPrePoll(repo, s, v.runId, 1, now); // round 6: a stretch is Stretch Read → Stretch Respond only
  await finishReading(repo, s, v.runId, { readSeconds: 120 }, now);
  const q = await submitActivity(repo, s, v.runId, answers(right), now);
  if (stretch) return q;
  await submitPostPoll(repo, s, v.runId, 2, now); // round 6: Reflect before Write
  return submitWriting(repo, s, v.runId, WRITING, now);
}

describe("📉📈 ReadRise level rules", () => {
  test("pure (round 9): one bad score never moves it; two in a row under 50% → −50; two ≤ 25% → −100; 3 of 4 under 50% → −50; quick way back; 3 of 4 at 75%+ → +50", () => {
    assert.deepEqual([ENGINE.floor, ENGINE.downStep, ENGINE.downSmall, ENGINE.step, ENGINE.returnReads, ENGINE.min, ENGINE.max], [25, 100, 50, 50, 2, -400, 1700]);
    // one bad article alone: no move (a bad day, a strange topic)
    for (const sc of [[0], [25], [90, 90, 10], [80, 80, 80, 25]]) assert.equal(levelDecision(sc).delta, 0, sc.join(","));
    // two in a row
    assert.equal(levelDecision([49, 49]).delta, -50);
    assert.equal(levelDecision([25, 10]).delta, -100, "two very low in a row: far too hard");
    assert.equal(levelDecision([26, 10]).delta, -50);
    assert.equal(levelDecision([49, 50]).delta, 0, "50% is not under 50%");
    assert.equal(levelDecision([40, 80, 40]).delta, 0, "not in a row, only 2 of 3");
    // 3 of the last 4 under 50% with the latest under 50%
    assert.equal(levelDecision([40, 80, 30, 45]).delta, -50);
    assert.equal(levelDecision([40, 30, 45, 80]).delta, 0, "the latest is fine");
    // the quick way back after an automatic drop
    assert.equal(levelDecision([80, 85], { afterDrop: true }).delta, 50);
    assert.equal(levelDecision([80, 85]).delta, 0, "without a drop: 3 of 4 are needed");
    assert.equal(levelDecision([80, 70], { afterDrop: true }).delta, 0);
    // up (unchanged)
    assert.equal(levelDecision([75, 75, 75]).delta, 50);
    assert.equal(levelDecision([30, 75, 80, 90]).delta, 50, "3 of the last 4");
    assert.equal(levelDecision([75, 75, 74]).delta, 0, "the latest must be 75%+");
    assert.equal(levelDecision([]).delta, 0);
    // plain words for the teacher
    assert.match(levelDecision([20, 10]).reason!, /the last two first-try scores were both 25% or lower \(20% and 10%\), so the articles were far too hard/);
    assert.match(levelDecision([45, 30]).reason!, /the last two first-try scores were both under 50% \(45% and 30%\)/);
    assert.match(levelDecision([80, 90], { afterDrop: true }).reason!, /back up after the drop: the last 2 first-try scores were 75% or higher \(80% and 90%\)/);
    assert.match(levelDecision([80, 90, 100]).reason!, /3 of the last 3 first-try scores were 75% or higher \(latest 100%\)/);
    // limits
    assert.deepEqual([clampEngine(150), clampEngine(-500), clampEngine(1800), clampEngine(844)], [150, -400, 1700, 840]); // round 6: below 300 is real
    // an Unreliable run never takes part
    assert.equal(countsForLevel({ firstTry: true, score: 10, unreliable: true }), false);
    assert.equal(countsForLevel({ firstTry: true, score: 10 }), true);
  });

  describe("end to end", () => {
    let repo: SqliteRepo; let teacher: Actor; let st: Actor[]; let arts: string[];
    const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const lvl = async (s: Actor) => Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.level);
    const reasons = async (s: Actor) => (await repo.findMany("RRLevelChange", { studentId: s.studentId })).map((c) => String(c.reason));

    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
      teacher = await actorOf("test.teacher.1");
      st = await Promise.all(["001", "002", "003"].map((t) => actorOf(`test.student.${t}`)));
      arts = [];
      for (let i = 0; i < 12; i++) arts.push(await makeArticle(repo, `LR-${i}`));
    });

    test("round 9: one very low score does not move it; a second one in a row → −100; two strong reads bring it back", async () => {
      const s = st[0];
      await setLevelByTeacher(repo, teacher, s.studentId!, 950, "old default start", at(0));
      const d1 = await read(repo, s, arts[0], 1, at(1)); // 13%
      assert.equal(await lvl(s), 950, "one bad article never moves the level");
      assert.deepEqual([d1.done!.levelBefore, d1.done!.levelAfter], [950, 950]);
      await read(repo, s, arts[1], 2, at(1, 1)); // 25%: two in a row ≤ 25%
      assert.equal(await lvl(s), 850);
      const r = await reasons(s);
      assert.ok(r.some((x) => /^Down 100: the last two first-try scores were both 25% or lower \(13% and 25%\)/.test(x)), r.join(" | "));
      await read(repo, s, arts[2], 6, at(2)); // 75%
      assert.equal(await lvl(s), 850);
      await read(repo, s, arts[3], 7, at(2, 1)); // 88% → the quick way back
      assert.equal(await lvl(s), 900);
      assert.ok((await reasons(s)).some((x) => /^Up 50: back up after the drop/.test(x)));
      // the teachers were told about the drop (information only)
      await afterResponseSettled();
      const notes = await repo.findMany("Notification", { title: { contains: "ReadRise 950L → 850L" } });
      assert.ok(notes.length >= 1, "a notification for the teacher");
      assert.match(String(notes[0].body), /This happens automatically/);
    });

    test("two in a row under 50% → −50; one low score between highs does not move it; up stays +50", async () => {
      const s = st[1];
      await setLevelByTeacher(repo, teacher, s.studentId!, 800, "", at(0));
      await read(repo, s, arts[0], 3, at(1)); // 38%
      assert.equal(await lvl(s), 800);
      await read(repo, s, arts[1], 7, at(1, 1)); // 88%: breaks the run
      await read(repo, s, arts[2], 3, at(1, 2)); // 38%
      assert.equal(await lvl(s), 800, "the low scores were not in a row");
      await read(repo, s, arts[3], 3, at(1, 3)); // 38% → two in a row (and 3 of 4)
      assert.equal(await lvl(s), 750, "round 9: −50 (was −100)");
      // after the drop: 2 strong reads in a row → back up
      await read(repo, s, arts[4], 4, at(2)); // 50%
      await read(repo, s, arts[5], 7, at(2, 1)); // 88%
      assert.equal(await lvl(s), 750);
      await read(repo, s, arts[6], 8, at(2, 2)); // 100% → two in a row at 75%+
      assert.equal(await lvl(s), 800);
      // then the usual rule: 3 of the last 4 at 75%+
      await read(repo, s, arts[7], 7, at(3));
      await read(repo, s, arts[8], 7, at(3, 1));
      assert.equal(await lvl(s), 800, "the quick way back is only after a drop");
      await read(repo, s, arts[9], 8, at(3, 2));
      assert.equal(await lvl(s), 850, "+50 (unchanged)");
      assert.ok((await reasons(s)).some((x) => /^Up 50: 3 of the last 3 first-try scores were 75% or higher/.test(x)));
      await afterResponseSettled();
    });

    test("floor RR_FLOOR (−400, round 6; was 200); a stretch never lowers the level; a re-read never counts", async () => {
      const s = st[2];
      await setLevelByTeacher(repo, teacher, s.studentId!, -350, "", at(0));
      await read(repo, s, arts[0], 0, at(1));
      assert.equal(await lvl(s), -350, "round 9: one bad article never moves the level");
      await read(repo, s, arts[1], 0, at(1, 1));
      assert.equal(await lvl(s), -400, "two ≤ 25% in a row: −100, but never below −400 (BR400L)");
      assert.equal((await reasons(s)).filter((x) => x.startsWith("Down")).length, 1);
      // round 4: a stretch needs a NEW question band — 1000 (MID) stretches to 1100 (HIGH); 800 → 900 (MID → MID) is refused
      await setLevelByTeacher(repo, teacher, s.studentId!, 1000, "", at(2));
      await read(repo, s, arts[2], 8, at(2, 1));
      await read(repo, s, arts[2], 0, at(2, 2), true); // stretch at 0%
      assert.equal(await lvl(s), 1000, "a stretch never lowers the level");
      await read(repo, s, arts[2], 0, at(2, 3)); // a re-read at 0%
      assert.equal(await lvl(s), 1000, "a re-read never counts");
      await afterResponseSettled();
    });
  });

  describe("🐛 bug repro: the level must not freeze on real failing scores (owner report: stuck at 1000 through 25%/35%)", () => {
    let repo: SqliteRepo; let teacher: Actor; let student: Actor; let arts: string[];
    const lvl = async (s: Actor) => Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.level);

    /** a reading with REALISTIC answer timing: the reader shows all 8 questions at once, so a student who read them
     * while finishing the passage naturally clicks through the ones already decided a couple of seconds apart —
     * this must not be mistaken for rapid guessing (accuracy.ts) and must not stop the level from moving. */
    async function readRealistic(s: Actor, articleId: string, right: number, now: Date) {
      const v = await startRun(repo, s, articleId, {}, now);
      await submitPrePoll(repo, s, v.runId, 1, now);
      await finishReading(repo, s, v.runId, { readSeconds: 180 }, now);
      const timingAt: Record<string, number> = {};
      for (let i = 1; i <= 8; i++) timingAt[String(i)] = 40_000 + (i - 1) * 2_000;
      const submitAt = new Date(now.getTime() + 40_000 + 7 * 2_000 + 1_000);
      const r = await submitActivity(repo, s, v.runId, answers(right), submitAt, { at: timingAt });
      await submitPostPoll(repo, s, v.runId, 2, submitAt); // round 6: Reflect before Write
      await submitWriting(repo, s, v.runId, WRITING, submitAt);
      return r;
    }

    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
      teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
      student = await resolveActor(repo, (await repo.findUnique("User", { username: "test.student.001" }))!);
      arts = [];
      for (let i = 0; i < 4; i++) arts.push(await makeArticle(repo, `BUG-${i}`));
    });

    test("two realistically-timed, genuinely low first-try scores actually drop the level", async () => {
      await setLevelByTeacher(repo, teacher, student.studentId!, 1000, "placement", at(0));
      const r1 = await readRealistic(student, arts[0], 2, at(1)); // 25%: round 9 — one bad article alone does not move it
      const run1 = (await repo.findUnique("RRRun", { id: r1.runId }))!;
      assert.equal(run1.unreliable, false, "a normal click-through cadence is not Unreliable");
      assert.equal(await lvl(student), 1000);
      const r2 = await readRealistic(student, arts[1], 3, at(2)); // 38% → two in a row under 50%
      const run2 = (await repo.findUnique("RRRun", { id: r2.runId }))!;
      assert.equal(run2.unreliable, false);
      assert.equal(await lvl(student), 950, "the level must actually drop on two genuine low first tries (round 9: −50)");
      await afterResponseSettled();
    });
  });
});
