/**
 * 🖥 Server status (Admin → Server status): the data shape the page relies on never throws and stays sane even
 * without a real database, and the page is gated exactly like the other admin-only "ops" pages (School admin /
 * platform admin only — no teacher, student or parent).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dbPing, serverStatus, type RawDb } from "../src/server/admin/server-status";
import { memorySnapshot, MEMORY_BUSY_MB } from "../src/server/monitoring/memory";
import { ADMIN_TOOLS } from "../src/components/admin-tools";

const ROOT = join(__dirname, "..");
const PAGE = join(ROOT, "src/app/admin/server-status/page.tsx");

describe("server status: data shape", () => {
  test("memorySnapshot() returns plausible, non-negative numbers", () => {
    const m = memorySnapshot();
    for (const k of ["rssMB", "heapUsedMB", "heapTotalMB", "externalMB", "arrayBuffersMB"] as const) {
      assert.ok(Number.isFinite(m[k]) && m[k] >= 0, `${k} should be a non-negative number, got ${m[k]}`);
    }
    // the process running this test is not a Render container at its memory limit
    assert.ok(m.rssMB < 4000, "sanity: RSS should be well under 4 GB in a test run");
  });

  const okClient: RawDb = { $queryRaw: async () => [{ "1": 1 }] };
  const downClient: RawDb = { $queryRaw: async () => { throw new Error("connect ECONNREFUSED 10.0.0.1:3306"); } };

  test("dbPing() reports ok with a timing when the database answers", async () => {
    const r = await dbPing(okClient);
    assert.equal(r.ok, true);
    assert.equal(r.error, null);
    assert.ok(Number.isFinite(r.ms) && r.ms >= 0);
  });

  test("dbPing() never throws, even when the database cannot be reached — it reports the failure instead", async () => {
    const r = await dbPing(downClient);
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /ECONNREFUSED/);
    assert.ok(Number.isFinite(r.ms) && r.ms >= 0);
  });

  test("serverStatus() combines everything into one object without throwing", async () => {
    const s = await serverStatus(okClient);
    assert.ok(Number.isFinite(s.uptimeSeconds) && s.uptimeSeconds >= 0);
    assert.match(s.nodeVersion, /^v\d+\./);
    assert.ok(Number.isFinite(s.memory.rssMB));
    assert.equal(s.memoryBusyMb, MEMORY_BUSY_MB);
    assert.equal(s.memoryBusyNow, s.memory.rssMB > MEMORY_BUSY_MB);
    assert.equal(typeof s.recentPages, "string");
    assert.equal(s.db.ok, true);
    // ISO timestamp
    assert.ok(!Number.isNaN(Date.parse(s.now)));
  });

  test("serverStatus() still returns a full object when the database is down (page never crashes)", async () => {
    const s = await serverStatus(downClient);
    assert.equal(s.db.ok, false);
    assert.match(s.db.error ?? "", /ECONNREFUSED/);
    assert.ok(Number.isFinite(s.memory.rssMB));
  });
});

describe("server status: access control and admin-tools listing", () => {
  test("the page is gated to School admin / platform admin only (same style as every other admin page)", () => {
    const src = readFileSync(PAGE, "utf8");
    const m = src.match(/requireActor\((\{[^)]*\})?\)/);
    assert.ok(m, "page must call requireActor(...)");
    assert.match(m![1] ?? "", /^\{ roles: \["SCHOOL_ADMIN", "SUPER_ADMIN"\] \}$/, "server-status must be SCHOOL_ADMIN/SUPER_ADMIN only, like System check");
  });

  test("is read-only: no server action / mutation import on the page", () => {
    const src = readFileSync(PAGE, "utf8");
    assert.doesNotMatch(src, /"use server"/);
    assert.doesNotMatch(src, /from ["']\.\/actions["']/);
  });

  test("is listed once in ADMIN_TOOLS, under Settings, pointing at an existing page", () => {
    const entries = ADMIN_TOOLS.filter((t) => t.href === "/admin/server-status");
    assert.equal(entries.length, 1, "listed exactly once");
    assert.equal(entries[0].group, "settings");
    assert.equal(entries[0].label, "Server status");
  });
});
