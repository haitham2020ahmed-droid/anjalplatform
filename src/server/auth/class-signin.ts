/**
 * 📱 Class QR sign-in (r76, owner-approved): students sign in fast in class.
 *
 *   teacherSignInClasses   the classes this teacher teaches (read live every time: ClassTeacher → Class)
 *   openClassSignIn        a NEW QR for one class: random 256-bit token (only its SHA-256 stored) + a short code;
 *                          ends after 10 minutes; any older open QR of this class by this teacher is closed (dead)
 *   closeClassSignIn       the teacher's "Close"
 *   findOpenSignIn         token (from the QR) or short code → the open QR, or null (expired / closed / unknown)
 *   classSignInNames       the names on the student page: active students of THAT class who have not signed in by
 *                          QR today (first name; same first name → + last initial, like the Live Challenge board)
 *   signInByName           tap a name → that student's normal session, but short: ends at the end of the school day
 *                          or after 3 hours, whichever comes first (shared classroom devices)
 *   classSignInRoster      the teacher's live list: ✅ signed in today / ⏳ not yet
 *   signOutClassStudent    ends ALL of that student's sessions; the name comes back on the list
 *   letInClassStudent      a late student: the name is available again, and a QR is opened if none is open
 *
 * Guardrails: only the class's own teacher (checked live on every call); the QR works for its class only; only active
 * students of that class (never staff, admin or parent accounts); rate limits (rate-limit.ts) on the name list, the
 * code and the sign-in; audit entries for open, close, sign-in, sign-out and let-in.
 */
import { randomInt } from "node:crypto";
import { audit } from "../audit";
import type { Repo, Row } from "../seeding/repo";
import { generateToken, hashToken, type AuthConfig } from "./config";
import { consumeRateLimit } from "./rate-limit";
import { ForbiddenError, type Actor } from "./rbac";
import { createSession, revokeAllSessions, type SessionMeta } from "./sessions";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const toDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

/** A QR stays open this long. */
export const QR_MINUTES = 10;
/** A session made by a class QR ends after this many hours at most … */
export const QR_SESSION_HOURS = 3;
/** … or at the end of the school day (Riyadh time, UTC+3, no daylight saving), whichever comes first. */
export const SCHOOL_DAY_ENDS_HOUR = 15;
const RIYADH_MS = 3 * 3_600_000;
/** No I, O, 0 or 1: easy to read on a projector and to type. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** Rate limits (per 15 minutes). A whole class can share one school address, so the per-address numbers are generous. */
export const QR_LIMITS = { windowMs: 15 * 60_000, listPerIp: 600, codePerIp: 120, signInPerIp: 300, signInPerQr: 150 };

export class ClassSignInError extends Error {
  constructor(readonly code: "ENDED" | "TAKEN" | "NOT_IN_CLASS" | "RATE_LIMITED", message: string) { super(message); }
}

/** The school day (Riyadh) as YYYY-MM-DD. */
export function schoolDay(now: Date): string {
  return new Date(now.getTime() + RIYADH_MS).toISOString().slice(0, 10);
}

/** When a session made by a class QR ends: the end of the school day or 3 hours, whichever is first. */
export function classSessionExpiry(now: Date): Date {
  const day = schoolDay(now);
  const dayStart = Date.parse(`${day}T00:00:00Z`) - RIYADH_MS;
  let end = dayStart + SCHOOL_DAY_ENDS_HOUR * 3_600_000;
  if (now.getTime() >= end) end = dayStart + 24 * 3_600_000; // after school: midnight at the latest
  return new Date(Math.min(now.getTime() + QR_SESSION_HOURS * 3_600_000, end));
}

export function newCode(): string {
  let c = "";
  for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}

/** A typed code, tidied (spaces and lower case allowed); null when it cannot be a code. */
export function cleanCode(v: unknown): string | null {
  const c = s(v).toUpperCase().replace(/[\s-]/g, "");
  return c.length === CODE_LENGTH && [...c].every((x) => CODE_ALPHABET.includes(x)) ? c : null;
}

/** First name; the same first name twice → + last initial; still the same → the full name (Live Challenge rule). */
export function listNames(people: { id: string; name: string }[]): { id: string; name: string }[] {
  const parts = (n: string) => n.trim().split(/\s+/).filter(Boolean);
  const first = (n: string) => parts(n)[0] ?? n;
  const short = (n: string) => { const p = parts(n); return p.length > 1 ? `${p[0]} ${[...p[p.length - 1]][0]}.` : first(n); };
  const count = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x.toLowerCase(), (m.get(x.toLowerCase()) ?? 0) + 1); return m; };
  const firsts = count(people.map((p) => first(p.name)));
  const step1 = people.map((p) => ((firsts.get(first(p.name).toLowerCase()) ?? 0) > 1 ? short(p.name) : first(p.name)));
  const shorts = count(step1);
  const coll = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  return people.map((p, i) => ({ id: p.id, name: (shorts.get(step1[i].toLowerCase()) ?? 0) > 1 ? p.name.trim() : step1[i] }))
    .sort((a, b) => coll.compare(a.name, b.name));
}

// ------------------------------------------------------------------ teacher side

async function teacherRow(repo: Repo, actor: Actor): Promise<Row | null> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") return null;
  return repo.findUnique("Teacher", { userId: actor.userId });
}

/** The classes this teacher teaches, sorted by name — read live (a change by the admin shows at once). */
export async function teacherSignInClasses(repo: Repo, actor: Actor): Promise<{ id: string; name: string }[]> {
  const t = await teacherRow(repo, actor);
  if (!t) return [];
  const links = await repo.findMany("ClassTeacher", { teacherId: t.id }, { select: ["classId"] });
  if (!links.length) return [];
  const classes = await repo.findMany("Class", { id: { in: links.map((l) => l.classId) }, deletedAt: null }, { select: ["id", "name", "schoolId"] });
  const coll = new Intl.Collator(undefined, { numeric: true });
  return classes.filter((c) => !actor.schoolId || s(c.schoolId) === actor.schoolId)
    .map((c) => ({ id: s(c.id), name: s(c.name) })).sort((a, b) => coll.compare(a.name, b.name));
}

/** The class, when this actor teaches it now; otherwise Forbidden. */
async function taughtClass(repo: Repo, actor: Actor, classId: string): Promise<{ klass: Row; teacherId: string }> {
  const t = await teacherRow(repo, actor);
  const link = t && classId ? (await repo.findMany("ClassTeacher", { classId, teacherId: t.id }, { take: 1 }))[0] ?? null : null;
  const klass = link ? await repo.findUnique("Class", { id: classId }) : null;
  if (!t || !klass || klass.deletedAt || (actor.schoolId && s(klass.schoolId) !== actor.schoolId)) throw new ForbiddenError("Only the class's own teacher can do this.");
  return { klass, teacherId: s(t.id) };
}

export interface OpenedSignIn { id: string; token: string; code: string; expiresAt: Date; classId: string; className: string }

/** A new QR for one class (the teacher's older open QR of this class ends: its token is dead). */
export async function openClassSignIn(repo: Repo, actor: Actor, classId: string, opts: { now?: Date; ip?: string | null } = {}): Promise<OpenedSignIn> {
  const now = opts.now ?? new Date();
  const { klass, teacherId } = await taughtClass(repo, actor, classId);
  await repo.updateMany("ClassSignIn", { classId, teacherId, closedAt: null }, { closedAt: now });
  const live = new Set((await repo.findMany("ClassSignIn", { closedAt: null, expiresAt: { gt: now } }, { select: ["code"] })).map((r) => s(r.code)));
  let code = newCode();
  for (let i = 0; i < 20 && live.has(code); i++) code = newCode();
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + QR_MINUTES * 60_000);
  const row = await repo.create("ClassSignIn", { tokenHash: hashToken(token), code, schoolId: s(klass.schoolId), classId, teacherId, expiresAt, closedAt: null, createdAt: now });
  await audit(repo, { actorId: actor.userId, action: "class_signin.open", entityType: "Class", entityId: classId, after: { signInId: s(row.id), expiresAt: expiresAt.toISOString() }, ip: opts.ip ?? null, at: now });
  return { id: s(row.id), token, code, expiresAt, classId, className: s(klass.name) };
}

/** The teacher's own QR (and the class is still theirs). */
async function ownSignIn(repo: Repo, actor: Actor, signInId: string): Promise<Row> {
  const row = signInId ? await repo.findUnique("ClassSignIn", { id: signInId }) : null;
  if (!row) throw new ForbiddenError("Only the class's own teacher can do this.");
  const { teacherId } = await taughtClass(repo, actor, s(row.classId));
  if (s(row.teacherId) !== teacherId) throw new ForbiddenError("Only the class's own teacher can do this.");
  return row;
}

export async function closeClassSignIn(repo: Repo, actor: Actor, signInId: string, opts: { now?: Date; ip?: string | null } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const row = await ownSignIn(repo, actor, signInId);
  if (row.closedAt) return;
  await repo.updateMany("ClassSignIn", { id: row.id }, { closedAt: now });
  await audit(repo, { actorId: actor.userId, action: "class_signin.close", entityType: "Class", entityId: s(row.classId), after: { signInId: s(row.id) }, ip: opts.ip ?? null, at: now });
}

const isOpen = (row: Row | null, now: Date) => Boolean(row && !row.closedAt && toDate(row.expiresAt) > now);

/** Active students of a class: { studentId, userId, name }. */
async function classStudents(repo: Repo, classId: string, schoolId: string): Promise<{ studentId: string; userId: string; name: string }[]> {
  const members = await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] });
  if (!members.length) return [];
  const students = await repo.findMany("Student", { id: { in: members.map((m) => m.studentId) }, deletedAt: null }, { select: ["id", "userId", "schoolId"] });
  const mine = students.filter((x) => s(x.schoolId) === schoolId);
  if (!mine.length) return [];
  const users = await repo.findMany("User", { id: { in: mine.map((x) => x.userId) }, role: "STUDENT", isActive: true, deletedAt: null }, { select: ["id", "displayName"] });
  const nameOf = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  return mine.filter((x) => nameOf.has(s(x.userId))).map((x) => ({ studentId: s(x.id), userId: s(x.userId), name: nameOf.get(s(x.userId))! }));
}

/** studentIds signed in by QR today in this class (not signed out / let in again since). */
async function signedInToday(repo: Repo, classId: string, now: Date): Promise<Map<string, Date>> {
  const uses = await repo.findMany("ClassSignInUse", { classId, day: schoolDay(now), signedOutAt: null }, { select: ["studentId", "createdAt"] });
  return new Map(uses.map((u) => [s(u.studentId), toDate(u.createdAt)]));
}

export interface RosterView {
  open: boolean;
  expiresAt: string;
  className: string;
  students: { id: string; name: string; in: boolean; at: string | null }[];
}

/** 👀 The teacher's live list (polled every few seconds: a few small reads, tiny JSON). */
export async function classSignInRoster(repo: Repo, actor: Actor, signInId: string, now = new Date()): Promise<RosterView> {
  const row = await ownSignIn(repo, actor, signInId);
  const classId = s(row.classId);
  const [klass, students, done] = await Promise.all([repo.findUnique("Class", { id: classId }), classStudents(repo, classId, s(row.schoolId)), signedInToday(repo, classId, now)]);
  const coll = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  return {
    open: isOpen(row, now),
    expiresAt: toDate(row.expiresAt).toISOString(),
    className: s(klass?.name),
    students: students.map((x) => ({ id: x.studentId, name: x.name, in: done.has(x.studentId), at: done.get(x.studentId)?.toISOString() ?? null }))
      .sort((a, b) => coll.compare(a.name, b.name)),
  };
}

async function studentOfClass(repo: Repo, classId: string, schoolId: string, studentId: string) {
  const x = (await classStudents(repo, classId, schoolId)).find((y) => y.studentId === studentId);
  if (!x) throw new ForbiddenError("This student is not in the class.");
  return x;
}

/** ⏏ Sign out: ends every session of the student; the name comes back on the list. */
export async function signOutClassStudent(repo: Repo, actor: Actor, classId: string, studentId: string, opts: { now?: Date; ip?: string | null } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const { klass } = await taughtClass(repo, actor, classId);
  const st = await studentOfClass(repo, classId, s(klass.schoolId), studentId);
  await revokeAllSessions(repo, st.userId);
  await repo.updateMany("ClassSignInUse", { classId, studentId, day: schoolDay(now), signedOutAt: null }, { signedOutAt: now });
  await audit(repo, { actorId: actor.userId, action: "class_signin.sign_out", entityType: "User", entityId: st.userId, after: { classId, studentId }, ip: opts.ip ?? null, at: now });
}

/** ➕ Let in a late student: the name is on the list again; when no QR of this class is open, a new one opens. */
export async function letInClassStudent(repo: Repo, actor: Actor, classId: string, studentId: string, opts: { now?: Date; ip?: string | null } = {}): Promise<{ opened: OpenedSignIn | null }> {
  const now = opts.now ?? new Date();
  const { klass, teacherId } = await taughtClass(repo, actor, classId);
  const st = await studentOfClass(repo, classId, s(klass.schoolId), studentId);
  await repo.updateMany("ClassSignInUse", { classId, studentId, day: schoolDay(now), signedOutAt: null }, { signedOutAt: now });
  await audit(repo, { actorId: actor.userId, action: "class_signin.let_in", entityType: "User", entityId: st.userId, after: { classId, studentId }, ip: opts.ip ?? null, at: now });
  const open = (await repo.findMany("ClassSignIn", { classId, teacherId, closedAt: null, expiresAt: { gt: now } }, { take: 1 }))[0];
  return { opened: open ? null : await openClassSignIn(repo, actor, classId, opts) };
}

// ------------------------------------------------------------------ student side (no session yet)

/** A key from the QR link (the long token) or a typed short code → the open QR, or null. */
export async function findOpenSignIn(repo: Repo, key: string, now = new Date()): Promise<Row | null> {
  const k = s(key).trim();
  if (k.length >= 40 && k.length <= 100 && /^[A-Za-z0-9_-]+$/.test(k)) {
    const row = await repo.findUnique("ClassSignIn", { tokenHash: hashToken(k) });
    return isOpen(row, now) ? row : null;
  }
  const code = cleanCode(k);
  if (!code) return null;
  const rows = await repo.findMany("ClassSignIn", { code, closedAt: null, expiresAt: { gt: now } }, { take: 1 });
  return rows[0] ?? null;
}

const isCodeKey = (key: string) => s(key).trim().length < 40;

/** Rate limit for a student page / sign-in (throws RATE_LIMITED). */
async function limit(repo: Repo, key: string, max: number, now: Date) {
  const r = await consumeRateLimit(repo, key, max, QR_LIMITS.windowMs, now);
  if (!r.allowed) throw new ClassSignInError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
}

/** 📋 The student page: the class name and the names still to sign in (null when the QR has ended). */
export async function classSignInNames(repo: Repo, key: string, opts: { ip?: string | null; now?: Date } = {}): Promise<{ className: string; names: { id: string; name: string }[] } | null> {
  const now = opts.now ?? new Date();
  const ip = opts.ip ?? "unknown";
  await limit(repo, `classqr:list:${ip}`, QR_LIMITS.listPerIp, now);
  if (isCodeKey(key)) await limit(repo, `classqr:code:${ip}`, QR_LIMITS.codePerIp, now);
  const row = await findOpenSignIn(repo, key, now);
  if (!row) return null;
  const classId = s(row.classId);
  const [klass, students, done] = await Promise.all([repo.findUnique("Class", { id: classId }), classStudents(repo, classId, s(row.schoolId)), signedInToday(repo, classId, now)]);
  if (!klass || klass.deletedAt) return null;
  return { className: s(klass.name), names: listNames(students.filter((x) => !done.has(x.studentId)).map((x) => ({ id: x.studentId, name: x.name }))) };
}

/** 👆 Tap a name: that student's own session (short: end of school day / 3 hours). Students only, of THAT class. */
export async function signInByName(repo: Repo, input: { key: string; studentId: string } & SessionMeta, cfg: AuthConfig, now = new Date()): Promise<{ token: string; expiresAt: Date; user: Row }> {
  const ip = input.ip ?? "unknown";
  await limit(repo, `classqr:signin:${ip}`, QR_LIMITS.signInPerIp, now);
  if (isCodeKey(input.key)) await limit(repo, `classqr:code:${ip}`, QR_LIMITS.codePerIp, now);
  const row = await findOpenSignIn(repo, input.key, now);
  if (!row) throw new ClassSignInError("ENDED", "This QR code has ended. Ask your teacher to show it again.");
  await limit(repo, `classqr:qr:${s(row.id)}`, QR_LIMITS.signInPerQr, now);
  const classId = s(row.classId);
  const st = (await classStudents(repo, classId, s(row.schoolId))).find((x) => x.studentId === s(input.studentId));
  if (!st) throw new ClassSignInError("NOT_IN_CLASS", "This name is not in this class.");
  const user = await repo.findUnique("User", { id: st.userId });
  // students only: a staff, admin or parent account can never sign in this way
  if (!user || user.role !== "STUDENT" || !user.isActive || user.deletedAt) throw new ClassSignInError("NOT_IN_CLASS", "This name is not in this class.");
  if ((await signedInToday(repo, classId, now)).has(st.studentId)) throw new ClassSignInError("TAKEN", "This name has already signed in. Ask your teacher.");
  const expiresAt = classSessionExpiry(now);
  const session = await createSession(repo, user, { ...cfg, sessionTtlMinutes: (expiresAt.getTime() - now.getTime()) / 60_000 }, { ip, userAgent: input.userAgent }, now);
  await repo.create("ClassSignInUse", { signInId: s(row.id), schoolId: s(row.schoolId), classId, studentId: st.studentId, userId: st.userId, day: schoolDay(now), createdAt: now, signedOutAt: null });
  await repo.updateMany("User", { id: user.id }, { lastLoginAt: now });
  await audit(repo, { actorId: st.userId, action: "class_signin.sign_in", entityType: "User", entityId: st.userId, after: { classId, signInId: s(row.id), via: "class QR" }, ip, at: now });
  return { token: session.token, expiresAt: session.expiresAt, user };
}
