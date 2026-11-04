/**
 * Nov 2026 self-restart (owner-approved, 512 MB plan kept): the server restarts itself while nobody is using it,
 * before Next.js's normal route-chunk growth reaches the 512 MB container limit and Render OOM-kills it mid-request
 * (the "retry home page twice" symptom). See the file-top comment in src/server/monitoring/memory.ts for the story.
 *
 *   - a guaranteed restart once a day at 4 AM Riyadh (1 AM UTC), only if idle for the required window;
 *   - a safety-net restart at ANY time if RSS crosses 420 MB, only if idle;
 *   - "idle" reuses notePath()'s timestamps, which only ever fire from a real signed-in page (never a health check).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("self-restart: idleMs()", () => {
  test("no pages noted yet: idle since the process started", async () => {
    const m = await import("../src/server/monitoring/memory");
    const g = globalThis as { __paths?: unknown; __memStart?: number };
    const savedPaths = g.__paths, savedStart = g.__memStart;
    try {
      g.__paths = [];
      g.__memStart = 1_000_000;
      assert.equal(m.idleMs(1_000_000 + 5000), 5000);
    } finally { g.__paths = savedPaths; g.__memStart = savedStart; }
  });

  test("a recent real page request resets the idle clock", async () => {
    const m = await import("../src/server/monitoring/memory");
    m.notePath("/teacher/home");
    assert.ok(m.idleMs() < 1000, "just noted: idle time is ~0");
  });

  test("a health check never calls notePath (confirmed: /api/health never calls getActor())", async () => {
    const src = (await import("node:fs")).readFileSync("src/app/api/health/route.ts", "utf8");
    assert.doesNotMatch(src, /getActor|requireActor/, "health route only does repo.count, never touches auth/notePath");
  });
});

describe("self-restart: selfRestartReason() — pure decision, no timers", () => {
  test("never restarts while busy (idle below the 10-minute floor), whatever the clock or RSS says", async () => {
    const m = await import("../src/server/monitoring/memory");
    const nowUtc = new Date("2026-11-05T01:05:00Z"); // inside the 4 AM Riyadh window
    assert.equal(m.selfRestartReason({ nowUtc, rssMB: 500, idleMs: 9 * 60_000, uptimeMs: 30 * 60 * 60_000 }), null);
  });

  test("never restarts in the first 5 minutes after boot, even if otherwise qualified", async () => {
    const m = await import("../src/server/monitoring/memory");
    const nowUtc = new Date("2026-11-05T01:05:00Z");
    assert.equal(m.selfRestartReason({ nowUtc, rssMB: 500, idleMs: 20 * 60_000, uptimeMs: 60_000 }), null);
  });

  test("guaranteed: idle, inside the 4 AM Riyadh (1 AM UTC) window, and up for a full day", async () => {
    const m = await import("../src/server/monitoring/memory");
    const nowUtc = new Date("2026-11-05T01:07:00Z");
    assert.equal(m.selfRestartReason({ nowUtc, rssMB: 250, idleMs: 11 * 60_000, uptimeMs: 21 * 60 * 60_000 }), "guaranteed");
  });

  test("guaranteed: NOT yet (idle, in-window, but freshly restarted — same-day repeat guard)", async () => {
    const m = await import("../src/server/monitoring/memory");
    const nowUtc = new Date("2026-11-05T01:07:00Z");
    assert.equal(m.selfRestartReason({ nowUtc, rssMB: 250, idleMs: 11 * 60_000, uptimeMs: 10 * 60_000 }), null, "just restarted — must wait for the next day's window, not repeat today's");
  });

  test("guaranteed: NOT outside the window, even if idle and up for days", async () => {
    const m = await import("../src/server/monitoring/memory");
    const nowUtc = new Date("2026-11-05T09:07:00Z"); // noon Riyadh
    assert.equal(m.selfRestartReason({ nowUtc, rssMB: 250, idleMs: 20 * 60_000, uptimeMs: 48 * 60 * 60_000 }), null);
  });

  test("safety net: fires at any hour once RSS crosses 420 MB and the server is idle", async () => {
    const m = await import("../src/server/monitoring/memory");
    const nowUtc = new Date("2026-11-05T14:30:00Z"); // mid-afternoon, nowhere near the guaranteed window
    assert.equal(m.selfRestartReason({ nowUtc, rssMB: 420, idleMs: 10 * 60_000, uptimeMs: 6 * 60 * 60_000 }), "safety_net");
    assert.equal(m.selfRestartReason({ nowUtc, rssMB: 419, idleMs: 10 * 60_000, uptimeMs: 6 * 60 * 60_000 }), null, "just under the threshold: not yet");
  });

  test("safety net: never fires while busy, however high RSS climbs", async () => {
    const m = await import("../src/server/monitoring/memory");
    const nowUtc = new Date("2026-11-05T14:30:00Z");
    assert.equal(m.selfRestartReason({ nowUtc, rssMB: 505, idleMs: 60_000, uptimeMs: 6 * 60 * 60_000 }), null);
  });
});

describe("self-restart: startSelfRestart()", () => {
  test("is idempotent (a second call does not start a second timer)", async () => {
    const m = await import("../src/server/monitoring/memory");
    const g = globalThis as { __selfRestart?: unknown };
    const before = g.__selfRestart;
    m.startSelfRestart();
    const after1 = g.__selfRestart;
    m.startSelfRestart();
    assert.equal(g.__selfRestart, after1, "second call: no new interval");
    if (!before) { clearInterval(g.__selfRestart as NodeJS.Timeout); g.__selfRestart = before; }
  });

  test("the escape hatch and the wiring exist: SELF_RESTART=off, and instrumentation.ts starts it alongside the memory log", async () => {
    const src = (await import("node:fs")).readFileSync("src/server/monitoring/memory.ts", "utf8");
    assert.match(src, /SELF_RESTART/);
    const boot = (await import("node:fs")).readFileSync("src/instrumentation.ts", "utf8");
    assert.match(boot, /startSelfRestart/);
  });
});
