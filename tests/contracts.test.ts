/**
 * Phase 12 contract checks that need no running app: database unique-key contract,
 * route/action authorization coverage, and dangerous patterns in the source.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { uniqueKeysSource } from "../scripts/db/gen-unique-keys";
import { matchUniqueKey, prismaUniqueWhere, UNIQUE_KEYS, UniqueKeyError } from "../src/server/db/unique-keys";
import { demoDatabase, ROOT } from "./helpers/db";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "node_modules" || n.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const SOURCES = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts"))].filter((f) => !f.endsWith(".generated.ts"));
const rel = (f: string) => relative(ROOT, f);

describe("database unique-key contract", () => {
  test("generated key map matches prisma/schema.prisma (run scripts/db/gen-unique-keys.ts after schema changes)", () => {
    assert.equal(readFileSync(join(ROOT, "src/server/db/unique-keys.generated.ts"), "utf8"), uniqueKeysSource(join(ROOT, "prisma/schema.prisma")));
  });

  test("Prisma where-clause is independent of key order and rejects non-unique lookups", () => {
    assert.deepEqual(prismaUniqueWhere("ClassMembership", { studentId: "s", classId: "c" }), { classId_studentId: { classId: "c", studentId: "s" } });
    assert.deepEqual(prismaUniqueWhere("SchoolSetting", { key: "k", schoolId: "x" }), { schoolId_key: { schoolId: "x", key: "k" } });
    assert.deepEqual(prismaUniqueWhere("User", { username: "a" }), { username: "a" });
    assert.deepEqual(prismaUniqueWhere("Class", { name: "4A", academicYearId: "y" }), { academicYearId_name: { academicYearId: "y", name: "4A" } });
    assert.throws(() => prismaUniqueWhere("Class", { schoolId: "x", name: "4A" }), UniqueKeyError);
    assert.throws(() => prismaUniqueWhere("Student", { schoolId: "x" }), /not a unique key/);
  });

  test("the test database enforces the same contract at runtime (any key order; non-unique refused)", async () => {
    const { repo } = await demoDatabase();
    const st = (await repo.findMany("Student", {}))[0];
    const m = (await repo.findMany("ClassMembership", { studentId: st.id }))[0];
    assert.ok(await repo.findUnique("ClassMembership", { studentId: st.id, classId: m.classId }), "reversed key order works");
    await assert.rejects(repo.findUnique("Student", { schoolId: st.schoolId }), UniqueKeyError);
    await assert.rejects(repo.upsert("Class", { schoolId: st.schoolId, name: "4A" }, {}), UniqueKeyError);
  });

  test("every findUnique / upsert in the source names a real unique key", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const f of SOURCES) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\.(findUnique|upsert)\(\s*"(\w+)",\s*\{([^{}]*)\}/g)) {
        const keys = m[3].split(",").map((p) => p.trim().split(":")[0].trim()).filter((k) => /^\w+$/.test(k));
        checked++;
        try {
          matchUniqueKey(UNIQUE_KEYS, m[2], keys);
        } catch (e) {
          bad.push(`${rel(f)}: ${(e as Error).message.split(". Unique")[0]}`);
        }
      }
    }
    assert.ok(checked > 100, `scanned ${checked} calls`);
    assert.deepEqual(bad, []);
  });
});

// ------------------------------------------------------- authorization coverage

/** Deliberately public entry points, with the reason they are safe. */
const PUBLIC_PAGES: Record<string, string> = {
  "src/app/login/page.tsx": "sign-in form",
  "src/app/change-password/page.tsx": "form only; changePasswordAction requires a session",
};
const PUBLIC_ROUTES: Record<string, string> = {
  "src/app/logout/route.ts": "POST, same-origin only, ends only the caller's own session",
  "src/app/api/health/route.ts": "health check for load balancers; returns only ok / unavailable",
};
const PUBLIC_ACTIONS: Record<string, string> = {
  "src/app/login/actions.ts#loginAction": "sign-in itself (rate limited, lockout)",
};

describe("authorization coverage (every entry point checks the session)", () => {
  const app = SOURCES.filter((f) => rel(f).startsWith("src/app/"));

  test("every page checks the session (requireActor / getActor)", () => {
    const pages = app.filter((f) => f.endsWith("/page.tsx"));
    assert.ok(pages.length > 20);
    const missing = pages.filter((f) => !PUBLIC_PAGES[rel(f)] && !/\b(requireActor|getActor)\(/.test(readFileSync(f, "utf8")));
    assert.deepEqual(missing.map(rel), []);
  });

  test("every API route authenticates; every state-changing route checks the origin", () => {
    const missing: string[] = [];
    for (const f of app.filter((x) => x.endsWith("/route.ts"))) {
      const src = readFileSync(f, "utf8");
      if (!PUBLIC_ROUTES[rel(f)] && !/\b(apiActor|requireActor)\(/.test(src)) missing.push(`${rel(f)}: no session check`);
      if (/export async function (POST|PUT|PATCH|DELETE)\b/.test(src) && !/assertSameOrigin\(/.test(src)) missing.push(`${rel(f)}: no same-origin check`);
    }
    assert.deepEqual(missing, []);
  });

  test("every exported server action checks the session in its own body", () => {
    const missing: string[] = [];
    for (const f of SOURCES.filter((x) => /^\s*"use server"/.test(readFileSync(x, "utf8")))) {
      const src = readFileSync(f, "utf8");
      const parts = src.split(/(?=^export async function )/m).slice(1);
      for (const p of parts) {
        const name = p.match(/^export async function (\w+)/)![1];
        if (PUBLIC_ACTIONS[`${rel(f)}#${name}`]) continue;
        if (!/\b(requireActor|getActor)\(/.test(p)) missing.push(`${rel(f)}#${name}`);
      }
    }
    assert.deepEqual(missing, []);
  });
});

describe("dangerous patterns", () => {
  test("no raw HTML injection, dynamic code, unsafe randomness or raw SQL in the app", () => {
    const hits: string[] = [];
    const rules: [RegExp, string][] = [
      [/dangerouslySetInnerHTML/, "raw HTML"], [/\.innerHTML\s*=/, "raw HTML"], [/\beval\(|new Function\(/, "dynamic code"],
      [/Math\.random\(\)/, "non-cryptographic randomness"], [/\$(queryRaw|executeRaw)Unsafe/, "unsafe raw SQL"], [/from "node:child_process"|require\("child_process"\)/, "process spawning"],
    ];
    for (const f of SOURCES.filter((x) => rel(x).startsWith("src/"))) {
      const src = readFileSync(f, "utf8");
      for (const [re, what] of rules) if (re.test(src)) hits.push(`${rel(f)}: ${what}`);
    }
    assert.deepEqual(hits, []);
  });

  test("no secrets committed: .env ignored, example file has empty secrets", () => {
    assert.match(readFileSync(join(ROOT, ".gitignore"), "utf8"), /^\.env$/m);
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    assert.match(example, /^APP_SECRET=$/m);
    assert.match(example, /^DEMO_PASSWORD=$/m);
    assert.ok(!/BEGIN (RSA |EC )?PRIVATE KEY/.test(SOURCES.map((f) => readFileSync(f, "utf8")).join("\n")));
  });
});
