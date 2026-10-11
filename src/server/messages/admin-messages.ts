/**
 * ✉️ Messages from the school admin to teachers. Each message arrives in the teacher's platform inbox
 * (/teacher/messages, plus a bell notification) and, when SMTP is configured, by email.
 *
 * Email never blocks or breaks sending: every recipient gets a status — SENT, FAILED, NO_EMAIL (no address on
 * the account) or OFF (email not configured). The email contains only what the admin typed and a link back to
 * the platform; never student data the admin did not write.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { consumeRateLimit } from "../auth/rate-limit";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { mailEnabled, sendMail } from "../mail/mailer";

export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
export const MESSAGES_PER_DAY = 20;
const EMAIL_CONCURRENCY = 3;

/** Teacher report pages a message can point to (all open to teachers with reports:read). */
export const REPORT_LINKS = [
  { key: "class-ai", label: "Class AI (today's picture of the class)", href: "/teacher/ai" },
  { key: "students", label: "Students progress", href: "/teacher/progress" },
  { key: "alerts", label: "Student alerts", href: "/teacher/alerts" },
  { key: "reports", label: "Reports", href: "/teacher/reports" },
  { key: "map-reports", label: "MAP reports", href: "/teacher/map-reports" },
  { key: "growth", label: "MAP growth", href: "/teacher/growth" },
  { key: "grade-summary", label: "Grade summary", href: "/teacher/grade-summary" },
  { key: "curriculum-results", label: "Curriculum results", href: "/teacher/curriculum-results" },
  { key: "practice-analytics", label: "Practice analytics", href: "/teacher/practice-analytics" },
  { key: "knowledge-graph", label: "Knowledge graph", href: "/teacher/knowledge-graph" },
] as const;

export type AudienceKind = "ALL" | "GRADE" | "SELECTED";
export interface Audience { kind: AudienceKind; grades?: number[]; userIds?: string[] }
export interface SendInput { subject: string; body: string; audience: Audience; reportKey?: string | null }
export type EmailStatus = "SENT" | "FAILED" | "NO_EMAIL" | "OFF";

const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

function assertSchoolAdmin(actor: Actor): string {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the school admin can send messages to teachers.");
  assertCan(actor, "teachers:manage");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return actor.schoolId;
}

/** Active teachers of the school with the grades they teach. */
export async function schoolTeachers(repo: Repo, schoolId: string): Promise<{ userId: string; name: string; hasEmail: boolean; grades: number[] }[]> {
  const users = (await repo.findMany("User", { schoolId, role: "TEACHER", isActive: true, deletedAt: null })).sort((a, b) => s(a.displayName).localeCompare(s(b.displayName)));
  if (!users.length) return [];
  const teachers = await repo.findMany("Teacher", { userId: { in: users.map((u) => u.id) } });
  const links = teachers.length ? await repo.findMany("ClassTeacher", { teacherId: { in: teachers.map((t) => t.id) } }) : [];
  const classes = links.length ? await repo.findMany("Class", { id: { in: [...new Set(links.map((l) => l.classId))] }, deletedAt: null }) : [];
  const grades = await repo.findMany("Grade", { schoolId });
  const levelOfGrade = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const levelOfClass = new Map(classes.map((c) => [s(c.id), levelOfGrade.get(s(c.gradeId))]));
  const userOfTeacher = new Map(teachers.map((t) => [s(t.id), s(t.userId)]));
  const gradesOf = new Map<string, Set<number>>();
  for (const l of links) {
    const lvl = levelOfClass.get(s(l.classId));
    const u = userOfTeacher.get(s(l.teacherId));
    if (lvl == null || !u) continue;
    (gradesOf.get(u) ?? gradesOf.set(u, new Set()).get(u)!).add(lvl);
  }
  return users.map((u) => ({ userId: s(u.id), name: s(u.displayName), hasEmail: s(u.email).includes("@"), grades: [...(gradesOf.get(s(u.id)) ?? [])].sort((a, b) => a - b) }));
}

/** What the compose form needs. */
export async function composeOptions(repo: Repo, actor: Actor) {
  const schoolId = assertSchoolAdmin(actor);
  const teachers = await schoolTeachers(repo, schoolId);
  const grades = (await repo.findMany("Grade", { schoolId })).filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
  return { teachers, grades, reports: REPORT_LINKS.map((r) => ({ key: r.key, label: r.label })), emailOn: mailEnabled() };
}

function validate(input: SendInput) {
  const subject = s(input.subject).replace(/[\r\n]+/g, " ").trim();
  const body = s(input.body).replace(/\r\n?/g, "\n").trim();
  if (!subject) throw new ValidationError("Write a subject.");
  if (subject.length > SUBJECT_MAX) throw new ValidationError(`The subject is too long (at most ${SUBJECT_MAX} characters).`);
  if (!body) throw new ValidationError("Write the message.");
  if (body.length > BODY_MAX) throw new ValidationError(`The message is too long (at most ${BODY_MAX} characters).`);
  const report = input.reportKey ? REPORT_LINKS.find((r) => r.key === input.reportKey) : undefined;
  if (input.reportKey && !report) throw new ValidationError("Choose a report from the list.");
  const kind = input.audience?.kind;
  if (kind !== "ALL" && kind !== "GRADE" && kind !== "SELECTED") throw new ValidationError("Choose who receives the message.");
  return { subject, body, report };
}

export const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The email for one message (plain text + HTML). Only what the admin wrote, and a link to the platform. */
export function messageEmail(m: { subject: string; body: string; sender: string; school: string; url: string | null; reportLabel?: string | null }) {
  const lines = [m.body, "", `— ${m.sender}${m.school ? `, ${m.school}` : ""}`];
  if (m.reportLabel) lines.push("", `Report: ${m.reportLabel} (open the message on the platform)`);
  if (m.url) lines.push("", `Open on the platform: ${m.url}`);
  const text = lines.join("\n");
  const btn = m.url
    ? `<p style="margin:24px 0"><a href="${escapeHtml(m.url)}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">Open on the platform</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e2e8f0">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(m.subject)}</h1>
<div style="font-size:15px;line-height:1.6">${escapeHtml(m.body).replace(/\n/g, "<br>")}</div>
<p style="color:#475569;font-size:14px;margin-top:20px">— ${escapeHtml(m.sender)}${m.school ? `, ${escapeHtml(m.school)}` : ""}</p>
${m.reportLabel ? `<p style="font-size:14px">📊 Report: <b>${escapeHtml(m.reportLabel)}</b></p>` : ""}
${btn}
</div>
<p style="color:#94a3b8;font-size:12px;text-align:center">You received this because you are a teacher on the school platform.</p>
</div></body></html>`;
  return { text, html };
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

export interface SendResult { id: string; recipients: number; emailed: number; emailFailed: number; noEmail: number; emailOn: boolean; emailDone: Promise<void> }

/**
 * Sends a message to the chosen teachers of the admin's school. With `background: true` the emails go out after
 * this returns (the page does not wait); `emailDone` resolves when they are finished. Never throws because of email.
 */
export async function sendAdminMessage(repo: Repo, actor: Actor, input: SendInput, opts: { now?: Date; appUrl?: string; background?: boolean } = {}): Promise<SendResult> {
  const schoolId = assertSchoolAdmin(actor);
  const now = opts.now ?? new Date();
  const { subject, body, report } = validate(input);
  const teachers = await schoolTeachers(repo, schoolId);
  const kind = input.audience.kind;
  let chosen: typeof teachers;
  let audience: Audience = { kind };
  if (kind === "ALL") chosen = teachers;
  else if (kind === "GRADE") {
    const grades = [...new Set((input.audience.grades ?? []).map(Number).filter(Number.isFinite))];
    if (!grades.length) throw new ValidationError("Choose at least one grade.");
    chosen = teachers.filter((t) => t.grades.some((g) => grades.includes(g)));
    audience = { kind, grades };
  } else {
    const ids = [...new Set((input.audience.userIds ?? []).map(String))];
    if (!ids.length) throw new ValidationError("Choose at least one teacher.");
    const byId = new Map(teachers.map((t) => [t.userId, t]));
    if (ids.some((id) => !byId.has(id))) throw new ValidationError("Some of the chosen teachers are not active teachers of your school.");
    chosen = ids.map((id) => byId.get(id)!);
    audience = { kind, userIds: ids };
  }
  if (!chosen.length) throw new ValidationError(kind === "GRADE" ? "No teacher teaches a class in the chosen grade(s)." : "There are no active teachers to send to.");

  const limit = await consumeRateLimit(repo, `admin-message:${actor.userId}`, MESSAGES_PER_DAY, 86_400_000, now);
  if (!limit.allowed) throw new ValidationError(`You can send up to ${MESSAGES_PER_DAY} messages a day. Try again in ${Math.ceil(limit.retryAfterMs / 3_600_000)} hour(s).`);

  const emailOn = mailEnabled();
  const users = new Map((await repo.findMany("User", { id: { in: chosen.map((t) => t.userId) } })).map((u) => [s(u.id), u]));
  const sender = await repo.findUnique("User", { id: actor.userId });
  const school = await repo.findUnique("School", { id: schoolId });
  const msg = await repo.create("AdminMessage", { schoolId, senderId: actor.userId, subject, body, link: report?.href ?? null, audience, recipients: chosen.length, emailed: 0, emailFailed: 0, createdAt: now });
  const id = s(msg.id);
  const link = `/teacher/messages/${id}`;
  const preview = body.length > 200 ? `${body.slice(0, 197)}…` : body;
  const toEmail: { userId: string; email: string }[] = [];
  let noEmail = 0;
  for (const t of chosen) {
    const n = await repo.create("Notification", { userId: t.userId, type: "ADMIN_MESSAGE", title: subject, body: preview, link, readAt: null, createdAt: now });
    const email = s(users.get(t.userId)?.email).trim();
    const status = !emailOn ? "OFF" : email.includes("@") ? "PENDING" : "NO_EMAIL";
    if (status === "PENDING") toEmail.push({ userId: t.userId, email });
    if (status === "NO_EMAIL") noEmail++;
    await repo.create("AdminMessageRecipient", { messageId: id, userId: t.userId, notificationId: s(n.id), emailStatus: status, readAt: null });
  }
  await audit(repo, { actorId: actor.userId, action: "message.admin.send", entityType: "AdminMessage", entityId: id, after: { audience, recipients: chosen.length, report: report?.key ?? null }, at: now });

  const result: SendResult = { id, recipients: chosen.length, emailed: 0, emailFailed: 0, noEmail, emailOn, emailDone: Promise.resolve() };
  if (!toEmail.length) return result;
  const base = (opts.appUrl ?? process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  const mail = messageEmail({ subject, body, sender: s(sender?.displayName) || "School admin", school: s(school?.name), url: /^https?:\/\//.test(base) ? `${base}${link}` : null, reportLabel: report?.label ?? null });
  const deliver = async () => {
    await pool(toEmail, EMAIL_CONCURRENCY, async (r) => {
      let status: EmailStatus = "SENT";
      try { await sendMail({ to: r.email, subject, text: mail.text, html: mail.html }); result.emailed++; }
      catch (e) { status = "FAILED"; result.emailFailed++; console.warn(`[mail] admin message ${id}: email to a teacher failed: ${(e as Error).message}`); }
      try { await repo.updateMany("AdminMessageRecipient", { messageId: id, userId: r.userId }, { emailStatus: status }); } catch { /* keep going */ }
    });
    try { await repo.updateMany("AdminMessage", { id }, { emailed: result.emailed, emailFailed: result.emailFailed }); } catch { /* keep going */ }
  };
  const done = deliver().catch((e) => { console.warn(`[mail] admin message ${id}: ${(e as Error).message}`); });
  result.emailDone = done;
  if (!opts.background) await done;
  return result;
}

/** The admin's history: newest first, with read counts. */
export async function listAdminMessages(repo: Repo, actor: Actor, limit = 50) {
  const schoolId = assertSchoolAdmin(actor);
  const msgs = await repo.findMany("AdminMessage", { schoolId }, { orderBy: [{ field: "createdAt", dir: "desc" }, { field: "id", dir: "desc" }], take: limit });
  if (!msgs.length) return [];
  const recs = await repo.findMany("AdminMessageRecipient", { messageId: { in: msgs.map((m) => m.id) } });
  const senders = new Map((await repo.findMany("User", { id: { in: [...new Set(msgs.map((m) => s(m.senderId)))] } })).map((u) => [s(u.id), s(u.displayName)]));
  return msgs.map((m) => {
    const mine = recs.filter((r) => r.messageId === m.id);
    const count = (st: string) => mine.filter((r) => r.emailStatus === st).length;
    return {
      id: s(m.id), subject: s(m.subject), createdAt: iso(m.createdAt), sender: senders.get(s(m.senderId)) ?? "",
      audience: (m.audience ?? { kind: "ALL" }) as Audience, report: REPORT_LINKS.find((r) => r.href === m.link)?.label ?? null,
      recipients: Number(m.recipients) || mine.length, emailed: Number(m.emailed) || count("SENT"), emailFailed: Number(m.emailFailed) || count("FAILED"),
      pending: count("PENDING"), noEmail: count("NO_EMAIL"), emailOff: count("OFF"), read: mine.filter((r) => r.readAt).length,
    };
  });
}

/** The teacher's messages: newest first, unread marked. */
export async function teacherInbox(repo: Repo, actor: Actor) {
  const recs = await repo.findMany("AdminMessageRecipient", { userId: actor.userId });
  if (!recs.length) return [];
  const msgs = await repo.findMany("AdminMessage", { id: { in: recs.map((r) => r.messageId) } });
  const senders = new Map((await repo.findMany("User", { id: { in: [...new Set(msgs.map((m) => s(m.senderId)))] } })).map((u) => [s(u.id), s(u.displayName)]));
  const readOf = new Map(recs.map((r) => [s(r.messageId), Boolean(r.readAt)]));
  return msgs
    .map((m: Row) => ({ id: s(m.id), subject: s(m.subject), preview: s(m.body).slice(0, 140), sender: senders.get(s(m.senderId)) ?? "School admin", createdAt: iso(m.createdAt), read: readOf.get(s(m.id)) ?? false }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export const unreadMessages = (repo: Repo, actor: Actor) => repo.count("AdminMessageRecipient", { userId: actor.userId, readAt: null });

/** Opens one message (only its recipient can) and marks it — and its bell notification — read. */
export async function openMessage(repo: Repo, actor: Actor, id: string, now = new Date()) {
  const rec = await repo.findUnique("AdminMessageRecipient", { messageId: id, userId: actor.userId });
  const m = rec ? await repo.findUnique("AdminMessage", { id }) : null;
  if (!rec || !m) throw new ForbiddenError("Message not found.");
  if (!rec.readAt) {
    await repo.updateMany("AdminMessageRecipient", { id: rec.id }, { readAt: now });
    if (rec.notificationId) await repo.updateMany("Notification", { id: rec.notificationId, userId: actor.userId, readAt: null }, { readAt: now });
  }
  const sender = await repo.findUnique("User", { id: s(m.senderId) });
  const report = REPORT_LINKS.find((r) => r.href === m.link) ?? null;
  return { id: s(m.id), subject: s(m.subject), body: s(m.body), sender: s(sender?.displayName) || "School admin", createdAt: iso(m.createdAt), report: report ? { label: report.label, href: report.href } : null };
}
