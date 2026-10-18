/**
 * 📱 Class QR sign-in (r76): the teacher opens a QR for ONE of their classes, students tap their name and are signed
 * straight in (short session), the teacher sees the live list and can sign students out or let a late one in.
 * Real database built from prisma/schema.prisma (SQLite), demo school (fake names only).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { DEFAULT_AUTH, hashToken } from "../src/server/auth/config";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { validateSession } from "../src/server/auth/sessions";
import { isClassSignInPath, isSameOriginPost } from "../src/server/auth/http";
import {
  classSessionExpiry, classSignInNames, classSignInRoster, ClassSignInError, cleanCode, closeClassSignIn, findOpenSignIn, letInClassStudent,
  listNames, openClassSignIn, QR_LIMITS, schoolDay, signInByName, signOutClassStudent, teacherSignInClasses,
} from "../src/server/auth/class-signin";
import { navItemsFor, searchablePagesFor } from "../src/components/nav-items";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

let repo: SqliteRepo;
const T0 = new Date("2026-10-05T05:00:00Z"); // 08:00 in Riyadh, a school morning
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const cfg = DEFAULT_AUTH;
let ipSeq = 0;
const ip = () => `10.9.0.${++ipSeq}`;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const user = async (username: string) => (await repo.findUnique("User", { username }))!;
const actorOf = async (username: string): Promise<Actor> => resolveActor(repo, await user(username));
const classByName = async (name: string) => (await repo.findMany("Class", { name }))[0];
const studentsOf = async (classId: unknown) => {
  const m = await repo.findMany("ClassMembership", { classId, leftAt: null });
  return Promise.all(m.map(async (x) => (await repo.findUnique("Student", { id: x.studentId }))!));
};
const forbidden = (e: unknown) => (e as { status?: number }).status === 403;

let c4a: string, c4b: string, teacherA: Actor, teacherB: Actor;

before(async () => {
  ({ repo } = await demoDatabase());
  c4a = String((await classByName("DEMO 4A")).id);
  c4b = String((await classByName("DEMO 4B")).id);
  teacherA = await actorOf("demo.teacher.4a");
  teacherB = await actorOf("demo.teacher.4b");
});

describe("📱 the teacher's classes", () => {
  test("a teacher sees only the classes they teach, read live (an admin change shows at once)", async () => {
    assert.deepEqual((await teacherSignInClasses(repo, teacherA)).map((c) => c.name), ["DEMO 4A"]);
    const tA = (await repo.findUnique("Teacher", { userId: teacherA.userId }))!;
    await repo.create("ClassTeacher", { classId: c4b, teacherId: tA.id, isLead: false });
    assert.deepEqual((await teacherSignInClasses(repo, teacherA)).map((c) => c.name), ["DEMO 4A", "DEMO 4B"], "added by the admin → listed");
    await repo.updateMany("Class", { id: c4b }, { name: "DEMO 4B Blue" });
    assert.deepEqual((await teacherSignInClasses(repo, teacherA)).map((c) => c.name), ["DEMO 4A", "DEMO 4B Blue"], "renamed → the new name");
    await repo.updateMany("Class", { id: c4b }, { name: "DEMO 4B" });
    await repo.deleteMany("ClassTeacher", { classId: c4b, teacherId: tA.id });
    assert.deepEqual((await teacherSignInClasses(repo, teacherA)).map((c) => c.name), ["DEMO 4A"], "removed → gone");
    assert.deepEqual(await teacherSignInClasses(repo, await actorOf("demo.admin")), [], "an admin who teaches no class");
    assert.deepEqual(await teacherSignInClasses(repo, await actorOf("demo.s1001")), [], "a student: nothing");
  });

  test("a teacher without the class gets Forbidden (open, close, roster, sign out, let in)", async () => {
    await assert.rejects(openClassSignIn(repo, teacherA, c4b, { now: T0 }), forbidden);
    await assert.rejects(openClassSignIn(repo, await actorOf("demo.s1001"), c4a, { now: T0 }), forbidden);
    await assert.rejects(openClassSignIn(repo, await actorOf("demo.p1001"), c4a, { now: T0 }), forbidden);
    const q = await openClassSignIn(repo, teacherB, c4b, { now: T0 });
    await assert.rejects(closeClassSignIn(repo, teacherA, q.id, { now: T0 }), forbidden);
    await assert.rejects(classSignInRoster(repo, teacherA, q.id, T0), forbidden);
    const someone = String((await studentsOf(c4b))[0].id);
    await assert.rejects(signOutClassStudent(repo, teacherA, c4b, someone, { now: T0 }), forbidden);
    await assert.rejects(letInClassStudent(repo, teacherA, c4b, someone, { now: T0 }), forbidden);
    await assert.rejects(signOutClassStudent(repo, teacherA, c4a, someone, { now: T0 }), forbidden, "a student of another class");
    await closeClassSignIn(repo, teacherB, q.id, { now: T0 });
  });
});

describe("📱 the QR token", () => {
  test("random 256-bit token, stored hashed, bound to school + class + teacher; 6-character code; 10 minutes", async () => {
    const q = await openClassSignIn(repo, teacherA, c4a, { now: T0 });
    assert.ok(q.token.length >= 43 && /^[A-Za-z0-9_-]+$/.test(q.token), "≥ 128 bits, URL-safe");
    assert.equal(await repo.count("ClassSignIn", { tokenHash: q.token }), 0, "the raw token is never stored");
    const row = (await repo.findUnique("ClassSignIn", { tokenHash: hashToken(q.token) }))!;
    assert.equal(row.classId, c4a);
    assert.equal(row.schoolId, (await classByName("DEMO 4A")).schoolId);
    assert.equal(row.teacherId, (await repo.findUnique("Teacher", { userId: teacherA.userId }))!.id);
    assert.match(q.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(q.expiresAt.getTime(), at(10).getTime());
    assert.ok(await findOpenSignIn(repo, q.token, at(9)));
    assert.ok(await findOpenSignIn(repo, q.code.toLowerCase(), at(9)), "the typed code works too (any case)");
    assert.equal(await findOpenSignIn(repo, q.token, at(10)), null, "expired after 10 minutes");
    assert.equal(await findOpenSignIn(repo, "x".repeat(43), at(1)), null);
    assert.equal(cleanCode(" ab-c 234 "), "ABC234", "spaces, dashes and case are forgiven");
    assert.equal(cleanCode("AB1234"), null, "no 1/I/0/O");
    assert.equal(cleanCode("ABC23"), null);
    assert.equal(cleanCode("abc234"), "ABC234");
    assert.ok(await repo.count("AuditLog", { action: "class_signin.open", entityId: c4a }) >= 1, "audited");
  });

  test("the token works for its class only: names of that class; a student of another class cannot use it", async () => {
    const q = await openClassSignIn(repo, teacherA, c4a, { now: T0 });
    const list = (await classSignInNames(repo, q.token, { ip: ip(), now: at(1) }))!;
    assert.equal(list.className, "DEMO 4A");
    const ids4a = new Set((await studentsOf(c4a)).map((x) => String(x.id)));
    assert.equal(list.names.length, ids4a.size);
    assert.ok(list.names.every((n) => ids4a.has(n.id)), "only 4A's students");
    const other = String((await studentsOf(c4b))[0].id);
    await assert.rejects(signInByName(repo, { key: q.token, studentId: other, ip: ip() }, cfg, at(1)), (e) => e instanceof ClassSignInError && e.code === "NOT_IN_CLASS");
    await closeClassSignIn(repo, teacherA, q.id, { now: at(1) });
  });

  test("closed, expired and re-opened: the old token is dead, the new one works", async () => {
    const q1 = await openClassSignIn(repo, teacherA, c4a, { now: T0 });
    const sid = String((await studentsOf(c4a))[0].id);
    await closeClassSignIn(repo, teacherA, q1.id, { now: at(1) });
    assert.equal(await classSignInNames(repo, q1.token, { ip: ip(), now: at(2) }), null, "closed");
    await assert.rejects(signInByName(repo, { key: q1.token, studentId: sid, ip: ip() }, cfg, at(2)), (e) => e instanceof ClassSignInError && e.code === "ENDED");
    assert.ok(await repo.count("AuditLog", { action: "class_signin.close" }) >= 1);

    const q2 = await openClassSignIn(repo, teacherA, c4a, { now: at(3) });
    const q3 = await openClassSignIn(repo, teacherA, c4a, { now: at(4) }); // "Open QR again"
    assert.equal(await classSignInNames(repo, q2.token, { ip: ip(), now: at(4) }), null, "re-opened → the old token is dead");
    assert.ok(await classSignInNames(repo, q3.token, { ip: ip(), now: at(4) }));
    assert.equal(await classSignInNames(repo, q3.token, { ip: ip(), now: at(15) }), null, "expired");
    await assert.rejects(signInByName(repo, { key: q3.token, studentId: sid, ip: ip() }, cfg, at(15)), (e) => e instanceof ClassSignInError && e.code === "ENDED");
  });
});

describe("👆 tap your name", () => {
  test("signs in as that student (short session), the name disappears, the teacher's list shows ✅, sign-out ends it", async () => {
    const T = new Date("2026-10-06T05:00:00Z");
    const q = await openClassSignIn(repo, teacherA, c4a, { now: T });
    const st = (await studentsOf(c4a))[0];
    const r = await signInByName(repo, { key: q.token, studentId: String(st.id), ip: ip(), userAgent: "test" }, cfg, T);
    assert.equal(r.user.id, st.userId);
    assert.equal(r.user.role, "STUDENT");
    assert.equal(r.expiresAt.getTime(), T.getTime() + 3 * 3_600_000, "3 hours (before the end of the school day)");
    assert.ok(r.expiresAt.getTime() < T.getTime() + cfg.sessionTtlMinutes * 60_000, "shorter than a normal session");
    const v = await validateSession(repo, r.token, cfg, new Date(T.getTime() + 60_000));
    assert.ok(v.ok && v.user.id === st.userId, "a normal student session");
    assert.ok(await repo.count("AuditLog", { action: "class_signin.sign_in", entityId: st.userId }) >= 1);

    const after = (await classSignInNames(repo, q.token, { ip: ip(), now: T }))!;
    assert.ok(!after.names.some((n) => n.id === st.id), "the name is gone from the list");
    await assert.rejects(signInByName(repo, { key: q.token, studentId: String(st.id), ip: ip() }, cfg, T), (e) => e instanceof ClassSignInError && e.code === "TAKEN");

    // a re-opened QR the same day: still gone
    const q2 = await openClassSignIn(repo, teacherA, c4a, { now: new Date(T.getTime() + 20 * 60_000) });
    assert.ok(!(await classSignInNames(repo, q2.token, { ip: ip(), now: new Date(T.getTime() + 21 * 60_000) }))!.names.some((n) => n.id === st.id), "signed in today → still off the list");

    const roster = await classSignInRoster(repo, teacherA, q2.id, new Date(T.getTime() + 21 * 60_000));
    assert.equal(roster.open, true);
    assert.equal(roster.className, "DEMO 4A");
    assert.equal(roster.students.find((x) => x.id === st.id)!.in, true, "✅");
    assert.ok(roster.students.filter((x) => x.id !== st.id).every((x) => !x.in), "⏳ the others");
    assert.ok(JSON.stringify(roster).length < 4000, "tiny JSON for a poll");

    await signOutClassStudent(repo, teacherA, c4a, String(st.id), { now: new Date(T.getTime() + 22 * 60_000) });
    const gone = await validateSession(repo, r.token, cfg, new Date(T.getTime() + 23 * 60_000));
    assert.equal(gone.ok, false, "sign out ends the student's sessions");
    assert.ok(await repo.count("AuditLog", { action: "class_signin.sign_out", entityId: st.userId }) >= 1);
    const back = await classSignInRoster(repo, teacherA, q2.id, new Date(T.getTime() + 23 * 60_000));
    assert.equal(back.students.find((x) => x.id === st.id)!.in, false, "⏳ again");
    assert.ok((await classSignInNames(repo, q2.token, { ip: ip(), now: new Date(T.getTime() + 23 * 60_000) }))!.names.some((n) => n.id === st.id), "the name is back on the list");

    // the next school day: everyone is on the list again
    const q3 = await openClassSignIn(repo, teacherA, c4a, { now: new Date(T.getTime() + 24 * 3_600_000) });
    const r2 = await signInByName(repo, { key: q3.token, studentId: String(st.id), ip: ip() }, cfg, new Date(T.getTime() + 24 * 3_600_000));
    assert.ok(r2.token);
  });

  test("let in a late student: a new QR opens when none is open; already open → no new QR", async () => {
    const T = new Date("2026-10-07T05:00:00Z");
    const q = await openClassSignIn(repo, teacherA, c4a, { now: T });
    const st = (await studentsOf(c4a))[1];
    const none = await letInClassStudent(repo, teacherA, c4a, String(st.id), { now: new Date(T.getTime() + 60_000) });
    assert.equal(none.opened, null, "the QR is still open");
    const late = new Date(T.getTime() + 30 * 60_000);
    assert.equal(await classSignInNames(repo, q.token, { ip: ip(), now: late }), null);
    const r = await letInClassStudent(repo, teacherA, c4a, String(st.id), { now: late });
    assert.ok(r.opened, "a new QR");
    assert.ok((await classSignInNames(repo, r.opened!.token, { ip: ip(), now: late }))!.names.some((n) => n.id === st.id));
    assert.ok(await repo.count("AuditLog", { action: "class_signin.let_in", entityId: st.userId }) >= 1);
  });

  test("staff, admin and parent accounts can never sign in this way (even if put in the class)", async () => {
    const T = new Date("2026-10-08T05:00:00Z");
    const q = await openClassSignIn(repo, teacherA, c4a, { now: T });
    const staff = await user("demo.teacher.4b");
    const klass = await classByName("DEMO 4A");
    const fake = await repo.create("Student", { userId: staff.id, schoolId: klass.schoolId, gradeId: klass.gradeId, studentNumber: "STAFF-1", createdAt: T });
    await repo.create("ClassMembership", { classId: c4a, studentId: fake.id, joinedAt: T });
    const list = (await classSignInNames(repo, q.token, { ip: ip(), now: T }))!;
    assert.ok(!list.names.some((n) => n.id === fake.id), "not on the list");
    await assert.rejects(signInByName(repo, { key: q.token, studentId: String(fake.id), ip: ip() }, cfg, T), (e) => e instanceof ClassSignInError && e.code === "NOT_IN_CLASS");
    await repo.deleteMany("ClassMembership", { studentId: fake.id });
    await repo.deleteMany("Student", { id: fake.id });
  });

  test("only active students: a student who left the class or is switched off cannot sign in", async () => {
    const T = new Date("2026-10-09T05:00:00Z");
    const q = await openClassSignIn(repo, teacherA, c4a, { now: T });
    const [a, b] = await studentsOf(c4a);
    await repo.updateMany("ClassMembership", { classId: c4a, studentId: a.id }, { leftAt: T });
    await repo.updateMany("User", { id: b.userId }, { isActive: false });
    for (const s of [a, b]) await assert.rejects(signInByName(repo, { key: q.token, studentId: String(s.id), ip: ip() }, cfg, T), (e) => e instanceof ClassSignInError && e.code === "NOT_IN_CLASS");
    await repo.updateMany("ClassMembership", { classId: c4a, studentId: a.id }, { leftAt: null });
    await repo.updateMany("User", { id: b.userId }, { isActive: true });
  });

  test("rate limits on the name list, the typed code and the sign-in", async () => {
    const T = new Date("2026-10-10T05:00:00Z");
    const one = "10.200.0.1";
    for (let i = 0; i < QR_LIMITS.codePerIp; i++) assert.equal(await classSignInNames(repo, "ZZZZZZ", { ip: one, now: T }), null);
    await assert.rejects(classSignInNames(repo, "ZZZZZZ", { ip: one, now: T }), (e) => e instanceof ClassSignInError && e.code === "RATE_LIMITED", "code guessing stops");
    const two = "10.200.0.2";
    await repo.upsert("RateLimitBucket", { key: `classqr:list:${two}` }, { count: QR_LIMITS.listPerIp, windowStart: T }, { count: QR_LIMITS.listPerIp, windowStart: T });
    await assert.rejects(classSignInNames(repo, "x".repeat(43), { ip: two, now: T }), (e) => e instanceof ClassSignInError && e.code === "RATE_LIMITED");
    const three = "10.200.0.3";
    await repo.upsert("RateLimitBucket", { key: `classqr:signin:${three}` }, { count: QR_LIMITS.signInPerIp, windowStart: T }, { count: QR_LIMITS.signInPerIp, windowStart: T });
    await assert.rejects(signInByName(repo, { key: "x".repeat(43), studentId: "s", ip: three }, cfg, T), (e) => e instanceof ClassSignInError && e.code === "RATE_LIMITED");
    assert.ok(await classSignInNames(repo, "ZZZZZZ", { ip: one, now: new Date(T.getTime() + QR_LIMITS.windowMs) }) === null, "a new window");
  });
});

describe("📱 rules and pages", () => {
  test("session end: the end of the school day (15:00 Riyadh) or 3 hours, whichever first", () => {
    const riyadh = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+03:00`);
    assert.equal(classSessionExpiry(riyadh("08:00")).getTime(), riyadh("11:00").getTime());
    assert.equal(classSessionExpiry(riyadh("13:00")).getTime(), riyadh("15:00").getTime());
    assert.equal(classSessionExpiry(riyadh("16:00")).getTime(), riyadh("19:00").getTime(), "after school: 3 hours");
    assert.equal(classSessionExpiry(riyadh("22:30")).getTime(), new Date("2026-10-06T00:00:00+03:00").getTime(), "never past midnight");
    assert.equal(schoolDay(new Date("2026-10-05T22:00:00Z")), "2026-10-06", "Riyadh date");
  });

  test("names: first name; the same first name → last initial; still the same → the full name; sorted", () => {
    assert.deepEqual(listNames([{ id: "1", name: "Sara Ali" }, { id: "2", name: "Omar Hassan" }, { id: "3", name: "Sara Khalid" }, { id: "4", name: "Laila" }]).map((n) => n.name),
      ["Laila", "Omar", "Sara A.", "Sara K."]);
    assert.deepEqual(listNames([{ id: "1", name: "Sara Ali" }, { id: "2", name: "Sara Amer" }]).map((n) => n.name), ["Sara Ali", "Sara Amer"]);
    assert.deepEqual(listNames([{ id: "1", name: "سارة أحمد" }, { id: "2", name: "سارة خالد" }]).map((n) => n.name).sort(), ["سارة أ.", "سارة خ."]);
  });

  test("open routes: /qr pages without a session (middleware), the same-origin form post, CSP unchanged", () => {
    for (const p of ["/qr", "/qr/ABC234", "/qr/signin"]) assert.ok(isClassSignInPath(p), p);
    for (const p of ["/qrs", "/teacher/class-signin", "/q", "/student"]) assert.ok(!isClassSignInPath(p), p);
    const mw = read("src/middleware.ts");
    assert.match(mw, /isClassSignInPath\(pathname\)/);
    const hdr = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
    assert.ok(isSameOriginPost(hdr({ origin: "https://anjal.example.com" }), "https://anjal.example.com"));
    assert.ok(isSameOriginPost(hdr({ origin: "https://other.host", host: "other.host" }), "https://anjal.example.com"), "the host the request reached");
    assert.ok(!isSameOriginPost(hdr({ origin: "https://evil.example", host: "anjal.example.com" }), "https://anjal.example.com"));
    assert.ok(!isSameOriginPost(hdr({ host: "anjal.example.com" }), "https://anjal.example.com"), "no Origin/Referer → rejected");
    const route = read("src/app/qr/signin/route.ts");
    assert.match(route, /isSameOriginPost\(req\.headers/);
    assert.match(route, /signInByName\(repo/);
    assert.match(read("src/app/qr/[key]/page.tsx"), /classSignInNames\(repo/);
    assert.match(read("src/app/api/class-signin/status/route.ts"), /apiActor\(\)/);
  });

  test("the existing sign-in stays as it was: username/password and the printed cards", () => {
    assert.match(read("src/app/login/submit/route.ts"), /login\(repo, \{ \.\.\.parsed\.data/);
    assert.match(read("src/components/accounts/login-cards.tsx"), /\/login\?u=\$\{encodeURIComponent\(c\.username\)\}/);
  });

  test("the teacher finds it: menu (More) and a Home shortcut; the QR drawn with qrPath like the login cards", () => {
    assert.ok(navItemsFor("TEACHER").some((i) => i.href === "/teacher/class-signin" && i.label === "Class sign-in" && i.line === "qr"));
    assert.ok(searchablePagesFor("TEACHER").some((i) => i.href === "/teacher/class-signin"));
    assert.ok(read("src/app/teacher/page.tsx").includes('{ href: "/teacher/class-signin", label: "Class sign-in"'));
    const host = read("src/components/class-signin/host.tsx");
    assert.match(host, /qrPath\(url\)/);
    assert.match(host, /\/qr\/\$\{qr\.token\}/);
    assert.match(host, /POLL_MS = 5000/);
    assert.match(host, /document\.hidden/, "no polling while the tab is hidden");
  });

  test("EN + AR strings (no technical words)", () => {
    const keys = ["Class sign-in", "Show a QR code: students scan it, tap their name and they are in.", "Open QR again", "Full screen", "Signed in: {n} of {total}", "Let in", "Sign out",
      "Tap your name.", "Find your name", "This QR code has ended. Ask your teacher to show it again.", "This name has already signed in. Ask your teacher.", "This name is not in this class.",
      "Type the code on your teacher's screen", "That code is not right. Check it and try again.", "Closes in {time}", "Scan the code, or go to {site} and type the code:", "Everyone in this class has signed in."];
    const en = new Set<string>(UI_STRINGS as readonly string[]);
    for (const k of keys) {
      assert.ok(en.has(k), `en: ${k}`);
      const a = (ar as Record<string, string>)[k];
      assert.ok(a && /[؀-ۿ]/.test(a), `ar: ${k}`);
      for (const v of k.match(/\{\w+\}/g) ?? []) assert.ok(a.includes(v), `ar keeps ${v}: ${k}`);
      assert.ok(!/adaptive|lexile/i.test(k), k);
    }
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate UI_STRINGS");
  });
});

// r77: with <meta name="referrer" content="no-referrer"> browsers send "Origin: null" on the name form's POST, and the
// same-origin check blocked every student ("Cross-site request blocked."). The name page must keep same-origin referrers.
import { readFileSync as r77read } from "node:fs";
import { test as r77test } from "node:test";
import r77assert from "node:assert/strict";
r77test("r77: the name page never sets referrer no-referrer (Origin: null would block the sign-in)", () => {
  const src = r77read("src/app/qr/[key]/page.tsx", "utf8");
  r77assert.doesNotMatch(src, /referrer:\s*"no-referrer"/);
  r77assert.match(src, /referrer:\s*"same-origin"/);
});
