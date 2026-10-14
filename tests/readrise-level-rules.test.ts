/**
 * 📉📈 ReadRise level rules (owner r69 item 2): faster DOWN, careful UP — pure and end to end.
 *   one first-try score ≤ 25% → −100 at once · two first-try scores in a row < 50% → −100 ·
 *   latest ≥ 75% and 3 of the last 4 ≥ 75% → +50 · never below 200 / above 1500 · plain-word reasons for the teacher.
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
  await submitPrePoll(repo, s, v.runId, 1, now);
  await finishReading(repo, s, v.runId, { readSeconds: 120 }, now);
  await submitActivity(repo, s, v.runId, answers(right), now);
  await submitWriting(repo, s, v.runId, WRITING, now);
  return submitPostPoll(repo, s, v.runId, 2, now);
}

describe("📉📈 ReadRise level rules", () => {
  test("pure: ≤ 25% once → −100; two in a row under 50% → −100; 3 of 4 at 75%+ → +50", () => {
    assert.deepEqual([ENGINE.floor, ENGINE.downStep, ENGINE.step, ENGINE.min, ENGINE.max], [25, 100, 50, 200, 1500]);
    // down at once
    for (const sc of [[0], [25], [90, 90, 10], [80, 80, 80, 25]]) assert.equal(levelDecision(sc).delta, -100, sc.join(","));
    assert.equal(levelDecision([26]).delta, 0, "26% alone is not enough");
    // two in a row
    assert.equal(levelDecision([49, 49]).delta, -100);
    assert.equal(levelDecision([49, 50]).delta, 0, "50% is not under 50%");
    assert.equal(levelDecision([40, 80, 40]).delta, 0, "not in a row");
    // up (unchanged)
    assert.equal(levelDecision([75, 75, 75]).delta, 50);
    assert.equal(levelDecision([30, 75, 80, 90]).delta, 50, "3 of the last 4");
    assert.equal(levelDecision([75, 75, 74]).delta, 0, "the latest must be 75%+");
    assert.equal(levelDecision([]).delta, 0);
    // plain words for the teacher
    assert.match(levelDecision([20]).reason!, /the first-try score on the last article was 20% \(25% or lower\), so the articles were too hard/);
    assert.match(levelDecision([45, 30]).reason!, /the last two first-try scores were both under 50% \(45% and 30%\)/);
    assert.match(levelDecision([80, 90, 100]).reason!, /3 of the last 3 first-try scores were 75% or higher \(latest 100%\)/);
    // limits
    assert.deepEqual([clampEngine(150), clampEngine(1600), clampEngine(844)], [200, 1500, 840]);
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

    test("a student placed far above their level is corrected quickly (950 → 750 after two very low scores)", async () => {
      const s = st[0];
      await setLevelByTeacher(repo, teacher, s.studentId!, 950, "old default start", at(0));
      const d1 = await read(repo, s, arts[0], 1, at(1)); // 13%
      assert.equal(await lvl(s), 850, "one score ≤ 25% → −100 at once");
      assert.deepEqual([d1.done!.levelBefore, d1.done!.levelAfter], [950, 850]);
      await read(repo, s, arts[1], 2, at(1, 1)); // 25%: the window restarted after the change, ≤ 25% again
      assert.equal(await lvl(s), 750);
      const r = await reasons(s);
      assert.ok(r.some((x) => /^Down 100: the first-try score on the last article was 13% \(25% or lower\)/.test(x)), r.join(" | "));
      await afterResponseSettled();
    });

    test("two in a row under 50% → −100; one low score between highs does not move it; up stays +50", async () => {
      const s = st[1];
      await setLevelByTeacher(repo, teacher, s.studentId!, 800, "", at(0));
      await read(repo, s, arts[0], 3, at(1)); // 38%
      assert.equal(await lvl(s), 800);
      await read(repo, s, arts[1], 7, at(1, 1)); // 88%: breaks the run
      await read(repo, s, arts[2], 3, at(1, 2)); // 38%
      assert.equal(await lvl(s), 800, "the low scores were not in a row");
      await read(repo, s, arts[3], 3, at(1, 3)); // 38% → two in a row
      assert.equal(await lvl(s), 700);
      // up: 3 of the last 4 at 75%+ with the latest 75%+
      await read(repo, s, arts[4], 6, at(2));
      await read(repo, s, arts[5], 7, at(2, 1));
      assert.equal(await lvl(s), 700);
      await read(repo, s, arts[6], 8, at(2, 2));
      assert.equal(await lvl(s), 750, "+50 (unchanged)");
      assert.ok((await reasons(s)).some((x) => /^Up 50: 3 of the last 3 first-try scores were 75% or higher/.test(x)));
      await afterResponseSettled();
    });

    test("floor 200; a stretch never lowers the level; a re-read never counts", async () => {
      const s = st[2];
      await setLevelByTeacher(repo, teacher, s.studentId!, 250, "", at(0));
      await read(repo, s, arts[0], 0, at(1));
      assert.equal(await lvl(s), 200, "never below 200");
      await read(repo, s, arts[1], 0, at(1, 1));
      assert.equal(await lvl(s), 200, "stays at the floor (no change row)");
      assert.equal((await reasons(s)).filter((x) => x.startsWith("Down")).length, 1);
      await setLevelByTeacher(repo, teacher, s.studentId!, 800, "", at(2));
      await read(repo, s, arts[2], 8, at(2, 1));
      await read(repo, s, arts[2], 0, at(2, 2), true); // stretch at 0%
      assert.equal(await lvl(s), 800, "a stretch never lowers the level");
      await read(repo, s, arts[2], 0, at(2, 3)); // a re-read at 0%
      assert.equal(await lvl(s), 800, "a re-read never counts");
      await afterResponseSettled();
    });
  });
});
