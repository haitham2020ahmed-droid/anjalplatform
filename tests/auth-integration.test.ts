/**
 * Phase 3 — authentication, sessions, permissions and data isolation, tested
 * against a real database built from prisma/schema.prisma (SQLite).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { DEFAULT_AUTH, hashToken, sign, verifySigned } from "../src/server/auth/config";
import { login } from "../src/server/auth/login";
import { changePassword, resetPassword, temporaryPassword } from "../src/server/auth/passwords-admin";
import { purgeExpiredSessions, revokeAllSessions, revokeSession, validateSession } from "../src/server/auth/sessions";
import { resolveActor, visibleStudentIds } from "../src/server/auth/actor";
import { canAccessStudent, can } from "../src/server/auth/rbac";
import { contentSecurityPolicy, isSameOrigin, newNonce, securityHeaders, sessionCookie } from "../src/server/auth/http";
import { validatePasswordStrength } from "../src/server/auth/password";
import { DEMO_PW, demoDatabase } from "./helpers/db";

let db: DatabaseSync;
let repo: SqliteRepo;
const T0 = new Date("2026-10-05T07:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const cfg = DEFAULT_AUTH;
let ipSeq = 0;
const ip = () => `10.0.0.${++ipSeq}`; // fresh IP per test so rate limits don't leak between tests

const userByName = async (u: string) => (await repo.findUnique("User", { username: u }))!;
const studentOf = async (username: string) => (await repo.findUnique("Student", { userId: (await userByName(username)).id }))!;
const classOf = async (studentId: unknown) => String((await repo.findMany("ClassMembership", { studentId }))[0].classId);

before(async () => {
  ({ db, repo } = await demoDatabase());
});

describe("login", () => {
  test("correct credentials create a session; only the token's hash is stored", async () => {
    const r = await login(repo, { username: "demo.s1001", password: DEMO_PW, ip: ip() }, cfg, T0);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(await repo.count("Session", { id: r.token }), 0, "raw token must never be stored");
    assert.equal(await repo.count("Session", { id: hashToken(r.token) }), 1);
    const v = await validateSession(repo, r.token, cfg, at(1));
    assert.equal(v.ok, true);
  });

  test("usernames are case/space-insensitive", async () => {
    const r = await login(repo, { username: "  DEMO.S1001 ", password: DEMO_PW, ip: ip() }, cfg, T0);
    assert.equal(r.ok, true);
  });

  test("wrong password and unknown user return the SAME generic message", async () => {
    const a = await login(repo, { username: "demo.s1002", password: "wrong-password-1", ip: ip() }, cfg, T0);
    const b = await login(repo, { username: "no.such.user", password: "wrong-password-1", ip: ip() }, cfg, T0);
    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
    if (!a.ok && !b.ok) {
      assert.equal(a.message, b.message);
      assert.equal(a.error, "INVALID_CREDENTIALS");
    }
  });

  test("unknown usernames take comparable time (no username probing by timing)", async () => {
    const t1 = performance.now();
    await login(repo, { username: "demo.s1003", password: "wrong-password-1", ip: ip() }, cfg, T0);
    const known = performance.now() - t1;
    const t2 = performance.now();
    await login(repo, { username: "ghost.user", password: "wrong-password-1", ip: ip() }, cfg, T0);
    const unknown = performance.now() - t2;
    assert.ok(unknown > known * 0.5, `known ${known.toFixed(0)}ms vs unknown ${unknown.toFixed(0)}ms`);
  });

  test("account locks after 5 failures — even the right password is refused until the lock expires", async () => {
    const addr = ip();
    for (let i = 0; i < 4; i++) await login(repo, { username: "demo.s1004", password: `bad-pass-${i}x`, ip: addr }, cfg, at(i));
    const fifth = await login(repo, { username: "demo.s1004", password: "bad-pass-5x", ip: addr }, cfg, at(5));
    assert.equal(fifth.ok === false && fifth.error, "LOCKED");
    const right = await login(repo, { username: "demo.s1004", password: DEMO_PW, ip: ip() }, cfg, at(6));
    assert.equal(right.ok === false && right.error, "LOCKED");
    const later = await login(repo, { username: "demo.s1004", password: DEMO_PW, ip: ip() }, cfg, at(5 + cfg.lockoutMinutes + 1));
    assert.equal(later.ok, true);
    assert.ok(await repo.count("AuditLog", { action: "auth.login.locked" }) >= 1);
  });

  test("rate limit per account+IP blocks bursts, then resets after the window", async () => {
    const addr = ip();
    let last;
    for (let i = 0; i < cfg.rateLimitPerAccount + 1; i++)
      last = await login(repo, { username: "nobody.here", password: "x-password-1", ip: addr }, cfg, at(i * 0.1));
    assert.equal(last!.ok === false && last!.error, "RATE_LIMITED");
    const after = await login(repo, { username: "nobody.here", password: "x-password-1", ip: addr }, cfg, at(cfg.rateLimitWindowMinutes + 1));
    assert.equal(after.ok === false && after.error, "INVALID_CREDENTIALS");
  });

  test("audit log records logins but never secrets", async () => {
    const rows = db.prepare(`SELECT before, after FROM "AuditLog"`).all() as { before: string | null; after: string | null }[];
    assert.ok(rows.length > 0);
    for (const r of rows) assert.ok(!(`${r.before}${r.after}`).includes(DEMO_PW));
  });
});

describe("sessions", () => {
  test("idle timeout and absolute expiry", async () => {
    const r = await login(repo, { username: "demo.s1005", password: DEMO_PW, ip: ip() }, cfg, T0);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal((await validateSession(repo, r.token, cfg, at(30))).ok, true);
    const idle = await validateSession(repo, r.token, cfg, at(30 + cfg.idleMinutes + 1));
    assert.equal(idle.ok === false && idle.reason, "IDLE");

    const r2 = await login(repo, { username: "demo.s1005", password: DEMO_PW, ip: ip() }, cfg, T0);
    if (!r2.ok) return assert.fail();
    // keep it active every 50 minutes; it still dies at the absolute limit
    let m = 0;
    while (m + 50 < cfg.sessionTtlMinutes) {
      m += 50;
      assert.equal((await validateSession(repo, r2.token, cfg, at(m))).ok, true, `minute ${m}`);
    }
    const dead = await validateSession(repo, r2.token, cfg, at(cfg.sessionTtlMinutes + 1));
    assert.equal(dead.ok === false && dead.reason, "EXPIRED");
  });

  test("lastSeenAt is written at most every few minutes (not on every request)", async () => {
    const r = await login(repo, { username: "demo.s1006", password: DEMO_PW, ip: ip() }, cfg, T0);
    if (!r.ok) return assert.fail();
    const seen = async () => String((await repo.findUnique("Session", { id: hashToken(r.token) }))!.lastSeenAt);
    const s0 = await seen();
    await validateSession(repo, r.token, cfg, at(1));
    assert.equal(await seen(), s0);
    await validateSession(repo, r.token, cfg, at(cfg.touchEveryMinutes + 1));
    assert.notEqual(await seen(), s0);
  });

  test("logout ends this device; 'log out everywhere' ends all devices immediately", async () => {
    const a = await login(repo, { username: "demo.teacher.4a", password: DEMO_PW, ip: ip() }, cfg, T0);
    const b = await login(repo, { username: "demo.teacher.4a", password: DEMO_PW, ip: ip() }, cfg, T0);
    if (!a.ok || !b.ok) return assert.fail();
    await revokeSession(repo, a.token);
    assert.equal((await validateSession(repo, a.token, cfg, at(1))).ok, false);
    assert.equal((await validateSession(repo, b.token, cfg, at(1))).ok, true);
    const c = await login(repo, { username: "demo.teacher.4a", password: DEMO_PW, ip: ip() }, cfg, T0);
    if (!c.ok) return assert.fail();
    await revokeAllSessions(repo, String(c.user.id));
    const vb = await validateSession(repo, b.token, cfg, at(2));
    assert.equal(vb.ok, false);
  });

  test("a session from an older sessionVersion is rejected even if its row survived (race / bulk revoke)", async () => {
    const r = await login(repo, { username: "demo.s1010", password: DEMO_PW, ip: ip() }, cfg, T0);
    if (!r.ok) return assert.fail();
    // bump the version WITHOUT deleting session rows (what a concurrent login during revocation looks like)
    await repo.updateMany("User", { id: r.user.id }, { sessionVersion: Number(r.user.sessionVersion) + 1 });
    const v = await validateSession(repo, r.token, cfg, at(1));
    assert.equal(v.ok === false && v.reason, "REVOKED");
  });

  test("deactivated users lose their sessions", async () => {
    const r = await login(repo, { username: "demo.s1007", password: DEMO_PW, ip: ip() }, cfg, T0);
    if (!r.ok) return assert.fail();
    await repo.updateMany("User", { id: r.user.id }, { isActive: false });
    const v = await validateSession(repo, r.token, cfg, at(1));
    assert.equal(v.ok === false && v.reason, "USER_INACTIVE");
    await repo.updateMany("User", { id: r.user.id }, { isActive: true });
  });

  test("garbage and missing tokens are rejected safely", async () => {
    for (const t of [undefined, "", "x", "a".repeat(500), "not-a-real-token-but-long-enough"]) assert.equal((await validateSession(repo, t, cfg, T0)).ok, false);
  });

  test("expired sessions are purged", async () => {
    await login(repo, { username: "demo.s1008", password: DEMO_PW, ip: ip() }, cfg, T0);
    const purged = await purgeExpiredSessions(repo, at(cfg.sessionTtlMinutes + 10));
    assert.ok(purged >= 1);
  });
});

describe("passwords", () => {
  test("policy: length and letters+numbers; temporary passwords meet it", () => {
    assert.ok(validatePasswordStrength("short1"));
    for (let i = 0; i < 50; i++) assert.equal(validatePasswordStrength(temporaryPassword()), null);
  });

  test("change password: verifies current, rejects weak/same, logs out other devices", async () => {
    const u = await userByName("demo.s1009");
    const other = await login(repo, { username: "demo.s1009", password: DEMO_PW, ip: ip() }, cfg, T0);
    if (!other.ok) return assert.fail();
    assert.equal((await changePassword(repo, String(u.id), "wrong-one-123", "NewPassword-1")).ok, false);
    assert.equal((await changePassword(repo, String(u.id), DEMO_PW, "weak")).ok, false);
    assert.equal((await changePassword(repo, String(u.id), DEMO_PW, DEMO_PW)).ok, false);
    assert.equal((await changePassword(repo, String(u.id), DEMO_PW, "NewPassword-2026")).ok, true);
    assert.equal((await validateSession(repo, other.token, cfg, at(1))).ok, false);
    assert.equal((await login(repo, { username: "demo.s1009", password: "NewPassword-2026", ip: ip() }, cfg, at(2))).ok, true);
  });

  test("a teacher can reset a student in their own class — temp password works, change is forced", async () => {
    const teacher = await resolveActor(repo, await userByName("demo.teacher.4a"));
    const st = await studentOf("demo.s1001"); // class DEMO 4A
    const stUser = await userByName("demo.s1001");
    assert.ok(teacher.teacherStudentIds!.has(String(st.id)));
    const { temporaryPassword: temp } = await resetPassword(repo, teacher, String(stUser.id));
    const r = await login(repo, { username: "demo.s1001", password: temp, ip: ip() }, cfg, at(1));
    assert.equal(r.ok && r.mustChangePassword, true);
  });

  test("a teacher CANNOT reset a student in another class, another teacher, or a parent", async () => {
    const teacher = await resolveActor(repo, await userByName("demo.teacher.4a"));
    const otherClassStudent = await userByName("demo.s1004"); // class DEMO 4B
    await assert.rejects(resetPassword(repo, teacher, String(otherClassStudent.id)), /cannot reset/);
    await assert.rejects(resetPassword(repo, teacher, String((await userByName("demo.teacher.4b")).id)), /cannot reset/);
    await assert.rejects(resetPassword(repo, teacher, String((await userByName("demo.p1001")).id)), /cannot reset/);
    assert.ok(await repo.count("AuditLog", { action: "user.password.reset.denied" }) >= 3);
  });

  test("a school admin cannot reset a user in another school", async () => {
    const outsider = await repo.create("School", { code: "OTHER", name: "Other School" });
    const foreign = await repo.create("User", { username: "other.user", displayName: "Other", role: "STUDENT", schoolId: outsider.id, passwordHash: "x" });
    const admin = await resolveActor(repo, await userByName("demo.admin"));
    await assert.rejects(resetPassword(repo, admin, String(foreign.id)), /cannot reset/);
    const own = await userByName("demo.teacher.5a");
    assert.ok((await resetPassword(repo, admin, String(own.id))).temporaryPassword);
  });
});

describe("roles and data isolation", () => {
  test("a teacher sees exactly the students enrolled in their own classes", async () => {
    const teacher = await resolveActor(repo, await userByName("demo.teacher.4a"));
    const classId = await classOf((await studentOf("demo.s1001")).id);
    const enrolled = new Set((await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)));
    assert.deepEqual([...visibleStudentIds(teacher)!].sort(), [...enrolled].sort());
    const other = await studentOf("demo.s1004");
    assert.equal(canAccessStudent(teacher, { studentId: String(other.id), schoolId: String(other.schoolId) }), false);
  });

  test("a student sees only themself — not a classmate", async () => {
    const me = await resolveActor(repo, await userByName("demo.s1002"));
    const self = await studentOf("demo.s1002");
    const classmate = await studentOf("demo.s1003");
    assert.equal(canAccessStudent(me, { studentId: String(self.id), schoolId: String(self.schoolId) }), true);
    assert.equal(canAccessStudent(me, { studentId: String(classmate.id), schoolId: String(classmate.schoolId) }), false);
  });

  test("a parent sees only their linked child", async () => {
    const parent = await resolveActor(repo, await userByName("demo.p1001"));
    const child = await studentOf("demo.s1001");
    const notChild = await studentOf("demo.s1002");
    assert.equal(canAccessStudent(parent, { studentId: String(child.id), schoolId: String(child.schoolId) }), true);
    assert.equal(canAccessStudent(parent, { studentId: String(notChild.id), schoolId: String(notChild.schoolId) }), false);
  });

  test("moving a student out of a class removes the old teacher's access", async () => {
    const st = await studentOf("demo.s1003");
    const classId = await classOf(st.id);
    await repo.updateMany("ClassMembership", { classId, studentId: st.id }, { leftAt: T0 });
    const teacher = await resolveActor(repo, await userByName("demo.teacher.4a"));
    assert.equal(teacher.teacherStudentIds!.has(String(st.id)), false);
    await repo.updateMany("ClassMembership", { classId, studentId: st.id }, { leftAt: null });
  });

  test("extra permission grants are read from the database (e.g. lead teacher may publish questions)", async () => {
    const before = await resolveActor(repo, await userByName("demo.teacher.4b"));
    assert.equal(can(before, "questions:publish"), false);
    await repo.create("RolePermission", { role: "TEACHER", permission: "questions:publish" });
    const after = await resolveActor(repo, await userByName("demo.teacher.4b"));
    assert.equal(can(after, "questions:publish"), true);
    await repo.deleteMany("RolePermission", { role: "TEACHER" });
  });
});

describe("HTTP protections", () => {
  test("session cookie is HttpOnly, SameSite=Lax, and __Host-/Secure in production", () => {
    const c = sessionCookie("tok", at(60), true);
    assert.equal(c.name, "__Host-ela_session");
    assert.equal(c.httpOnly, true);
    assert.equal(c.secure, true);
    assert.equal(c.sameSite, "lax");
    assert.equal(c.path, "/");
  });

  test("cross-site requests are rejected; same-origin allowed", () => {
    const app = "https://ela.alanjal.edu.sa";
    assert.equal(isSameOrigin({ origin: "https://ela.alanjal.edu.sa" }, app), true);
    assert.equal(isSameOrigin({ origin: "https://evil.example" }, app), false);
    assert.equal(isSameOrigin({ referer: "https://ela.alanjal.edu.sa/teacher" }, app), true);
    assert.equal(isSameOrigin({}, app), false);
  });

  test("signed values detect tampering", () => {
    const s = sign("csrf-123", "secret-key-of-enough-length-000000");
    assert.equal(verifySigned(s, "secret-key-of-enough-length-000000"), "csrf-123");
    assert.equal(verifySigned(s.replace("123", "124"), "secret-key-of-enough-length-000000"), null);
  });

  test("security headers: CSP blocks framing and plugins; HSTS in production", () => {
    const h = Object.fromEntries(securityHeaders(true).map((x) => [x.key, x.value]));
    const csp = contentSecurityPolicy({ production: true, nonce: "abc123" });
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    // Phase 12: production scripts need the per-request nonce (Next.js inline bootstrap); no unsafe-inline/eval
    assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'/);
    assert.ok(!/script-src[^;]*unsafe/.test(csp));
    assert.equal(h["Content-Security-Policy"], undefined, "page CSP comes from middleware only, so two policies never intersect");
    assert.notEqual(newNonce(), newNonce());
    assert.match(newNonce(), /^[A-Za-z0-9+/]{22}==$/);
    assert.ok(h["Strict-Transport-Security"]);
    assert.equal(h["X-Content-Type-Options"], "nosniff");
  });
});
