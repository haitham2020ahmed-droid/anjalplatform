/**
 * 🖨 Printable class QR + class code (r85, owner-approved): for the weekly plan sheet — students sign in at school or
 * at home. Separate from the 10-minute board QR (class-signin.ts), which stays exactly as it was.
 *
 *   printQrPanel        the teacher's panel for one of their classes: on/off, the QR link, the 4-digit code (teacher only)
 *   turnOnPrintQr       first time: a new link + code; again after "Turn off": the SAME link (old printed sheets work again)
 *   newPrintCode        a new 4-digit code; the printed QR keeps working (with the new code)
 *   newPrintLink        a new link: every QR printed before stops working
 *   turnOffPrintQr      the printed QR stops working until it is turned on again
 *   printSignInsView    who signed in from the printed QR, today and this week
 *   printQrForSheet     for the weekly prints: { url, code } when the teacher teaches the class and the QR is on
 *   printQrNames        the student page: the class's names (first name, last initial on clashes) — never the code
 *   printQrStudent      the code page: the tapped name (to say "Hi Sara")
 *   signInByClassCode   name + the class code → that student's normal session, short (end of school day / 3 hours;
 *                       after school hours 3 hours). No once-a-day rule; every sign-in is recorded and audited.
 *
 * The link: /qr/c/<token>. token = HMAC-SHA256(APP_SECRET, linkSalt) (256 bits); only SHA-256(token) is stored
 * (tokenHash, looked up on every visit) and the server can draw the same QR again for the teacher. A database copy
 * without APP_SECRET cannot rebuild a working link.
 * The code: 4 digits, kept in ClassPrintQr.code — read only by the teacher-side functions here (each one checks live
 * that the actor teaches the class) and compared on the server at sign-in. Hashing 4 digits would protect nothing
 * (10,000 tries offline) and the teacher must see it again; what protects it is the lock (5 wrong from one
 * device/address in 10 minutes → that name is locked for 10 minutes), the per-name cap across addresses, the rate
 * limits, and that it is never sent to a student page.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { audit } from "../audit";
import type { Repo, Row } from "../seeding/repo";
import { hashToken, type AuthConfig } from "./config";
import { consumeRateLimit, peekRateLimit } from "./rate-limit";
import { ForbiddenError, type Actor } from "./rbac";
import { createSession, type SessionMeta } from "./sessions";
import { classSessionExpiry, classStudents, listNames, QR_SESSION_HOURS, SCHOOL_DAY_ENDS_HOUR, schoolDay, taughtClass, teacherSignInClasses } from "./class-signin";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const toDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
const RIYADH_MS = 3 * 3_600_000;

/** The 4-digit class code. */
export const PRINT_CODE_LENGTH = 4;
/** Wrong codes from one device/address for one name before that name is locked … */
export const PRINT_WRONG_MAX = 5;
/** … within this window, and the lock lasts this long. */
export const PRINT_LOCK_MS = 10 * 60_000;
/** Rate limits (per 15 minutes). A whole class can share one school address. */
export const PRINT_LIMITS = { windowMs: 15 * 60_000, listPerIp: 600, signInPerIp: 300, wrongPerName: 15, wrongPerIp: 40 };

export class PrintQrError extends Error {
  constructor(readonly code: "OFF" | "WRONG_CODE" | "LOCKED" | "NOT_IN_CLASS" | "RATE_LIMITED", message: string) { super(message); }
}

/** The secret behind the printed links (APP_SECRET; checked at boot in production). */
export function printQrSecret(): string {
  const v = typeof process !== "undefined" ? process.env.APP_SECRET : undefined;
  if (v && v.length >= 32) return v;
  if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET is not set.");
  return "literise-development-only-printable-qr-secret";
}

/** The link token for a salt (URL-safe, 43 characters, 256 bits). */
export function printToken(salt: string, secret = printQrSecret()): string {
  return createHmac("sha256", secret).update(`class-print-qr:${salt}`).digest("base64url");
}

export const printQrPath = (token: string) => `/qr/c/${token}`;

function newCode(old?: string): string {
  let c = "";
  for (let i = 0; i < 20 && (!c || c === old); i++) c = String(randomInt(10_000)).padStart(PRINT_CODE_LENGTH, "0");
  return c;
}

/** A typed code, tidied (spaces allowed, Arabic-Indic digits too); null when it cannot be a code. */
export function cleanPrintCode(v: unknown): string | null {
  const c = s(v).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${PRINT_CODE_LENGTH}}$`).test(c) ? c : null;
}

/** A session from the printed QR: during the school day the board QR's rule (end of day / 3 hours); after school 3 hours. */
export function printSessionExpiry(now: Date): Date {
  const day = schoolDay(now);
  const end = Date.parse(`${day}T00:00:00Z`) - RIYADH_MS + SCHOOL_DAY_ENDS_HOUR * 3_600_000;
  return now.getTime() >= end ? new Date(now.getTime() + QR_SESSION_HOURS * 3_600_000) : classSessionExpiry(now);
}

/** Sunday 00:00 (Riyadh) of this school week. */
export function schoolWeekStart(now: Date): Date {
  const local = new Date(now.getTime() + RIYADH_MS);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - RIYADH_MS;
  return new Date(dayStart - local.getUTCDay() * 86_400_000);
}

// ------------------------------------------------------------------ teacher side

const rowOf = async (repo: Repo, classId: string) => repo.findUnique("ClassPrintQr", { classId });

export interface PrintQrView {
  classId: string;
  className: string;
  /** never turned on yet */
  exists: boolean;
  active: boolean;
  /** the link path (/qr/c/<token>) — only when on */
  path: string | null;
  /** the 4-digit class code — the teacher's page only */
  code: string | null;
  codeChangedAt: string | null;
}

const view = (klass: Row, row: Row | null, secret?: string): PrintQrView => ({
  classId: s(klass.id),
  className: s(klass.name),
  exists: Boolean(row),
  active: Boolean(row?.active),
  path: row?.active ? printQrPath(printToken(s(row.linkSalt), secret)) : null,
  code: row ? s(row.code) : null,
  codeChangedAt: row ? toDate(row.codeChangedAt).toISOString() : null,
});

/** The panel of ONE class this teacher teaches (Forbidden otherwise). */
export async function printQrPanel(repo: Repo, actor: Actor, classId: string, opts: { secret?: string } = {}): Promise<PrintQrView> {
  const { klass } = await taughtClass(repo, actor, classId);
  return view(klass, await rowOf(repo, classId), opts.secret);
}

type Opts = { now?: Date; ip?: string | null; secret?: string; via?: string };
const log = (repo: Repo, actor: Actor, action: string, classId: string, after: Record<string, unknown>, o: Opts, now: Date) =>
  audit(repo, { actorId: actor.userId, action, entityType: "Class", entityId: classId, after, ip: o.ip ?? null, at: now });

/** Turn on (first time: a new link + code; after "Turn off": the same link and code as before). */
export async function turnOnPrintQr(repo: Repo, actor: Actor, classId: string, o: Opts = {}): Promise<PrintQrView> {
  const now = o.now ?? new Date();
  const { klass } = await taughtClass(repo, actor, classId);
  const row = await rowOf(repo, classId);
  if (!row) {
    const linkSalt = randomBytes(32).toString("base64url");
    await repo.create("ClassPrintQr", { schoolId: s(klass.schoolId), classId, linkSalt, tokenHash: hashToken(printToken(linkSalt, o.secret)), code: newCode(), active: true, createdById: actor.userId, codeChangedAt: now, linkChangedAt: now, turnedOffAt: null, createdAt: now });
    await log(repo, actor, "class_print_qr.turn_on", classId, { first: true, ...(o.via ? { via: o.via } : {}) }, o, now);
  } else if (!row.active) {
    await repo.updateMany("ClassPrintQr", { id: row.id }, { active: true, turnedOffAt: null });
    await log(repo, actor, "class_print_qr.turn_on", classId, { first: false }, o, now);
  }
  return view(klass, await rowOf(repo, classId), o.secret);
}

/** A new 4-digit code (the printed QR keeps working, with the new code). */
export async function newPrintCode(repo: Repo, actor: Actor, classId: string, o: Opts = {}): Promise<PrintQrView> {
  const now = o.now ?? new Date();
  const { klass } = await taughtClass(repo, actor, classId);
  const row = await rowOf(repo, classId);
  if (!row) return turnOnPrintQr(repo, actor, classId, o);
  await repo.updateMany("ClassPrintQr", { id: row.id }, { code: newCode(s(row.code)), codeChangedAt: now });
  await log(repo, actor, "class_print_qr.new_code", classId, {}, o, now);
  return view(klass, await rowOf(repo, classId), o.secret);
}

/** A new link: every QR printed before stops working (also turns the printed QR on). */
export async function newPrintLink(repo: Repo, actor: Actor, classId: string, o: Opts = {}): Promise<PrintQrView> {
  const now = o.now ?? new Date();
  const { klass } = await taughtClass(repo, actor, classId);
  const row = await rowOf(repo, classId);
  if (!row) return turnOnPrintQr(repo, actor, classId, o);
  const linkSalt = randomBytes(32).toString("base64url");
  await repo.updateMany("ClassPrintQr", { id: row.id }, { linkSalt, tokenHash: hashToken(printToken(linkSalt, o.secret)), linkChangedAt: now, active: true, turnedOffAt: null });
  await log(repo, actor, "class_print_qr.new_link", classId, {}, o, now);
  return view(klass, await rowOf(repo, classId), o.secret);
}

/** Turn off: the printed QR stops working until it is turned on again. */
export async function turnOffPrintQr(repo: Repo, actor: Actor, classId: string, o: Opts = {}): Promise<PrintQrView> {
  const now = o.now ?? new Date();
  const { klass } = await taughtClass(repo, actor, classId);
  const row = await rowOf(repo, classId);
  if (row?.active) {
    await repo.updateMany("ClassPrintQr", { id: row.id }, { active: false, turnedOffAt: now });
    await log(repo, actor, "class_print_qr.turn_off", classId, {}, o, now);
  }
  return view(klass, await rowOf(repo, classId), o.secret);
}

export interface PrintSignInLine { studentId: string; name: string; at: string; count: number }

/** 👀 Who signed in from the printed QR: today and this week (one line per student, the latest time; light: two reads). */
export async function printSignInsView(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<{ today: PrintSignInLine[]; week: PrintSignInLine[] }> {
  const { klass } = await taughtClass(repo, actor, classId);
  const since = schoolWeekStart(now);
  const rows = await repo.findMany("ClassPrintSignIn", { classId, createdAt: { gte: since } }, { select: ["studentId", "userId", "day", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 2000 });
  if (!rows.length) return { today: [], week: [] };
  const users = await repo.findMany("User", { id: { in: [...new Set(rows.map((r) => s(r.userId)))] }, schoolId: s(klass.schoolId) }, { select: ["id", "displayName"] });
  const nameOf = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const group = (list: Row[]) => {
    const m = new Map<string, PrintSignInLine>();
    for (const r of list) {
      const k = s(r.studentId), at = toDate(r.createdAt).toISOString();
      const x = m.get(k);
      if (x) { x.count++; if (at > x.at) x.at = at; } else m.set(k, { studentId: k, name: nameOf.get(s(r.userId)) ?? "", at, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.at.localeCompare(a.at));
  };
  const today = schoolDay(now);
  return { today: group(rows.filter((r) => s(r.day) === today)), week: group(rows) };
}

/** The panels of every class this teacher teaches (the Class sign-in page; one small read per class). */
export async function printQrPanels(repo: Repo, actor: Actor, opts: { secret?: string } = {}): Promise<PrintQrView[]> {
  const classes = await teacherSignInClasses(repo, actor);
  if (!classes.length) return [];
  const rows = await repo.findMany("ClassPrintQr", { classId: { in: classes.map((c) => c.id) } });
  const byClass = new Map(rows.map((r) => [s(r.classId), r]));
  return classes.map((c) => view({ id: c.id, name: c.name } as Row, byClass.get(c.id) ?? null, opts.secret));
}

export interface SheetSignIn { url: string; code: string; className: string }

/**
 * For a weekly print of ONE class: the QR link (absolute) and the code, when the actor teaches the class. Never
 * turned on yet → it is turned on now (audited, via "print"); turned off by the teacher → nothing (null). Another
 * teacher's class, an admin who does not teach it, a student or a parent → null.
 */
export async function printQrForSheet(repo: Repo, actor: Actor, classId: string, origin: string, o: Opts = {}): Promise<SheetSignIn | null> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") return null;
  let v: PrintQrView;
  try {
    v = await printQrPanel(repo, actor, classId, o);
    if (!v.exists) v = await turnOnPrintQr(repo, actor, classId, { ...o, via: "print" });
  } catch (e) {
    if (e instanceof ForbiddenError || (e as { status?: number })?.status === 403) return null;
    throw e;
  }
  return v.active && v.path && v.code ? { url: `${origin.replace(/\/$/, "")}${v.path}`, code: v.code, className: v.className } : null;
}

// ------------------------------------------------------------------ student side (no session yet)

async function limit(repo: Repo, key: string, max: number, windowMs: number, now: Date) {
  const r = await consumeRateLimit(repo, key, max, windowMs, now);
  if (!r.allowed) throw new PrintQrError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
}

/** A printed QR's token → its row when it is on (null: unknown, an old link, or turned off). */
export async function findPrintQr(repo: Repo, token: string): Promise<Row | null> {
  const k = s(token).trim();
  if (k.length < 40 || k.length > 100 || !/^[A-Za-z0-9_-]+$/.test(k)) return null;
  const row = await repo.findUnique("ClassPrintQr", { tokenHash: hashToken(k) });
  return row && row.active ? row : null;
}

/** 📋 The names of the printed QR's class (null when the QR is off or unknown). Never the code. */
export async function printQrNames(repo: Repo, token: string, opts: { ip?: string | null; now?: Date } = {}): Promise<{ className: string; names: { id: string; name: string }[] } | null> {
  const now = opts.now ?? new Date();
  await limit(repo, `classprint:list:${opts.ip ?? "unknown"}`, PRINT_LIMITS.listPerIp, PRINT_LIMITS.windowMs, now);
  const row = await findPrintQr(repo, token);
  if (!row) return null;
  const classId = s(row.classId);
  const [klass, students] = await Promise.all([repo.findUnique("Class", { id: classId }), classStudents(repo, classId, s(row.schoolId))]);
  if (!klass || klass.deletedAt) return null;
  return { className: s(klass.name), names: listNames(students.map((x) => ({ id: x.studentId, name: x.name }))) };
}

/** The tapped name, as shown on the list (null: not a student of that class). */
export async function printQrStudent(repo: Repo, token: string, studentId: string, opts: { ip?: string | null; now?: Date } = {}): Promise<{ className: string; name: string; locked: boolean } | null> {
  const data = await printQrNames(repo, token, opts);
  const n = data?.names.find((x) => x.id === s(studentId));
  if (!data || !n) return null;
  const lock = await peekRateLimit(repo, `classprint:lock:${n.id}`, 1, PRINT_LOCK_MS, opts.now ?? new Date());
  return { className: data.className, name: n.name, locked: !lock.allowed };
}

/**
 * 👆 fix (Oct 2026, "الكود مالوش داعي... اي حد ممكن يستخدمه"): tap a name → straight in, same as the board QR
 * (class-signin.ts#signInByName) — no class code. The code used to be the only thing standing between "someone has
 * the printed sheet" and "someone can sign in as any name on it" — but the code is printed ON that same sheet, so
 * it never actually raised that bar; it only cost the real student an extra step. The per-IP rate limit below still
 * guards against bulk/automated sign-in attempts. No once-a-day rule (a sheet is meant to be reused all week); every
 * sign-in is still recorded (ClassPrintSignIn) and audited (class_print_qr.sign_in).
 */
export async function signInByName(repo: Repo, input: { token: string; studentId: string } & SessionMeta, cfg: AuthConfig, now = new Date()): Promise<{ token: string; expiresAt: Date; user: Row }> {
  const ip = input.ip ?? "unknown";
  await limit(repo, `classprint:signin:${ip}`, PRINT_LIMITS.signInPerIp, PRINT_LIMITS.windowMs, now);
  const row = await findPrintQr(repo, input.token);
  if (!row) throw new PrintQrError("OFF", "This QR code does not work now. Ask your teacher.");
  const classId = s(row.classId);
  const st = (await classStudents(repo, classId, s(row.schoolId))).find((x) => x.studentId === s(input.studentId));
  if (!st) throw new PrintQrError("NOT_IN_CLASS", "This name is not in this class.");
  const user = await repo.findUnique("User", { id: st.userId });
  // students only: a staff, admin or parent account can never sign in this way
  if (!user || user.role !== "STUDENT" || !user.isActive || user.deletedAt) throw new PrintQrError("NOT_IN_CLASS", "This name is not in this class.");
  const expiresAt = printSessionExpiry(now);
  const session = await createSession(repo, user, { ...cfg, sessionTtlMinutes: (expiresAt.getTime() - now.getTime()) / 60_000 }, { ip, userAgent: input.userAgent }, now);
  await repo.create("ClassPrintSignIn", { printQrId: s(row.id), schoolId: s(row.schoolId), classId, studentId: st.studentId, userId: st.userId, day: schoolDay(now), createdAt: now });
  await repo.updateMany("User", { id: user.id }, { lastLoginAt: now });
  await audit(repo, { actorId: st.userId, action: "class_print_qr.sign_in", entityType: "User", entityId: st.userId, after: { classId, via: "printed QR" }, ip, at: now });
  return { token: session.token, expiresAt: session.expiresAt, user };
}

const sameCode = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** 🔢 Name + class code → that student's own session (students only, of THAT class; short). */
export async function signInByClassCode(repo: Repo, input: { token: string; studentId: string; code: string } & SessionMeta, cfg: AuthConfig, now = new Date()): Promise<{ token: string; expiresAt: Date; user: Row }> {
  const ip = input.ip ?? "unknown";
  await limit(repo, `classprint:signin:${ip}`, PRINT_LIMITS.signInPerIp, PRINT_LIMITS.windowMs, now);
  const row = await findPrintQr(repo, input.token);
  if (!row) throw new PrintQrError("OFF", "This QR code does not work now. Ask your teacher.");
  const classId = s(row.classId);
  const st = (await classStudents(repo, classId, s(row.schoolId))).find((x) => x.studentId === s(input.studentId));
  if (!st) throw new PrintQrError("NOT_IN_CLASS", "This name is not in this class.");
  const user = await repo.findUnique("User", { id: st.userId });
  // students only: a staff, admin or parent account can never sign in this way
  if (!user || user.role !== "STUDENT" || !user.isActive || user.deletedAt) throw new PrintQrError("NOT_IN_CLASS", "This name is not in this class.");
  const lockKey = `classprint:lock:${st.studentId}`;
  if (!(await peekRateLimit(repo, lockKey, 1, PRINT_LOCK_MS, now)).allowed) throw new PrintQrError("LOCKED", "Too many wrong codes. Wait 10 minutes or ask your teacher.");
  const code = cleanPrintCode(input.code);
  if (!code || !sameCode(code, s(row.code))) {
    const dev = await consumeRateLimit(repo, `classprint:wrong:${ip}:${st.studentId}`, PRINT_WRONG_MAX, PRINT_LOCK_MS, now);
    const name = await consumeRateLimit(repo, `classprint:wrongname:${st.studentId}`, PRINT_LIMITS.wrongPerName, PRINT_LOCK_MS, now);
    const addr = await consumeRateLimit(repo, `classprint:wrongip:${ip}`, PRINT_LIMITS.wrongPerIp, PRINT_LIMITS.windowMs, now);
    if (dev.remaining <= 0 || name.remaining <= 0 || !dev.allowed || !name.allowed) {
      await repo.upsert("RateLimitBucket", { key: lockKey }, { count: 1, windowStart: now }, { count: 1, windowStart: now });
      await audit(repo, { actorId: st.userId, action: "class_print_qr.locked", entityType: "User", entityId: st.userId, after: { classId }, ip, at: now });
      throw new PrintQrError("LOCKED", "Too many wrong codes. Wait 10 minutes or ask your teacher.");
    }
    if (!addr.allowed) throw new PrintQrError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
    throw new PrintQrError("WRONG_CODE", "That code is not right. Check it and try again.");
  }
  const expiresAt = printSessionExpiry(now);
  const session = await createSession(repo, user, { ...cfg, sessionTtlMinutes: (expiresAt.getTime() - now.getTime()) / 60_000 }, { ip, userAgent: input.userAgent }, now);
  await repo.create("ClassPrintSignIn", { printQrId: s(row.id), schoolId: s(row.schoolId), classId, studentId: st.studentId, userId: st.userId, day: schoolDay(now), createdAt: now });
  await repo.updateMany("User", { id: user.id }, { lastLoginAt: now });
  await audit(repo, { actorId: st.userId, action: "class_print_qr.sign_in", entityType: "User", entityId: st.userId, after: { classId, via: "printed QR" }, ip, at: now });
  return { token: session.token, expiresAt: session.expiresAt, user };
}
