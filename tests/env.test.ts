/**
 * Settings are validated on first use, not at import (so `next build` needs no secrets),
 * and src/instrumentation.ts validates them when the server starts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const KEYS = ["DATABASE_URL", "APP_SECRET", "APP_URL", "NODE_ENV", "MAX_UPLOAD_MB"] as const;

test("importing settings never throws; first use validates and reports every problem", async () => {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of KEYS) delete process.env[k];
    const mod = await import("../src/lib/env"); // import alone must not throw (next build "collecting page data")
    assert.throws(() => mod.env.APP_URL, (e: Error) => /Invalid environment configuration/.test(e.message) && /DATABASE_URL/.test(e.message) && /APP_SECRET/.test(e.message));

    process.env.DATABASE_URL = "mysql://u:p@localhost:3306/alanjal_ela";
    process.env.APP_SECRET = "x".repeat(44);
    process.env.APP_URL = "https://ela.example.edu.sa";
    process.env.NODE_ENV = "production";
    assert.equal(mod.env.APP_URL, "https://ela.example.edu.sa");
    assert.equal(mod.env.MAX_UPLOAD_MB, 10, "defaults applied");
    assert.equal(mod.loadEnv(), mod.loadEnv(), "validated once, then cached");
    assert.ok("APP_URL" in mod.env && Object.keys(mod.env).includes("REPORT_FONT_DIR"));

    const inst = await import("../src/instrumentation");
    process.env.NEXT_RUNTIME = "nodejs";
    await inst.register(); // valid settings: starts normally
  } finally {
    for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
    delete process.env.NEXT_RUNTIME;
  }
});
