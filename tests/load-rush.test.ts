/**
 * r68 (LIVE incident): 300 students practising at the same moment on the 512 MB / 0.5 CPU server must not break it.
 *
 * The rush (tests/helpers/rush.ts): 300 students of the demo school open their home page, start practice and answer
 * 20 questions each, ALL AT ONCE, through the real server functions, on a database modelled as Prisma sees it (8
 * connections, a round trip per call; pool timeout = an error). It runs in a child process with the production V8
 * flags of a 512 MB plan (--max-old-space-size=302 --max-semi-space-size=8), so "the heap stays bounded" is checked
 * under the real limit. Before r68 the same rush (5 connections, unbounded after-response work) took p95 6.2 s per answer,
 * home pages 6.7 s, and its heap peak was twice as high; the work after each answer kept that answer's whole context.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers/db";
import { runWithGc } from "./helpers/peak-heap";
import type { RushResult } from "./helpers/rush";
import { afterQueueStats, afterResponseSettled, runAfterResponse } from "../src/server/lib/after-response";
import { verifyPassword, hashPassword, SCRYPT_CONCURRENCY } from "../src/server/auth/password";
import { DEFAULT_AUTH } from "../src/server/auth/config";
import { DEFAULT_CONNECTION_LIMIT, withPoolLimit } from "../src/lib/db-url";

type Child = RushResult & { poolWaits: number; poolTimeouts: number; heapLimitMb: number; caches: { name: string; size: number }[]; after: { queued: number; dropped: number; merged: number; peakQueued: number }; admission: { peak: number; rejected: number }; answerConcurrency: number };

describe("r68: a class rush of 300 students", () => {
  test("300 students × 20 answers at once: no error, p95 within budget, heap bounded under the 512 MB flags", { timeout: 900_000 }, () => {
    const r = runWithGc<Child>(join(ROOT, "tests/helpers/rush-child.ts"), ["300", "20", String(DEFAULT_CONNECTION_LIMIT), "2"], 900_000, ["--max-old-space-size=302", "--max-semi-space-size=8"]);
    console.log(`students ${r.students} · answers ${r.answers} · errors ${r.errors} · answer p50 ${r.p50} ms p95 ${r.p95} ms max ${r.max} ms · home p95 ${r.homeP95} ms · heap ${r.heapStartMb} → peak ${r.heapPeakMb} → after ${r.heapAfterMb} MB (limit ${r.heapLimitMb}) · rss peak ${r.rssPeakMb} MB · ${r.seconds} s · pool waits ${r.poolWaits}, timeouts ${r.poolTimeouts} · after-work queued at most ${r.after.peakQueued}, merged ${r.after.merged}, dropped ${r.after.dropped}`);
    assert.equal(r.heapLimitMb <= 340, true, "ran under the 512 MB plan's heap limit (302 MB old space + 3 × 8 MB young)");
    assert.equal(r.errors, 0, `errors: ${r.errorSamples.join(" | ")}`);
    assert.equal(r.answers, 300 * 20, "every answer saved");
    assert.equal(r.poolTimeouts, 0, "no request waited past the pool timeout");
    assert.ok(r.p95 <= 8000, `answer p95 ${r.p95} ms (budget 8 s for 300 students answering at the same instant)`);
    assert.ok(r.heapPeakMb - r.heapStartMb <= 150, `heap grew by ${r.heapPeakMb - r.heapStartMb} MB (budget 150 MB)`);
    assert.ok(r.heapAfterMb - r.heapStartMb <= 15, "the rush leaves (almost) nothing behind");
    // the answer path: at most N answers worked on at once; the work after the responses: drained, nothing dropped
    assert.ok(r.admission.peak <= r.answerConcurrency);
    assert.equal(r.admission.rejected, 0);
    assert.equal(r.after.queued, 0);
    assert.equal(r.after.dropped, 0, "no follow-up work lost");
    assert.ok(r.after.merged > 0, "duplicate follow-up work (the same student's star) merged");
    // caches bounded
    const size = (n: string) => r.caches.find((c) => c.name === n)?.size ?? 0;
    assert.ok(size("practice.pools") <= 80);
    assert.ok(size("practice.questions") <= 1000);
    assert.ok(size("fresh.seen") <= 600);
  });

  test("the work after the responses: at most 2 at a time, duplicates merged, the queue bounded", async () => {
    let running = 0, most = 0, runs = 0;
    const slow = () => new Promise((r) => setTimeout(r, 2));
    for (let i = 0; i < 40; i++) runAfterResponse("test.light", async () => { running++; most = Math.max(most, running); await slow(); running--; runs++; });
    // the same student's star asked 30 times while waiting: done far fewer times, with the newest work
    let starRuns = 0, last = -1;
    for (let i = 0; i < 30; i++) { const n = i; runAfterResponse("skills.status", async () => { starRuns++; last = n; }, { key: "skills.status|s1|k1" }); }
    await afterResponseSettled();
    assert.equal(runs, 40);
    assert.ok(most <= 2, `at most 2 at once (was ${most})`);
    assert.ok(starRuns < 5, `merged (${starRuns} runs for 30 requests)`);
    assert.equal(last, 29, "the newest one ran");
    assert.equal(afterQueueStats().queued, 0);
  });

  test("a class signing in at once: password checks two at a time (memory), a whole school behind one address is not blocked", async () => {
    const hash = await hashPassword("Class-Password-2026");
    let t = Date.now();
    const ok = await Promise.all(Array.from({ length: 12 }, () => verifyPassword("Class-Password-2026", hash)));
    assert.ok(ok.every(Boolean));
    const ms = Date.now() - t;
    console.log(`12 sign-ins at once: ${ms} ms (scrypt ${SCRYPT_CONCURRENCY} at a time)`);
    assert.equal(SCRYPT_CONCURRENCY, 2);
    t = Date.now();
    assert.ok(DEFAULT_AUTH.rateLimitPerIp >= 300, "one school address (NAT) is not blocked by the per-address limit");
    assert.match(withPoolLimit("mysql://u:p@h/db")!, /connection_limit=8&pool_timeout=20/);
  });
});
