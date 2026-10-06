import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, validatePasswordStrength, needsRehash } from "../src/server/auth/password";

test("password hashing: verifies correct password, rejects wrong one, salts uniquely", async () => {
  const h1 = await hashPassword("Wonders2026!");
  const h2 = await hashPassword("Wonders2026!");
  assert.notEqual(h1, h2);
  assert.ok(await verifyPassword("Wonders2026!", h1));
  assert.ok(!(await verifyPassword("wonders2026!", h1)));
  assert.ok(!(await verifyPassword("x", "garbage")));
  assert.ok(!needsRehash(h1));
});

test("password policy", () => {
  assert.ok(validatePasswordStrength("short1"));
  assert.ok(validatePasswordStrength("onlyletterslong"));
  assert.equal(validatePasswordStrength("longenough1"), null);
});
