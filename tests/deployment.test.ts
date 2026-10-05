/**
 * Phase 13: deployment configuration, scheduling and monitoring checks that need no
 * Docker or MySQL. They keep the deployment files consistent with the code.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JOBS, nextRun, parseAt } from "../scripts/jobs/schedule";
import { audit } from "../src/server/audit";
import { logLine } from "../src/server/monitoring/log";
import { computeDigest, securityDigest, SECURITY_THRESHOLDS } from "../src/server/monitoring/security-digest";
import { demoDatabase, ROOT } from "./helpers/db";
import { createSchoolAdmin } from "../src/server/admin/bootstrap";
import { verifyPassword } from "../src/server/auth/password";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const envKeys = (f: string) => new Set([...read(f).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

describe("job schedule (Asia/Riyadh)", () => {
  test("daily and weekly times are computed in Riyadh time (UTC+3)", () => {
    // 2026-10-04 is a Sunday. 23:00 UTC Sunday = 02:00 Monday in Riyadh.
    assert.equal(nextRun("daily 02:15", new Date("2026-10-04T23:00:00Z")).toISOString(), "2026-10-04T23:15:00.000Z");
    assert.equal(nextRun("daily 02:15", new Date("2026-10-04T23:15:00Z")).toISOString(), "2026-10-05T23:15:00.000Z", "strictly after now");
    assert.equal(nextRun("daily 06:30", new Date("2026-10-04T10:00:00Z")).toISOString(), "2026-10-05T03:30:00.000Z");
    assert.equal(nextRun("weekly Fri 03:00", new Date("2026-10-04T10:00:00Z")).toISOString(), "2026-10-09T00:00:00.000Z");
    assert.equal(nextRun("weekly Fri 03:00", new Date("2026-10-09T00:00:00Z")).toISOString(), "2026-10-16T00:00:00.000Z");
    assert.throws(() => parseAt("daily 25:00"));
    assert.throws(() => parseAt("monthly 01:00"));
  });

  test("every scheduled job runs an npm script that exists", () => {
    for (const j of JOBS) assert.ok(pkg.scripts[j.script], j.script);
    for (const j of JOBS) parseAt(j.at);
  });
});

describe("monitoring", () => {
  test("logs are JSON lines and never contain secrets", () => {
    const line = JSON.parse(logLine("info", "x", { password: "p", sessionToken: "t", count: 3, error: new Error("boom") }, new Date("2026-10-04T00:00:00Z")));
    assert.deepEqual(line, { time: "2026-10-04T00:00:00.000Z", level: "info", event: "x", password: "[redacted]", sessionToken: "[redacted]", count: 3, error: { name: "Error", message: "boom" } });
  });

  test("security digest: thresholds, per-IP and per-user grouping, 24-hour window", () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 4, h));
    const rows = [
      ...Array.from({ length: SECURITY_THRESHOLDS.loginFailuresPerIp }, () => ({ action: "auth.login.failure", actorId: null, ip: "203.0.113.9", after: {}, createdAt: at(5) })),
      ...Array.from({ length: 3 }, () => ({ action: "auth.login.failure", actorId: null, ip: "198.51.100.1", after: {}, createdAt: at(5) })),
      ...Array.from({ length: SECURITY_THRESHOLDS.deniedActions }, () => ({ action: "user.password.reset.denied", actorId: "u-teacher", ip: null, after: {}, createdAt: at(6) })),
      { action: "user.create", actorId: "u-admin", ip: null, after: { role: "SCHOOL_ADMIN" }, createdAt: at(7) },
      { action: "user.create", actorId: "u-admin", ip: null, after: { role: "STUDENT" }, createdAt: at(7) },
      { action: "auth.login.failure", actorId: null, ip: "203.0.113.9", after: {}, createdAt: new Date("2026-10-02T00:00:00Z") }, // outside the window
    ];
    const d = computeDigest(rows, at(0), at(23));
    assert.deepEqual(d.alerts.map((a) => a.rule).sort(), ["denied_actions", "login_failures_ip", "new_admin"]);
    assert.ok(d.alerts.find((a) => a.rule === "login_failures_ip")!.message.includes("203.0.113.9"));
    assert.equal(d.totals.loginFailures, SECURITY_THRESHOLDS.loginFailuresPerIp + 3);
    assert.equal(computeDigest(rows.slice(-3), at(0), at(23)).alerts.length, 1, "a quiet day raises only the new-admin notice");
  });

  test("security digest reads the real audit log", async () => {
    const { repo } = await demoDatabase();
    const now = new Date("2026-10-04T12:00:00Z");
    for (let i = 0; i < SECURITY_THRESHOLDS.lockouts; i++) await audit(repo, { actorId: null, action: "auth.login.locked", entityType: "User", entityId: `u${i}`, ip: "192.0.2.1", at: new Date(now.getTime() - 3_600_000) });
    const d = await securityDigest(repo, now);
    assert.ok(d.alerts.some((a) => a.rule === "lockouts"));
  });
});

describe("deployment files are consistent", () => {
  const dockerfile = read("Dockerfile");
  const compose = read("docker-compose.prod.yml");
  const webStage = dockerfile.slice(dockerfile.indexOf("AS web"), dockerfile.indexOf("AS jobs"));

  test("web image: non-root, health check on the real health route, tini, no secrets", () => {
    assert.match(webStage, /^USER node$/m);
    assert.match(webStage, /HEALTHCHECK[\s\S]*\/api\/health/);
    assert.ok(existsSync(join(ROOT, "src/app/api/health/route.ts")));
    assert.match(webStage, /ENTRYPOINT \["\/usr\/bin\/tini"/);
    assert.ok(!/(SECRET|PASSWORD|DATABASE_URL)=/.test(webStage), "no credentials baked into the web image");
    assert.match(read("next.config.ts"), /output: "standalone"/);
    assert.match(read("next.config.ts"), /serverExternalPackages: \["playwright-core"\]/);
    assert.match(dockerfile, /--only-shell chromium/);
  });

  test("compose: every variable is documented, secrets are required, database not exposed, migrations run first", () => {
    const documented = envKeys(".env.production.example");
    const used = new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:}-]/g)].map((m) => m[1]));
    assert.deepEqual([...used].filter((v) => !documented.has(v)), []);
    for (const secret of ["APP_SECRET", "MYSQL_ROOT_PASSWORD", "MYSQL_APP_PASSWORD", "MYSQL_MIGRATE_PASSWORD", "MYSQL_BACKUP_PASSWORD"]) assert.match(compose, new RegExp(`\\$\\{${secret}:\\?`), secret);
    const mysqlBlock = compose.slice(compose.indexOf("\n  mysql:"), compose.indexOf("\n  backup:"));
    assert.ok(!/^\s+ports:/m.test(mysqlBlock), "MySQL must not publish a port");
    const block = (name: string) => { const i = compose.indexOf(`\n  ${name}:\n`); const j = compose.slice(i + 1).search(/\n  [a-z]+:\n/); return compose.slice(i, j < 0 ? undefined : i + 1 + j); };
    for (const svc of ["web", "jobs"]) assert.match(block(svc), /migrate: \{ condition: service_completed_successfully \}/, `${svc} waits for migrations`);
    assert.match(compose, /DATABASE_URL: mysql:\/\/ela_app:/, "the app uses the least-privilege account");
    assert.match(compose, /DATABASE_URL: mysql:\/\/ela_migrate:/, "migrations use the migration account");
  });

  test("every app setting in src/lib/env.ts is documented in .env.example", () => {
    const schema = [...read("src/lib/env.ts").matchAll(/^\s+([A-Z][A-Z0-9_]+): z\./gm)].map((m) => m[1]);
    const documented = envKeys(".env.example");
    assert.ok(schema.length > 10);
    assert.deepEqual(schema.filter((k) => !documented.has(k)), []);
  });

  test("CI only calls npm scripts that exist", () => {
    const calls = [...read(".github/workflows/ci.yml").matchAll(/npm run ([\w:.-]+)/g)].map((m) => m[1]);
    assert.ok(calls.length >= 4);
    assert.deepEqual(calls.filter((c) => !pkg.scripts[c]), []);
  });

  test("secrets files are ignored by git; example files are not", () => {
    const gi = read(".gitignore");
    assert.match(gi, /^\.env\.\*$/m);
    assert.match(gi, /^!\.env\.example$/m);
    assert.match(gi, /^!\.env\.production\.example$/m);
    assert.match(read(".dockerignore"), /^\.env$/m);
  });

  test("shell scripts are valid POSIX sh; restore refuses to overwrite the live database", () => {
    for (const f of ["docker/backup/backup.sh", "docker/backup/restore.sh", "docker/mysql/01-accounts.sh", "scripts/db/baseline-migration.sh", "scripts/mutation/run-all.sh"]) {
      const r = spawnSync("sh", ["-n", join(ROOT, f)]);
      assert.equal(r.status, 0, `${f}: ${r.stderr}`);
    }
    const r = spawnSync("sh", [join(ROOT, "docker/backup/restore.sh"), "x.sql.gz.gpg", "alanjal_ela"], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Refusing to overwrite the live database/);
    const bad = spawnSync("sh", [join(ROOT, "docker/backup/restore.sh"), "x.sql.gz.gpg", "evil;DROP"], { encoding: "utf8" });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /invalid database name/);
  });
});

describe("first admin account", () => {
  test("bootstrap creates a school admin with a one-time password that must be changed", async () => {
    const { repo } = await demoDatabase();
    const school = (await repo.findMany("School", {}))[0];
    const r = await createSchoolAdmin(repo, { schoolCode: String(school.code), username: "D.Eskandrany", displayName: "Doaa Eskandrany" });
    const u = (await repo.findUnique("User", { id: r.userId }))!;
    assert.deepEqual([u.username, u.role, u.mustChangePassword, u.schoolId], ["d.eskandrany", "SCHOOL_ADMIN", true, school.id]);
    assert.ok(await verifyPassword(r.temporaryPassword, String(u.passwordHash)));
    const log = (await repo.findMany("AuditLog", { action: "user.bootstrap" }))[0];
    assert.ok(log && !JSON.stringify(log).includes(r.temporaryPassword));
    await assert.rejects(createSchoolAdmin(repo, { schoolCode: String(school.code), username: "d.eskandrany", displayName: "X" }), /already exists/);
    await assert.rejects(createSchoolAdmin(repo, { schoolCode: "NOPE", username: "x.y", displayName: "X" }), /not found/);
    const d = await securityDigest(repo, new Date(Date.now() + 1000));
    assert.ok(d.alerts.some((x) => x.rule === "new_admin"), "a shell-created admin is flagged in the daily digest");
  });
});
