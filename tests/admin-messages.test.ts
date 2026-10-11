/**
 * ✉️ Admin → teacher messages (Test School, fake data): audiences, school scoping, permissions, inbox and read
 * state, email statuses with a fake transport, HTML escaping — and the SMTP client against a tiny fake SMTP
 * server on localhost (EHLO / AUTH / MAIL / RCPT / DATA / QUIT, dot-stuffing).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { composeOptions, listAdminMessages, messageEmail, openMessage, sendAdminMessage, teacherInbox, unreadMessages } from "../src/server/messages/admin-messages";
import { mailEnabled, setMailTransportForTests } from "../src/server/mail/mailer";
import { buildMessage, dotStuff, encodeHeaderWord, sendSmtp, SmtpError } from "../src/server/mail/smtp";
import { demoDatabase } from "./helpers/db";

const SMTP_ENV = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "MAIL_FROM"];
for (const k of SMTP_ENV) delete process.env[k];

describe("admin messages to teachers", () => {
  let repo: SqliteRepo;
  let admin: Actor, t: Actor[], other: Actor;
  const ids: Record<string, string> = {};
  let day = 0;
  const nextDay = () => new Date(Date.UTC(2026, 9, 1 + day++, 8));

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("test.admin");
    t = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => a(`test.teacher.${i}`)));
    other = await a("demo.teacher.4a");
    for (const [i, x] of t.entries()) ids[`t${i + 1}`] = x.userId;
    // teachers 1–3 have email addresses, 4–6 do not
    for (const i of [0, 1, 2]) await repo.updateMany("User", { id: t[i].userId }, { email: `teacher${i + 1}@school.test` });
  });
  after(() => setMailTransportForTests(null));

  test("compose options list the school's active teachers with their grades; email is OFF without SMTP", async () => {
    const o = await composeOptions(repo, admin);
    assert.equal(o.teachers.length, 6);
    assert.deepEqual(o.teachers.find((x) => x.userId === ids.t1)!.grades, [4]);
    assert.ok(!o.teachers.some((x) => x.userId === other.userId));
    assert.equal(o.emailOn, false);
    assert.equal(mailEnabled(), false);
  });

  test("send to all teachers (email OFF): notifications, recipients, link to the message", async () => {
    const r = await sendAdminMessage(repo, admin, { subject: "Staff meeting", body: "Tuesday 2 pm in the library.", audience: { kind: "ALL" } }, { now: nextDay() });
    assert.equal(r.recipients, 6);
    assert.equal(r.emailOn, false);
    const recs = await repo.findMany("AdminMessageRecipient", { messageId: r.id });
    assert.equal(recs.length, 6);
    assert.ok(recs.every((x) => x.emailStatus === "OFF"));
    const n = await repo.findMany("Notification", { userId: ids.t1, type: "ADMIN_MESSAGE" });
    assert.equal(n.length, 1);
    assert.equal(n[0].title, "Staff meeting");
    assert.equal(n[0].link, `/teacher/messages/${r.id}`);
  });

  test("send by grade and to selected teachers; report link kept", async () => {
    const g = await sendAdminMessage(repo, admin, { subject: "Grade 5 data", body: "Please check.", audience: { kind: "GRADE", grades: [5] }, reportKey: "map-reports" }, { now: nextDay() });
    const gRecs = (await repo.findMany("AdminMessageRecipient", { messageId: g.id })).map((x) => x.userId).sort();
    assert.deepEqual(gRecs, [ids.t3, ids.t4].sort());
    const sel = await sendAdminMessage(repo, admin, { subject: "Just you two", body: "Hi", audience: { kind: "SELECTED", userIds: [ids.t2, ids.t6] } }, { now: nextDay() });
    assert.equal(sel.recipients, 2);
    const msg = await openMessage(repo, t[2], g.id);
    assert.deepEqual(msg.report, { label: "MAP reports", href: "/teacher/map-reports" });
  });

  test("other-school ids, empty audiences and bad input are rejected; teachers cannot send", async () => {
    await assert.rejects(sendAdminMessage(repo, admin, { subject: "x", body: "y", audience: { kind: "SELECTED", userIds: [ids.t1, other.userId] } }), ValidationError);
    await assert.rejects(sendAdminMessage(repo, admin, { subject: "x", body: "y", audience: { kind: "SELECTED", userIds: [] } }), ValidationError);
    await assert.rejects(sendAdminMessage(repo, admin, { subject: "x", body: "y", audience: { kind: "GRADE", grades: [] } }), ValidationError);
    await assert.rejects(sendAdminMessage(repo, admin, { subject: "x".repeat(151), body: "y", audience: { kind: "ALL" } }), /too long/);
    await assert.rejects(sendAdminMessage(repo, admin, { subject: "x", body: "y".repeat(5001), audience: { kind: "ALL" } }), /too long/);
    await assert.rejects(sendAdminMessage(repo, admin, { subject: "x", body: "y", audience: { kind: "ALL" }, reportKey: "/admin/users" }), ValidationError);
    await assert.rejects(sendAdminMessage(repo, t[0], { subject: "x", body: "y", audience: { kind: "ALL" } }), ForbiddenError);
    await assert.rejects(listAdminMessages(repo, t[0]), ForbiddenError);
    await assert.rejects(composeOptions(repo, t[0]), ForbiddenError);
  });

  test("email ON with a fake transport: SENT / FAILED / NO_EMAIL counts; never throws", async () => {
    const sent: { to: string; subject: string; html?: string; text: string }[] = [];
    setMailTransportForTests(async (m) => {
      if (m.to === "teacher2@school.test") throw new Error("mailbox unavailable");
      sent.push(m);
    });
    const r = await sendAdminMessage(repo, admin, { subject: "Reports due <Friday>", body: "Line one\n<script>alert(1)</script> & more", audience: { kind: "ALL" } }, { now: nextDay(), appUrl: "https://school.example.org/" });
    assert.equal(r.emailOn, true);
    assert.equal(r.emailed, 2);
    assert.equal(r.emailFailed, 1);
    assert.equal(r.noEmail, 3);
    const recs = await repo.findMany("AdminMessageRecipient", { messageId: r.id });
    const st = (u: string) => recs.find((x) => x.userId === u)!.emailStatus;
    assert.equal(st(ids.t1), "SENT");
    assert.equal(st(ids.t2), "FAILED");
    assert.equal(st(ids.t5), "NO_EMAIL");
    const row = (await repo.findUnique("AdminMessage", { id: r.id }))!;
    assert.equal(Number(row.emailed), 2);
    assert.equal(Number(row.emailFailed), 1);
    const html = sent[0].html!;
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more"));
    assert.ok(html.includes("Line one<br>"));
    assert.ok(html.includes("Reports due &lt;Friday&gt;"));
    assert.ok(html.includes(`href="https://school.example.org/teacher/messages/${r.id}"`));
    assert.ok(sent[0].text.includes(`https://school.example.org/teacher/messages/${r.id}`));
    const hist = (await listAdminMessages(repo, admin))[0];
    assert.equal(hist.id, r.id);
    assert.equal(hist.emailed, 2);
    assert.equal(hist.emailFailed, 1);
    setMailTransportForTests(null);
  });

  test("messageEmail escapes every admin-typed field", () => {
    const e = messageEmail({ subject: "<b>", body: "a\"b'", sender: "<i>Admin</i>", school: "S&S", url: "https://x.test/?a=1&b=2", reportLabel: null });
    assert.ok(e.html.includes("&lt;b&gt;") && e.html.includes("a&quot;b&#39;") && e.html.includes("&lt;i&gt;Admin&lt;/i&gt;") && e.html.includes("S&amp;S"));
    assert.ok(e.html.includes('href="https://x.test/?a=1&amp;b=2"'));
  });

  test("inbox newest first, unread until opened; opening marks the message and its notification read", async () => {
    const inbox = await teacherInbox(repo, t[0]);
    assert.ok(inbox.length >= 2);
    assert.ok(inbox[0].createdAt >= inbox[1].createdAt);
    assert.ok(inbox.every((m) => !m.read));
    const before = await unreadMessages(repo, t[0]);
    const m = await openMessage(repo, t[0], inbox[0].id);
    assert.equal(m.subject, inbox[0].subject);
    assert.equal(await unreadMessages(repo, t[0]), before - 1);
    assert.equal((await teacherInbox(repo, t[0]))[0].read, true);
    const rec = (await repo.findUnique("AdminMessageRecipient", { messageId: inbox[0].id, userId: ids.t1 }))!;
    const n = (await repo.findUnique("Notification", { id: rec.notificationId as string }))!;
    assert.ok(n.readAt);
    const hist = (await listAdminMessages(repo, admin)).find((x) => x.id === inbox[0].id)!;
    assert.equal(hist.read, 1);
  });

  test("a teacher cannot open someone else's message (or another school's)", async () => {
    const sel = (await teacherInbox(repo, t[1])).find((x) => x.subject === "Just you two")!;
    await assert.rejects(openMessage(repo, t[0], sel.id), ForbiddenError);
    await assert.rejects(openMessage(repo, other, sel.id), ForbiddenError);
    await assert.rejects(openMessage(repo, t[0], "missing"), ForbiddenError);
  });

  test("rate limit: at most 20 messages a day per admin", async () => {
    const now = new Date(Date.UTC(2027, 0, 1, 8));
    await repo.deleteMany("RateLimitBucket", { key: `admin-message:${admin.userId}` });
    for (let i = 0; i < 20; i++) await sendAdminMessage(repo, admin, { subject: `n${i}`, body: "b", audience: { kind: "SELECTED", userIds: [ids.t6] } }, { now });
    await assert.rejects(sendAdminMessage(repo, admin, { subject: "too many", body: "b", audience: { kind: "SELECTED", userIds: [ids.t6] } }, { now }), /20 messages a day/);
  });
});

// ----------------------------------------------------------------------------- SMTP client

interface FakeSession { commands: string[]; data: string; authUser?: string; authPass?: string }

/** A tiny plain-text SMTP server: records commands, unstuffs DATA, accepts user "u" / password "p" only. */
function fakeSmtpServer(opts: { auth: "PLAIN" | "LOGIN" | "PLAIN LOGIN"; rejectRcpt?: string } ): Promise<{ port: number; sessions: FakeSession[]; close: () => Promise<void> }> {
  const sessions: FakeSession[] = [];
  const server = net.createServer((sock) => {
    const sess: FakeSession = { commands: [], data: "" };
    sessions.push(sess);
    let buf = "";
    let mode: "cmd" | "data" | "login-user" | "login-pass" = "cmd";
    const say = (l: string) => sock.write(`${l}\r\n`);
    say("220 fake.smtp ready");
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (mode === "data") {
          if (line === ".") { mode = "cmd"; say("250 2.0.0 queued as 42"); }
          else sess.data += `${line.startsWith(".") ? line.slice(1) : line}\r\n`;
          continue;
        }
        if (mode === "login-user") { sess.authUser = Buffer.from(line, "base64").toString(); mode = "login-pass"; say("334 UGFzc3dvcmQ6"); continue; }
        if (mode === "login-pass") { sess.authPass = Buffer.from(line, "base64").toString(); mode = "cmd"; say(sess.authUser === "u" && sess.authPass === "p" ? "235 ok" : "535 bad credentials"); continue; }
        sess.commands.push(line);
        const up = line.toUpperCase();
        if (up.startsWith("EHLO")) { say("250-fake.smtp"); say("250-SIZE 1000000"); say(`250 AUTH ${opts.auth}`); }
        else if (up.startsWith("AUTH PLAIN ")) {
          const [, user, pass] = Buffer.from(line.slice(11), "base64").toString().split("\0");
          sess.authUser = user; sess.authPass = pass;
          say(user === "u" && pass === "p" ? "235 ok" : "535 bad credentials");
        } else if (up === "AUTH LOGIN") { mode = "login-user"; say("334 VXNlcm5hbWU6"); }
        else if (up.startsWith("MAIL FROM:")) say("250 ok");
        else if (up.startsWith("RCPT TO:")) say(opts.rejectRcpt && line.includes(opts.rejectRcpt) ? "550 no such user" : "250 ok");
        else if (up === "DATA") { mode = "data"; say("354 go ahead"); }
        else if (up === "QUIT") { say("221 bye"); sock.end(); }
        else say("502 unknown");
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    port: (server.address() as net.AddressInfo).port, sessions,
    close: () => new Promise((r) => server.close(() => r())),
  })));
}

function decodeQP(s: string): string {
  const bytes = s.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}

describe("SMTP client (fake server on localhost)", () => {
  const base = { host: "127.0.0.1", secure: false, allowInsecureAuth: true, timeoutMs: 3000 } as const;

  test("EHLO → AUTH PLAIN → MAIL → RCPT → DATA (dot-stuffed, multipart, UTF-8 subject) → QUIT", async () => {
    const srv = await fakeSmtpServer({ auth: "PLAIN LOGIN" });
    try {
      const text = "Hello teachers\n.hidden line starts with a dot\n.\nمرحبا ✓";
      const r = await sendSmtp({ ...base, port: srv.port, user: "u", pass: "p" }, { from: "Al-Anjal <noreply@school.test>", to: "t1@school.test", subject: "Réunion — اجتماع", text, html: "<p>Hello</p>" });
      assert.deepEqual(r.accepted, ["t1@school.test"]);
      assert.match(r.response, /^250/);
      const s = srv.sessions[0];
      assert.deepEqual(s.commands.map((c) => c.split(" ")[0].replace(/:.*/, "")), ["EHLO", "AUTH", "MAIL", "RCPT", "DATA", "QUIT"]);
      assert.equal(s.commands[2], "MAIL FROM:<noreply@school.test>");
      assert.equal(s.commands[3], "RCPT TO:<t1@school.test>");
      assert.equal(s.authUser, "u");
      assert.equal(s.authPass, "p");
      assert.match(s.data, /Content-Type: multipart\/alternative; boundary="/);
      assert.match(s.data, /Content-Type: text\/html; charset=UTF-8/);
      const subj = /^Subject: (.*(?:\r\n .*)*)/m.exec(s.data)![1];
      const decoded = subj.split(/\r\n /).map((w) => Buffer.from(/=\?UTF-8\?B\?(.*)\?=/.exec(w)![1], "base64").toString("utf8")).join("");
      assert.equal(decoded, "Réunion — اجتماع");
      const plainPart = s.data.split("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n")[1].split("\r\n--")[0];
      assert.equal(decodeQP(plainPart), text.replace(/\n/g, "\r\n"), "dot-stuffing was undone by the server: the text arrives intact");
    } finally { await srv.close(); }
  });

  test("AUTH LOGIN when only LOGIN is offered; wrong password gives a clear error", async () => {
    const srv = await fakeSmtpServer({ auth: "LOGIN" });
    try {
      await sendSmtp({ ...base, port: srv.port, user: "u", pass: "p" }, { from: "a@b.test", to: ["x@b.test"], subject: "Hi", text: "ok" });
      assert.ok(srv.sessions[0].commands.includes("AUTH LOGIN"));
      await assert.rejects(sendSmtp({ ...base, port: srv.port, user: "u", pass: "wrong" }, { from: "a@b.test", to: "x@b.test", subject: "Hi", text: "ok" }), (e: unknown) => e instanceof SmtpError && /app password/.test(e.message) && e.code === 535);
    } finally { await srv.close(); }
  });

  test("refused recipient, unencrypted login refusal and connection errors are readable", async () => {
    const srv = await fakeSmtpServer({ auth: "PLAIN", rejectRcpt: "nobody@" });
    try {
      await assert.rejects(sendSmtp({ ...base, port: srv.port }, { from: "a@b.test", to: "nobody@b.test", subject: "Hi", text: "ok" }), /RCPT TO nobody@b.test: 550/);
      await assert.rejects(sendSmtp({ host: "127.0.0.1", port: srv.port, secure: false, user: "u", pass: "p", timeoutMs: 3000 }, { from: "a@b.test", to: "x@b.test", subject: "Hi", text: "ok" }), /STARTTLS/);
    } finally { await srv.close(); }
    await assert.rejects(sendSmtp({ ...base, port: 1 }, { from: "a@b.test", to: "x@b.test", subject: "Hi", text: "ok" }), /Could not connect/);
  });

  test("dot-stuffing and header helpers", () => {
    assert.equal(dotStuff(".a\r\nb\n..c"), "..a\r\nb\r\n...c\r\n.\r\n");
    assert.equal(encodeHeaderWord("Plain subject"), "Plain subject");
    assert.equal(encodeHeaderWord("bad\r\nBcc: x@y"), "bad Bcc: x@y");
    const { raw } = buildMessage({ from: "a@b.test", to: "c@d.test\r\nBcc: e@f.test", subject: "s", text: "t" });
    assert.ok(!/^Bcc:/m.test(raw));
  });
});
