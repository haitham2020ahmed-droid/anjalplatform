/**
 * Update 42B · faster answers and pages.
 *  - equivalence: the same scripted student (practice on two skills, an assigned set, an intervention lesson) gives
 *    EXACTLY what the code before Update 42B gave — every feedback, every next screen, every saved attempt, decision
 *    log, mastery, ability, XP, status and session (tests/fixtures/update42b-golden.json was recorded with the base
 *    revision's code by the same scenario, tests/helpers/update42b-scenario.ts; RE-RECORDED for the no-repeat rule
 *    (src/server/practice/no-repeat.ts): the old recording served the same practice question up to three times in one
 *    session — now each is served once, so the practice part is shorter and the later lesson starts from that history)
 *  - work after the response: it does not run before the answer returns, it always runs afterwards, a failure is
 *    logged and never reaches the student
 *  - an answer's transaction only writes; the reads are done before it, in parallel
 *  - the ReadRise library check runs at most once a day per server process; badge numbers are cached briefly
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runScenario } from "./helpers/update42b-scenario";
import { afterResponseRuns, afterResponseSettled, runAfterResponse } from "../src/server/lib/after-response";
import { TtlCache } from "../src/server/lib/ttl-cache";
import { ensureReadRiseLibrary, resetReadRiseLibraryCheck } from "../src/server/readrise/seed";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { resolveActor } from "../src/server/auth/actor";
import { loadSkillItems } from "../src/server/practice/items";
import { startPractice, submitAnswer } from "../src/server/practice/session";
import { rightAnswer } from "../src/server/seeding/test-env";
import { navCountsCached } from "../src/server/teacher/week-plan";
import type { Repo } from "../src/server/seeding/repo";

/** A repo that counts calls (and calls made inside a transaction). */
function counting(repo: Repo) {
  const n = { all: 0, inTx: 0, txs: 0 };
  const wrap = (r: Repo, tx: boolean): Repo => new Proxy(r, {
    get(t, k) {
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      if (typeof v !== "function") return v;
      if (k === "transaction") return (fn: (x: Repo) => Promise<unknown>) => { n.txs++; return (v as Repo["transaction"]).call(t, (x: Repo) => fn(wrap(x, true))); };
      return (...a: unknown[]) => { n.all++; if (tx) n.inTx++; return (v as (...b: unknown[]) => unknown).apply(t, a); };
    },
  });
  return { repo: wrap(repo, false), n };
}

describe("Update 42B · same results, less waiting", () => {
  test("equivalence: feedback, next screens and everything saved are identical to the code before Update 42B", async () => {
    const golden = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/update42b-golden.json"), "utf8"));
    const now = JSON.parse(JSON.stringify(await runScenario((p) => import(join(ROOT, p)))));
    // (no repeats: each practice question once, so the practice part is shorter than before)
    assert.ok(golden.log.length >= 20 && golden.saved.attempts.length >= 20, "the scenario covers practice, a set and a lesson");
    assert.deepEqual(now.log, golden.log, "what the student sees after every answer");
    assert.deepEqual(now.saved, golden.saved, "attempts, decision logs, mastery, ability, XP, statuses, sessions");
  });

  test("work after the response: not before the answer returns, always afterwards; a failure is only logged", async () => {
    const done: string[] = [];
    const runs = afterResponseRuns();
    runAfterResponse("test.one", async () => { done.push("one"); runAfterResponse("test.nested", () => { done.push("nested"); }); });
    runAfterResponse("test.fails", () => { throw new Error("boom (expected in this test)"); });
    assert.deepEqual(done, [], "nothing runs while the request is still answering");
    await afterResponseSettled();
    assert.deepEqual(done, ["one", "nested"], "the work and the work it scheduled have run");
    assert.equal(afterResponseRuns() - runs, 3, "the failing task finished too (logged, not thrown)");
  });

  test("a practice answer: the transaction only writes; its decision log arrives after the response", async () => {
    const { repo: raw } = await demoDatabase();
    await seedQuestions(raw, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await raw.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
    await raw.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    const lina = await resolveActor(raw, (await raw.findUnique("User", { username: "demo.s1001" }))!);
    const st = (await raw.findUnique("Student", { id: lina.studentId! }))!;
    const cur = (await raw.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    const skill = String((await raw.findUnique("Skill", { curriculumId: cur.id, code: "G4.context-clues" }))!.id);
    const rnd = seededRandom(9);
    const T = Date.UTC(2026, 10, 3, 8, 0, 0);
    let view = await startPractice(raw, lina, skill, new Date(T), rnd);
    const items = await loadSkillItems(raw, skill);
    const { repo, n } = counting(raw);
    let maxAll = 0, maxTx = 0;
    for (let i = 0; i < 4 && view.question; i++) {
      const it = items.find((x) => x.questionId === view.question!.questionId)!;
      n.all = 0; n.inTx = 0;
      const r = await submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: it.questionId, response: rightAnswer(it) }, new Date(T + (i + 1) * 30_000), rnd);
      maxAll = Math.max(maxAll, n.all); maxTx = Math.max(maxTx, n.inTx);
      view = r.view;
    }
    assert.ok(maxTx <= 5, `writes only inside the transaction (session move, attempt, ability, mastery, XP): ${maxTx}`);
    assert.ok(maxAll <= 16, `one answer with warm caches: ${maxAll} calls`);
    await afterResponseSettled();
    const logs = await raw.findMany("AdaptiveDecisionLog", { sessionId: view.sessionId });
    assert.equal(logs.filter((l) => l.attemptId).length, 4, "every answer's decision log was written after its response");
  });

  test("the ReadRise library check runs at most once a day per server process", async () => {
    const { repo: raw } = await demoDatabase();
    const { repo, n } = counting(raw);
    const day1 = new Date("2026-11-03T07:00:00Z");
    const first = await ensureReadRiseLibrary(repo, process.cwd(), day1);
    assert.ok(first && first.created >= 15, "the first visit loads the library");
    n.all = 0;
    for (let i = 0; i < 5; i++) assert.equal(await ensureReadRiseLibrary(repo, process.cwd(), new Date(day1.getTime() + i * 3600_000)), null);
    assert.equal(n.all, 0, "later visits the same day cost no query");
    assert.equal(await ensureReadRiseLibrary(repo, process.cwd(), new Date("2026-11-04T07:00:00Z")), null);
    assert.equal(n.all, 1, "the next day: one cheap count");
    resetReadRiseLibraryCheck(repo);
    await ensureReadRiseLibrary(repo, process.cwd(), new Date("2026-11-04T08:00:00Z"));
    assert.equal(n.all, 2);
  });

  test("badge numbers: kept briefly per person, bounded, least recently used dropped first", async () => {
    const c = new TtlCache<number>(15_000, 3);
    c.set("a", 1, 0); c.set("b", 2, 0); c.set("c", 3, 0);
    assert.equal(c.get("a", 1000), 1); // a is now the most recently used
    c.set("d", 4, 1000);
    assert.equal(c.size, 3);
    assert.equal(c.get("b", 1000), undefined, "the least recently used went first");
    assert.equal(c.get("a", 16_000), undefined, "expired after 15 s");
    let loads = 0;
    const load = async () => { loads++; return 7; };
    await Promise.all([c.getOrLoad("x", load, 0), c.getOrLoad("x", load, 0)]);
    assert.equal(loads, 1, "two requests at once share one load");

    const { repo: raw } = await demoDatabase();
    const st = await resolveActor(raw, (await raw.findUnique("User", { username: "demo.s1001" }))!);
    const { repo, n } = counting(raw);
    const t = new Date("2026-11-03T07:00:00Z");
    const v1 = await navCountsCached(repo, st, t);
    const q1 = n.all;
    assert.ok(q1 > 0);
    assert.deepEqual(await navCountsCached(repo, st, new Date(t.getTime() + 5_000)), v1);
    assert.equal(n.all, q1, "a click after a click costs nothing");
    await navCountsCached(repo, st, new Date(t.getTime() + 20_000));
    assert.ok(n.all > q1, "refreshed after the time limit");
  });
});
