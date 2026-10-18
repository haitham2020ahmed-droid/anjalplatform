/**
 * r68 (MEMFIX): the background jobs are safe on the 512 MB server and ON by default again.
 *
 * On a large synthetic school (≥ 3,000 students, ≥ 20,000 questions, ≥ 300,000 answers — in-memory SQLite, never a real
 * database): each job gives the same result as before, its peak heap growth stays under 80 MB, jobs never overlap, a
 * restart resumes from the checkpoint, two runs / two servers never race on the settings row, and the memory gate
 * pauses a job and lets it go on. Measured in a child process with a real --expose-gc.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/db";
import { runWithGc } from "./helpers/peak-heap";
import { backgroundJobsOn, startupJobs } from "../src/server/jobs/startup";
import { defaultHeapGateMb, defaultRssGateMb } from "../src/server/jobs/runner";

interface R {
  dataset: { students: number; questions: number; answers: number; copies: number };
  privatize: { peakMb: number; ran: boolean; privatized: number; private: number; ownerOk: boolean };
  stars: { peakMb: number; oldPeakMb: number; ran: boolean; statuses: number; sameAsOld: boolean; written: number; oldWritten: number; report: number };
  resume: { savedCursor: string | null; savedBatches: number; firstCursor: string | null; ran: boolean; done: boolean; sameResult: boolean };
  fix: { peakMb: number; ran: boolean; result: { published: number }; afterJob: unknown; afterDirect: unknown; directPublished: number; directClassified: number };
  overlap: { peak: number };
  race: { error: string | null; claims: boolean[]; rows: number };
  lease: { whileHeld: string; afterExpiry: boolean };
  gate: { waitedDone: boolean; waits: number; pausedReason: string; pausedDone: boolean };
}

describe("r68: memory-safe background jobs", () => {
  let r: R;
  test("the large synthetic school: ≥ 3,000 students, ≥ 20,000 questions, ≥ 300,000 answers", { timeout: 1_200_000 }, () => {
    r = runWithGc<R>(join(ROOT, "tests/helpers/jobs-child.ts"), [], 1_200_000);
    console.log(JSON.stringify(r));
    assert.ok(r.dataset.students >= 3000 && r.dataset.questions >= 20_000 && r.dataset.answers >= 300_000);
  });

  test("each job: the same result as before, peak heap growth under 80 MB", () => {
    assert.ok(r.privatize.ran && r.privatize.ownerOk);
    assert.equal(r.privatize.privatized, r.dataset.copies);
    assert.equal(r.privatize.private, r.dataset.copies, "every old teacher copy is private to its creator");
    assert.ok(r.stars.ran && r.stars.sameAsOld, "the stars job (batches of 25) = the old migration, row for row");
    assert.equal(r.stars.written, r.stars.oldWritten);
    assert.equal(r.stars.report, 1, "the System check report is written");
    assert.ok(r.fix.ran);
    assert.deepEqual(r.fix.afterJob, r.fix.afterDirect, "the same end state as the whole run");
    assert.equal(r.fix.directPublished, 0, "the old whole run afterwards finds nothing more to publish");
    for (const [name, mb] of [["privatize", r.privatize.peakMb], ["stars", r.stars.peakMb], ["fix stuck", r.fix.peakMb]] as const) assert.ok(mb < 80, `${name}: peak ${mb} MB`);
  });

  test("a restart in the middle resumes from the checkpoint with the same result", () => {
    assert.ok(r.resume.savedCursor, "the cursor was saved after each batch");
    assert.equal(r.resume.savedBatches, 3);
    assert.equal(r.resume.firstCursor, r.resume.savedCursor, "the next start began where it stopped, not at the start");
    assert.ok(r.resume.ran && r.resume.done && r.resume.sameResult);
  });

  test("jobs never overlap; the settings race and two servers are safe", () => {
    assert.equal(r.overlap.peak, 1);
    assert.equal(r.race.error, null);
    assert.deepEqual(r.race.claims.sort(), [false, true], "two claims of the same row: one wins, no error");
    assert.equal(r.race.rows, 1);
    assert.equal(r.lease.whileHeld, "busy", "another live server holds the job: skipped");
    assert.equal(r.lease.afterExpiry, true, "that server died (lease expired): taken over from the checkpoint");
  });

  test("the memory gate: the job waits above the threshold, goes on below it, pauses (checkpoint kept) after too long", () => {
    assert.equal(r.gate.waitedDone, true);
    assert.ok(r.gate.waits >= 1);
    assert.equal(r.gate.pausedReason, "paused");
    assert.equal(r.gate.pausedDone, false);
  });

  test("ON by default (BACKGROUND_JOBS=off still switches them off), 2 minutes after the start, one after another", async () => {
    assert.equal(backgroundJobsOn({}), true);
    assert.equal(backgroundJobsOn({ BACKGROUND_JOBS: "off" }), false);
    assert.equal(backgroundJobsOn({ BACKGROUND_JOBS: "on" }), true);
    assert.deepEqual((await startupJobs()).map((j) => j.name), ["privatize-copies", "skill-stars", "fix-stuck"]);
    const inst = readFileSync(join(ROOT, "src/instrumentation.ts"), "utf8");
    assert.match(inst, /backgroundJobsOn\(\)/);
    assert.doesNotMatch(inst, /=== "on"/, "no longer off unless BACKGROUND_JOBS=on");
    assert.match(readFileSync(join(ROOT, "src/server/jobs/startup.ts"), "utf8"), /STARTUP_DELAY_MS = 120_000/);
    assert.equal(defaultRssGateMb(), Math.round((Number(process.env.WEB_MEMORY_MB) || 512) * 0.78));
    assert.ok(defaultHeapGateMb() > 0);
  });

  test("settings rows written by jobs never race: no bare create of a SchoolSetting claim is left", () => {
    for (const f of ["src/server/insights/daily.ts", "src/server/questions/link-bank-run.ts", "src/server/admin/load-questions.ts", "src/server/admin/stuck-questions.ts"]) {
      assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /repo\.create\("SchoolSetting"/, f);
    }
    assert.match(readFileSync(join(ROOT, "src/server/db/prisma-repo.ts"), "utf8"), /isUniqueError\(e\)/, "an upsert that loses the race updates instead");
    assert.match(readFileSync(join(ROOT, "src/app/admin/system/actions.ts"), "utf8"), /queueMigration/, "the System check button queues the job (returns at once)");
  });
});
