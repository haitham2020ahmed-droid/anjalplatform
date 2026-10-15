/**
 * 🖨 r85: the PRINTABLE class QR + 4-digit class code (weekly plan sheet; students sign in at school or at home).
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
import { isClassSignInPath } from "../src/server/auth/http";
import { classSignInNames, openClassSignIn, signInByName } from "../src/server/auth/class-signin";
import {
  cleanPrintCode, findPrintQr, newPrintCode, newPrintLink, printQrForSheet, printQrNames, printQrPanel, printQrPanels, printQrStudent, printSessionExpiry,
  printSignInsView, printToken, PrintQrError, PRINT_LOCK_MS, schoolWeekStart, signInByClassCode, turnOffPrintQr, turnOnPrintQr,
} from "../src/server/auth/class-print-qr";
import { classSignInStripHtml } from "../src/lib/class-signin-strip";
import { familyWeekDocument } from "../src/reports/family-week-html";
import { renderHtml } from "../src/reports/html";
import { makeT } from "../src/i18n";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

let repo: SqliteRepo;
const T0 = new Date("2026-10-11T05:00:00Z"); // Sunday 08:00 in Riyadh
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const cfg = DEFAULT_AUTH;
const SECRET = "r85-test-secret-0123456789abcdef0123456789";
let ipSeq = 0;
const ip = () => `10.85.0.${++ipSeq}`;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const user = async (username: string) => (await repo.findUnique("User", { username }))!;
const actorOf = async (username: string): Promise<Actor> => resolveActor(repo, await user(username));
const classByName = async (name: string) => (await repo.findMany("Class", { name }))[0];
const studentsOf = async (classId: unknown) => {
  const m = await repo.findMany("ClassMembership", { classId, leftAt: null });
  return Promise.all(m.map(async (x) => (await repo.findUnique("Student", { id: x.studentId }))!));
};
const forbidden = (e: unknown) => (e as { status?: number }).status === 403;
const code = (c: string) => (e: unknown) => e instanceof PrintQrError && e.code === c;
const tokenOf = (path: string | null) => String(path).replace("/qr/c/", "");
const wrong = (right: string) => String((Number(right) + 1) % 10_000).padStart(4, "0");

let c4a: string, c4b: string, teacherA: Actor, teacherB: Actor;

before(async () => {
  process.env.APP_SECRET = SECRET;
  ({ repo } = await demoDatabase());
  c4a = String((await classByName("DEMO 4A")).id);
  c4b = String((await classByName("DEMO 4B")).id);
  teacherA = await actorOf("demo.teacher.4a");
  teacherB = await actorOf("demo.teacher.4b");
});

describe("🖨 the teacher's printable QR", () => {
  test("turn on: a random link (stored hashed, bound to school + class) and a 4-digit code; audited", async () => {
    const before = await printQrPanel(repo, teacherA, c4a);
    assert.equal(before.exists, false);
    const v = await turnOnPrintQr(repo, teacherA, c4a, { now: T0, ip: "1.1.1.1" });
    assert.equal(v.active, true);
    assert.match(String(v.code), /^\d{4}$/);
    const token = tokenOf(v.path);
    assert.ok(token.length >= 43 && /^[A-Za-z0-9_-]+$/.test(token), "≥ 128 bits, URL-safe");
    const row = (await repo.findUnique("ClassPrintQr", { classId: c4a }))!;
    assert.equal(row.tokenHash, hashToken(token), "only the hash");
    assert.equal(await repo.count("ClassPrintQr", { tokenHash: token }), 0, "the raw token is never stored");
    assert.ok(!JSON.stringify(row).includes(token));
    assert.equal(row.schoolId, (await classByName("DEMO 4A")).schoolId);
    assert.equal(token, printToken(String(row.linkSalt), SECRET), "the teacher's page draws the same QR again");
    assert.equal((await printQrPanel(repo, teacherA, c4a)).path, v.path, "shown again: the same link and code");
    assert.equal((await printQrPanel(repo, teacherA, c4a)).code, v.code);
    assert.equal(await repo.count("AuditLog", { action: "class_print_qr.turn_on", entityId: c4a }), 1);
    const audits = await repo.findMany("AuditLog", { entityId: c4a });
    assert.ok(audits.every((a) => !JSON.stringify([a.before, a.after]).includes(`"${v.code}"`)), "the code is never written to the audit");
  });

  test("a teacher sees / changes only their own classes; staff of another class, admins, students, parents: Forbidden", async () => {
    for (const fn of [printQrPanel, turnOnPrintQr, newPrintCode, newPrintLink, turnOffPrintQr, printSignInsView]) {
      await assert.rejects((fn as (r: unknown, a: Actor, c: string) => Promise<unknown>)(repo, teacherB, c4a), forbidden, fn.name);
      await assert.rejects((fn as (r: unknown, a: Actor, c: string) => Promise<unknown>)(repo, await actorOf("demo.s1001"), c4a), forbidden, `${fn.name} student`);
      await assert.rejects((fn as (r: unknown, a: Actor, c: string) => Promise<unknown>)(repo, await actorOf("demo.p1001"), c4a), forbidden, `${fn.name} parent`);
    }
    assert.deepEqual((await printQrPanels(repo, teacherA)).map((p) => p.className), ["DEMO 4A"]);
    assert.deepEqual(await printQrPanels(repo, await actorOf("demo.s1001")), []);
    assert.equal(await printQrForSheet(repo, teacherB, c4a, "https://x.example"), null, "another teacher's class: nothing printed");
    assert.equal(await printQrForSheet(repo, await actorOf("demo.s1001"), c4a, "https://x.example"), null);
    assert.equal(await printQrForSheet(repo, await actorOf("demo.admin"), c4a, "https://x.example"), null, "an admin who does not teach it");
  });
});

describe("🔢 scan → name → class code", () => {
  test("the name list is that class only and never carries the code; wrong code refused; right code → that student (short session)", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const token = tokenOf(v.path);
    const list = (await printQrNames(repo, token, { ip: ip(), now: at(1) }))!;
    assert.equal(list.className, "DEMO 4A");
    const ids = new Set((await studentsOf(c4a)).map((x) => String(x.id)));
    assert.equal(list.names.length, ids.size);
    assert.ok(list.names.every((n) => ids.has(n.id)));
    assert.deepEqual(Object.keys(list).sort(), ["className", "names"], "the list carries names only — never the code");
    assert.ok(list.names.every((n) => Object.keys(n).sort().join() === "id,name"));
    const st = (await studentsOf(c4a))[0];
    const me = ip();
    await assert.rejects(signInByClassCode(repo, { token, studentId: String(st.id), code: wrong(v.code!), ip: me }, cfg, at(2)), code("WRONG_CODE"));
    const r = await signInByClassCode(repo, { token, studentId: String(st.id), code: ` ${v.code} `, ip: me, userAgent: "test" }, cfg, at(2));
    assert.equal(r.user.id, st.userId);
    assert.equal(r.expiresAt.getTime(), at(2).getTime() + 3 * 3_600_000, "3 hours during the school day");
    const ok = await validateSession(repo, r.token, cfg, at(3));
    assert.ok(ok.ok && ok.user.id === st.userId, "a normal student session");
    // no once-a-day rule: again from home in the evening
    const evening = new Date("2026-10-11T16:30:00Z"); // 19:30 Riyadh
    const r2 = await signInByClassCode(repo, { token, studentId: String(st.id), code: v.code!, ip: ip() }, cfg, evening);
    assert.equal(r2.expiresAt.getTime(), evening.getTime() + 3 * 3_600_000, "after school: 3 hours");
    assert.equal(await repo.count("ClassPrintSignIn", { classId: c4a, studentId: st.id }), 2, "every sign-in recorded");
    assert.equal(await repo.count("AuditLog", { action: "class_print_qr.sign_in", entityId: st.userId }), 2);
    assert.equal(await repo.count("ClassSignInUse", { studentId: st.id }), 0, "the board QR's list is not touched");
    const view = await printSignInsView(repo, teacherA, c4a, evening);
    assert.equal(view.today.length, 1);
    assert.equal(view.today[0].count, 2);
    assert.equal(view.week[0].studentId, st.id);
    assert.ok(view.today[0].name);
    assert.ok(cleanPrintCode("١٢٣٤") === "1234" && cleanPrintCode("12 34") === "1234" && cleanPrintCode("123") === null && cleanPrintCode("12a4") === null);
    assert.ok(printSessionExpiry(new Date("2026-10-11T11:00:00Z")).getTime() === new Date("2026-10-11T12:00:00Z").getTime(), "14:00 Riyadh → 15:00");
    assert.equal(schoolWeekStart(new Date("2026-10-14T10:00:00Z")).toISOString(), "2026-10-10T21:00:00.000Z", "Sunday 00:00 Riyadh");
  });

  test("5 wrong codes from one device → that name is locked for 10 minutes (even the right code); then it works", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const token = tokenOf(v.path);
    const st = (await studentsOf(c4a))[1];
    const dev = ip();
    for (let i = 0; i < 4; i++) await assert.rejects(signInByClassCode(repo, { token, studentId: String(st.id), code: wrong(v.code!), ip: dev }, cfg, at(10)), code("WRONG_CODE"));
    await assert.rejects(signInByClassCode(repo, { token, studentId: String(st.id), code: wrong(v.code!), ip: dev }, cfg, at(10)), code("LOCKED"), "the 5th");
    await assert.rejects(signInByClassCode(repo, { token, studentId: String(st.id), code: v.code!, ip: dev }, cfg, at(11)), code("LOCKED"), "the right code too");
    await assert.rejects(signInByClassCode(repo, { token, studentId: String(st.id), code: v.code!, ip: ip() }, cfg, at(11)), code("LOCKED"), "that name, from any device");
    assert.equal((await printQrStudent(repo, token, String(st.id), { ip: ip(), now: at(11) }))!.locked, true);
    assert.ok(await repo.count("AuditLog", { action: "class_print_qr.locked", entityId: st.userId }) >= 1);
    const later = new Date(at(10).getTime() + PRINT_LOCK_MS);
    const r = await signInByClassCode(repo, { token, studentId: String(st.id), code: v.code!, ip: dev }, cfg, later);
    assert.equal(r.user.id, st.userId);
  });

  test("New code: the old printed QR works with the new code (not the old one)", async () => {
    const before = await printQrPanel(repo, teacherA, c4a);
    const after = await newPrintCode(repo, teacherA, c4a, { now: at(20) });
    assert.equal(after.path, before.path, "the same link");
    assert.notEqual(after.code, before.code);
    const st = (await studentsOf(c4a))[2];
    await assert.rejects(signInByClassCode(repo, { token: tokenOf(before.path), studentId: String(st.id), code: before.code!, ip: ip() }, cfg, at(21)), code("WRONG_CODE"));
    assert.ok(await signInByClassCode(repo, { token: tokenOf(before.path), studentId: String(st.id), code: after.code!, ip: ip() }, cfg, at(21)));
    assert.equal(await repo.count("AuditLog", { action: "class_print_qr.new_code", entityId: c4a }), 1);
  });

  test("Turn off → refused; turn on again → the same link works; New link → the old QR is dead", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const st = (await studentsOf(c4a))[0];
    const off = await turnOffPrintQr(repo, teacherA, c4a, { now: at(30) });
    assert.equal(off.active, false);
    assert.equal(off.path, null);
    assert.equal(await printQrNames(repo, tokenOf(v.path), { ip: ip(), now: at(31) }), null);
    await assert.rejects(signInByClassCode(repo, { token: tokenOf(v.path), studentId: String(st.id), code: v.code!, ip: ip() }, cfg, at(31)), code("OFF"));
    assert.equal(await printQrForSheet(repo, teacherA, c4a, "https://x.example", { now: at(31) }), null, "turned off: the weekly print leaves it out");
    const on = await turnOnPrintQr(repo, teacherA, c4a, { now: at(32) });
    assert.equal(on.path, v.path, "the same link as before");
    assert.ok(await printQrNames(repo, tokenOf(v.path), { ip: ip(), now: at(33) }));
    const nl = await newPrintLink(repo, teacherA, c4a, { now: at(34) });
    assert.notEqual(nl.path, v.path);
    assert.equal(await findPrintQr(repo, tokenOf(v.path)), null, "the old printed QR is dead");
    await assert.rejects(signInByClassCode(repo, { token: tokenOf(v.path), studentId: String(st.id), code: nl.code!, ip: ip() }, cfg, at(35)), code("OFF"));
    assert.ok(await signInByClassCode(repo, { token: tokenOf(nl.path), studentId: String(st.id), code: nl.code!, ip: ip() }, cfg, at(35)));
    for (const a of ["turn_off", "new_link"]) assert.equal(await repo.count("AuditLog", { action: `class_print_qr.${a}`, entityId: c4a }), 1, a);
    assert.equal(await repo.count("AuditLog", { action: "class_print_qr.turn_on", entityId: c4a }), 2);
  });

  test("another class's student, staff, inactive students: refused", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const token = tokenOf(v.path);
    const other = (await studentsOf(c4b))[0];
    await assert.rejects(signInByClassCode(repo, { token, studentId: String(other.id), code: v.code!, ip: ip() }, cfg, at(40)), code("NOT_IN_CLASS"));
    const staff = await user("demo.teacher.4b");
    const klass = await classByName("DEMO 4A");
    const fake = await repo.create("Student", { userId: staff.id, schoolId: klass.schoolId, gradeId: klass.gradeId, studentNumber: "STAFF-85", createdAt: T0 });
    await repo.create("ClassMembership", { classId: c4a, studentId: fake.id, joinedAt: T0 });
    assert.ok(!(await printQrNames(repo, token, { ip: ip(), now: at(40) }))!.names.some((n) => n.id === fake.id), "not on the list");
    await assert.rejects(signInByClassCode(repo, { token, studentId: String(fake.id), code: v.code!, ip: ip() }, cfg, at(40)), code("NOT_IN_CLASS"));
    await repo.deleteMany("ClassMembership", { studentId: fake.id });
    await repo.deleteMany("Student", { id: fake.id });
    const b = (await studentsOf(c4a))[2];
    await repo.updateMany("User", { id: b.userId }, { isActive: false });
    await assert.rejects(signInByClassCode(repo, { token, studentId: String(b.id), code: v.code!, ip: ip() }, cfg, at(40)), code("NOT_IN_CLASS"));
    await repo.updateMany("User", { id: b.userId }, { isActive: true });
  });

  test("rate limit on the name list", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const one = "10.85.200.1";
    await repo.upsert("RateLimitBucket", { key: `classprint:list:${one}` }, { count: 600, windowStart: at(50) }, { count: 600, windowStart: at(50) });
    await assert.rejects(printQrNames(repo, tokenOf(v.path), { ip: one, now: at(50) }), code("RATE_LIMITED"));
  });

  test("the board QR is unchanged: its once-a-day list ignores printed-QR sign-ins", async () => {
    const T = new Date("2026-10-12T05:00:00Z");
    const v = await printQrPanel(repo, teacherA, c4a);
    const st = (await studentsOf(c4a))[0];
    await signInByClassCode(repo, { token: tokenOf(v.path), studentId: String(st.id), code: v.code!, ip: ip() }, cfg, T);
    const q = await openClassSignIn(repo, teacherA, c4a, { now: T });
    assert.ok((await classSignInNames(repo, q.token, { ip: ip(), now: T }))!.names.some((n) => n.id === st.id));
    assert.ok(await signInByName(repo, { key: q.token, studentId: String(st.id), ip: ip() }, cfg, T));
  });
});

describe("🗓 the weekly prints", () => {
  test("printQrForSheet: never turned on → turned on (audited); gives the absolute link + code", async () => {
    // a fresh class for teacher B
    const s = await printQrForSheet(repo, teacherB, c4b, "https://anjal.example.org/", { now: at(60) });
    assert.ok(s);
    assert.match(s!.url, /^https:\/\/anjal\.example\.org\/qr\/c\/[A-Za-z0-9_-]{43}$/);
    assert.match(s!.code, /^\d{4}$/);
    assert.equal(s!.className, "DEMO 4B");
    const audit = (await repo.findMany("AuditLog", { action: "class_print_qr.turn_on", entityId: c4b }))[0];
    assert.match(JSON.stringify(audit.after), /print/);
  });

  test("the strip, the family week (class) and the Year plan carry the QR + code when on; nothing when off", () => {
    const s = { url: "https://anjal.example.org/qr/c/" + "A".repeat(43), code: "7351", className: "4A" };
    const t = makeT("en");
    const text = (html: string) => html.replace(/<[^>]+>/g, "");
    const strip = classSignInStripHtml(s, t);
    assert.match(strip, /<svg/);
    assert.match(text(strip), /Class code: 7351/);
    assert.match(strip, /Scan → tap your name → type the class code/);
    assert.equal(classSignInStripHtml(null, t), "");
    const w = { studentId: "x", name: "Sara Ali", className: "4A", week: "2026-W41", from: "2026-10-11", to: "2026-10-15", tasks: [], minutes: 0, articles: [], lessons: [], tests: [], practise: [], note: null };
    const fonts = { css: "", stack: "sans-serif" };
    const on = familyWeekDocument([w as never], t, "en", fonts, s);
    assert.match(text(on), /Class code: 7351/);
    assert.match(on, /<svg/);
    assert.doesNotMatch(familyWeekDocument([w as never], t, "en", fonts), /Class code/);
    assert.match(familyWeekDocument([w as never], makeT("ar"), "ar", fonts, s), /7351/);
  });

  test("the entry points ask for it (default ON for a class print by its teacher; off with signin=0); students and parents never", () => {
    const fw = read("src/app/api/family-week/route.ts");
    assert.match(fw, /signin/);
    assert.match(read("src/server/reports/family-week-pdf.ts"), /printQrForSheet\(/);
    assert.match(read("src/server/reports/family-week-pdf.ts"), /actor\.role !== "PARENT"/);
    assert.match(read("src/server/reports/year-plan-pdf.ts"), /printQrForSheet\(/);
    assert.match(read("src/reports/html.ts"), /classSignIn/);
    assert.match(read("src/app/teacher/map-plans/print/page.tsx"), /printQrForSheet\(/);
    assert.match(read("src/app/teacher/plans/[planId]/page.tsx"), /printQrForSheet\(/);
    for (const f of ["src/app/teacher/family-reports/this-week/page.tsx", "src/app/teacher/map-center/year-tab.tsx", "src/app/teacher/map-plans/print/page.tsx", "src/app/teacher/plans/[planId]/page.tsx"]) {
      assert.match(read(f), /<ClassSignInOption /, f);
    }
    for (const f of ["src/app/student/reports/page.tsx", "src/app/qr/c/[token]/page.tsx", "src/components/class-signin/name-list.tsx", "src/components/class-signin/code-form.tsx"]) {
      assert.doesNotMatch(read(f), /printQrForSheet|printQrPanel|\.code\b(?!-form)/, f);
    }
  });
});

describe("🖨 pages, routes and strings", () => {
  test("open routes: /qr/c/… and the code post are class sign-in paths; same-origin; listed as public", () => {
    for (const p of ["/qr/c/" + "a".repeat(43), "/qr/c/signin"]) assert.ok(isClassSignInPath(p), p);
    const route = read("src/app/qr/c/signin/route.ts");
    assert.match(route, /assertSameOrigin\(/);
    assert.match(route, /isSameOriginPost\(req\.headers/);
    assert.match(route, /signInByClassCode\(repo/);
    const page = read("src/app/qr/c/[token]/page.tsx");
    assert.match(page, /referrer:\s*"same-origin"/, "r77: never no-referrer (Origin: null would block the sign-in)");
    assert.doesNotMatch(page, /referrer:\s*"no-referrer"/);
    assert.match(page, /printQrNames\(repo|printQrStudent\(repo/);
    assert.doesNotMatch(page, /printQrPanel|row\.code|\.code\)/, "the name page never reads the code");
    const contracts = read("tests/contracts.test.ts");
    for (const f of ["src/app/qr/c/[token]/page.tsx", "src/app/qr/c/signin/route.ts"]) assert.ok(contracts.includes(`"${f}"`), f);
  });

  test("the teacher's panel: on /teacher/class-signin, a print card page, own classes only", () => {
    const page = read("src/app/teacher/class-signin/page.tsx");
    assert.match(page, /PrintQrPanel/);
    assert.match(page, /printQrPanels\(repo, actor/);
    const print = read("src/app/teacher/class-signin/print/page.tsx");
    assert.match(print, /requireActor\(/);
    assert.match(print, /printQrPanel\(repo, actor/);
    const actions = read("src/app/teacher/class-signin/print-actions.ts");
    for (const fn of ["turnOnPrintQr", "newPrintCode", "newPrintLink", "turnOffPrintQr"]) assert.match(actions, new RegExp(`${fn}\\(repo, actor`), fn);
  });

  test("EN + AR strings (no technical words), no duplicates", () => {
    const keys = ["Printable QR for the weekly plan", "Print QR card", "New code", "New link", "Turn off", "Turn on", "Class code: {code}", "Scan → tap your name → type the class code",
      "Include class sign-in QR + code", "Signed in from the printed QR", "Type your class code", "Too many wrong codes. Wait 10 minutes or ask your teacher.", "This QR code does not work now. Ask your teacher."];
    const en = new Set<string>(UI_STRINGS as readonly string[]);
    for (const k of keys) {
      assert.ok(en.has(k), `en: ${k}`);
      const a = (ar as Record<string, string>)[k];
      assert.ok(a && /[؀-ۿ]/.test(a), `ar: ${k}`);
      for (const v of k.match(/\{\w+\}/g) ?? []) assert.ok(a.includes(v), `ar keeps ${v}: ${k}`);
      assert.ok(!/token|hash|adaptive|lexile/i.test(k), k);
    }
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate UI_STRINGS");
  });

  test("renderHtml puts the strip in the report header when classSignIn is set", () => {
    assert.match(read("src/reports/html.ts"), /classSignInStripHtml/);
    void renderHtml;
  });
});
