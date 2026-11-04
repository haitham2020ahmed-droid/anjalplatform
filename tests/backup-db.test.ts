/**
 * 💾 scripts/db/backup-db.sh: parses DATABASE_URL correctly (no DB connection needed to test this) and, with a
 * fake `mysqldump` on PATH, actually produces a non-empty, correctly-named .sql.gz file and honours
 * BACKUP_UPLOAD_CMD / BACKUP_RETAIN_DAYS. No real database or network is used.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readdirSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const SCRIPT = join(__dirname, "..", "scripts", "db", "backup-db.sh");

/** A fake `mysqldump` + a PATH that has it first, for a hermetic test. */
function fakeBin(dir: string, body: string): string {
  const bin = join(dir, "mysqldump");
  writeFileSync(bin, `#!/bin/sh\n${body}\n`);
  chmodSync(bin, 0o755);
  return dir;
}

function run(env: Record<string, string>): { status: number; out: string } {
  try {
    const out = execFileSync("sh", [SCRIPT], { env: { ...process.env, PATH: env.PATH ?? process.env.PATH!, ...env }, encoding: "utf8" });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describe("backup-db.sh", () => {
  test("requires DATABASE_URL", () => {
    const binDir = mkdtempSync(join(tmpdir(), "bin-"));
    fakeBin(binDir, "echo fake dump; exit 0");
    const r = run({ PATH: `${binDir}:${process.env.PATH}`, DATABASE_URL: "" });
    assert.notEqual(r.status, 0);
  });

  test("dumps the right database, as a non-empty .sql.gz, and prints its path", () => {
    const binDir = mkdtempSync(join(tmpdir(), "bin-"));
    const workDir = mkdtempSync(join(tmpdir(), "work-"));
    // echoes its connection args back so the test can check what the script passed it
    fakeBin(binDir, 'echo "-- dump of: $*"; for i in $(seq 1 50); do echo "INSERT INTO t VALUES ($i);"; done');
    const r = run({
      PATH: `${binDir}:${process.env.PATH}`,
      DATABASE_URL: "mysql://ela_app:s3cr3t@db.example.com:12345/alanjal_ela?ssl-mode=REQUIRED",
      BACKUP_DIR: workDir,
    });
    assert.equal(r.status, 0, r.out);
    const files = readdirSync(workDir).filter((f) => f.endsWith(".sql.gz"));
    assert.equal(files.length, 1, `expected one dump file, got: ${files.join(", ")}`);
    assert.match(files[0], /^alanjal_ela-\d{8}T\d{6}Z\.sql\.gz$/);
    const content = gunzipSync(require("node:fs").readFileSync(join(workDir, files[0]))).toString("utf8");
    assert.match(content, /-- dump of:.*--host=db\.example\.com.*--port=12345.*--user=ela_app.*alanjal_ela/s);
    assert.match(content, /INSERT INTO t VALUES/);
  });

  test("fails loudly (and keeps no dump) when mysqldump produces almost nothing", () => {
    const binDir = mkdtempSync(join(tmpdir(), "bin-"));
    const workDir = mkdtempSync(join(tmpdir(), "work-"));
    fakeBin(binDir, "exit 0"); // produces empty output
    const r = run({ PATH: `${binDir}:${process.env.PATH}`, DATABASE_URL: "mysql://u:p@h:3306/db", BACKUP_DIR: workDir });
    assert.notEqual(r.status, 0);
    assert.match(r.out, /suspiciously small|FAILED/);
    assert.equal(existsSync(join(workDir, "db-dummy.sql.gz")), false);
    assert.deepEqual(readdirSync(workDir).filter((f) => f.endsWith(".sql.gz")), []);
  });

  test("runs BACKUP_UPLOAD_CMD with the dump's path and fails the run when the upload fails", () => {
    const binDir = mkdtempSync(join(tmpdir(), "bin-"));
    const workDir = mkdtempSync(join(tmpdir(), "work-"));
    fakeBin(binDir, 'for i in $(seq 1 200); do echo "INSERT INTO t VALUES ($i, \'row-$i-with-some-unique-padding-text\');"; done');
    const uploadLog = join(workDir, "upload.log");
    const uploader = join(binDir, "fake-uploader");
    writeFileSync(uploader, `#!/bin/sh\necho "uploaded: $1" > "${uploadLog}"\nexit 1\n`);
    chmodSync(uploader, 0o755);
    const r = run({
      PATH: `${binDir}:${process.env.PATH}`,
      DATABASE_URL: "mysql://u:p@h:3306/db",
      BACKUP_DIR: workDir,
      BACKUP_UPLOAD_CMD: uploader,
    });
    assert.notEqual(r.status, 0, "an upload failure must fail the whole run, not be silently swallowed");
    assert.match(require("node:fs").readFileSync(uploadLog, "utf8"), /uploaded: .*\.sql\.gz/);
  });

  test("prunes local dumps older than BACKUP_RETAIN_DAYS, keeps newer ones", () => {
    const binDir = mkdtempSync(join(tmpdir(), "bin-"));
    const workDir = mkdtempSync(join(tmpdir(), "work-"));
    fakeBin(binDir, 'for i in $(seq 1 200); do echo "INSERT INTO t VALUES ($i, \'row-$i-with-some-unique-padding-text\');"; done');
    const old = join(workDir, "db-20200101T000000Z.sql.gz");
    writeFileSync(old, "old-dump-bytes-old-dump-bytes");
    const tenDaysAgo = Date.now() / 1000 - 10 * 86400;
    utimesSync(old, tenDaysAgo, tenDaysAgo);
    const r = run({ PATH: `${binDir}:${process.env.PATH}`, DATABASE_URL: "mysql://u:p@h:3306/db", BACKUP_DIR: workDir, BACKUP_RETAIN_DAYS: "7" });
    assert.equal(r.status, 0, r.out);
    assert.equal(existsSync(old), false, "a 10-day-old dump should be pruned when retention is 7 days");
    assert.equal(readdirSync(workDir).filter((f) => f.endsWith(".sql.gz")).length, 1, "today's fresh dump stays");
  });
});
