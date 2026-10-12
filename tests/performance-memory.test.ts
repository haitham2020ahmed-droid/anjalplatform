/** Update 46: memory guards of the 512 MB web server (pool size, audio reads, heavy jobs one at a time). */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { withPoolLimit } from "../src/lib/db-url";
import { runHeavy, memoryHigh } from "../src/server/monitoring/memory";
import { readAudioCached } from "../src/server/tts/audio-cache";
import type { Repo } from "../src/server/seeding/repo";

describe("update 46: memory", () => {
  test("database URL gets a small pool unless it sets its own", () => {
    assert.equal(withPoolLimit("mysql://u:p@h:3306/db"), "mysql://u:p@h:3306/db?connection_limit=5&pool_timeout=20");
    assert.equal(withPoolLimit("mysql://u:p@h/db?ssl-mode=REQUIRED"), "mysql://u:p@h/db?ssl-mode=REQUIRED&connection_limit=5&pool_timeout=20");
    assert.equal(withPoolLimit("mysql://u:p@h/db?connection_limit=9&pool_timeout=5"), "mysql://u:p@h/db?connection_limit=9&pool_timeout=5");
    assert.equal(withPoolLimit(undefined), undefined);
  });

  test("heavy jobs run one at a time, a failure does not block the next", async () => {
    const order: string[] = [];
    let running = 0, most = 0;
    const job = (n: string, fail = false) => runHeavy(async () => { running++; most = Math.max(most, running); await new Promise((r) => setTimeout(r, 5)); order.push(n); running--; if (fail) throw new Error(n); return n; });
    const r = await Promise.allSettled([job("a"), job("b", true), job("c")]);
    assert.deepEqual(order, ["a", "b", "c"]);
    assert.equal(most, 1);
    assert.equal(r[2].status, "fulfilled");
    assert.equal(memoryHigh(), false, "never deferred outside the production server");
  });

  test("audio: concurrent plays of one recording share one database read", async () => {
    let reads = 0;
    const bytes = new Uint8Array(1000).fill(1);
    const repo = { findMany: async () => { reads++; await new Promise((r) => setTimeout(r, 5)); return [{ id: "x1", mime: "audio/wav", bytes }]; } } as unknown as Repo;
    const key = "b".repeat(64);
    const got = await Promise.all(Array.from({ length: 10 }, () => readAudioCached(repo, key)));
    assert.equal(reads, 1);
    assert.ok(got.every((a) => a?.bytes === bytes && a.id === "x1"));
    await readAudioCached(repo, key);
    assert.equal(reads, 1, "a Range request right after is served from memory");
  });
});
