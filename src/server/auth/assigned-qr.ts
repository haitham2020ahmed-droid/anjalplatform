/**
 * 🔗 Assignment QR / link (owner request, Oct 2026): a teacher picks one class a specific assigned thing (a skill,
 * a ReadRise article, a test …) was given to, and gets one link / QR code for it — printable on the weekly plan
 * sheet. A student opens it, taps their name (same no-code sign-in as the printed class QR, class-print-qr.ts),
 * and lands straight on THAT thing's own solve page — never the student home page.
 *
 * No new table: the link's token is entirely self-contained — HMAC(APP_SECRET, "kind|itemId|classId") via the
 * generic sign()/verifySigned() in config.ts — so nothing is created ahead of time and nothing can be tampered
 * with (change one character and the signature stops matching). Same secret as the printed class QR (APP_SECRET):
 * one well-tested "is this env configured" check, not a second one.
 *
 * The destination is resolved at sign-in time, for the student who just tapped their name, from the exact key
 * src/server/student/all-work.ts#allWorkItems would itself use for this one assigned thing (keyFor below) — so a
 * kind whose teacher-facing id differs from its "solve" id (ReadRise: the class-article row vs. the article itself)
 * still lands correctly, and a cancelled / since-removed item safely falls back to the student home page instead of
 * a broken link.
 *
 * owner decision (Oct 2026, confirmed explicitly, no PIN): tapping a name signs fully into that account (reports,
 * everything) — same risk already accepted for the printed class QR (class-print-qr.ts). MAP Test (one row per
 * subject, no single id) and Learn / Words (never shown in My Work, an earlier owner decision) have no one
 * resolvable "solve" row, so the teacher-side generator below does not offer a link for those three kinds.
 */
import { audit } from "../audit";
import type { Repo, Row } from "../seeding/repo";
import { allWorkItems } from "../student/all-work";
import { resolveActor } from "./actor";
import { accessibleClasses } from "../teacher/assign";
import { isAssignedKind, type AssignedKind } from "../teacher/assigned";
import { classStudents, listNames } from "./class-signin";
import { sign, verifySigned, type AuthConfig } from "./config";
import { printQrSecret } from "./class-print-qr";
import { ForbiddenError, type Actor } from "./rbac";
import { consumeRateLimit } from "./rate-limit";
import { createSession, type SessionMeta } from "./sessions";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Kinds with no single resolvable "solve" row (see file header). */
const UNSUPPORTED: ReadonlySet<AssignedKind> = new Set(["MAP_TEST", "LEARN", "WORDS"]);
export const isAssignedQrKind = (kind: unknown): kind is AssignedKind => isAssignedKind(kind) && !UNSUPPORTED.has(kind);

const secretOf = (given?: string) => given ?? printQrSecret();
const payloadOf = (kind: AssignedKind, itemId: string, classId: string) => `${kind}|${itemId}|${classId}`;

/** The link's token: tamper-proof, nothing stored anywhere. */
export function assignedQrToken(kind: AssignedKind, itemId: string, classId: string, opts: { secret?: string } = {}): string {
  return sign(payloadOf(kind, itemId, classId), secretOf(opts.secret));
}
export const assignedQrPath = (token: string) => `/qr/a/${token}`;

function parseToken(token: string, opts: { secret?: string } = {}): { kind: AssignedKind; itemId: string; classId: string } | null {
  const v = verifySigned(s(token).trim().slice(0, 300), secretOf(opts.secret));
  if (!v) return null;
  const [kind, itemId, classId] = v.split("|");
  if (!kind || !itemId || !classId || !isAssignedQrKind(kind)) return null;
  return { kind, itemId, classId };
}

export class AssignedQrError extends Error {
  constructor(readonly code: "OFF" | "NOT_IN_CLASS" | "RATE_LIMITED", message: string) { super(message); }
}

const LIMITS = { windowMs: 15 * 60_000, listPerIp: 600, signInPerIp: 300 };
async function limit(repo: Repo, key: string, max: number, windowMs: number, now: Date) {
  const r = await consumeRateLimit(repo, key, max, windowMs, now);
  if (!r.allowed) throw new AssignedQrError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
}

// ------------------------------------------------------------------ teacher side

/**
 * 🧑‍🏫 The link for one assigned item + one of its classes (null: unsupported kind). Forbidden unless the actor
 * actually teaches (or, for an admin, can see) that class — the only check that matters here, since the kind/id
 * are only ever used to build the token, never trusted on their own for access.
 */
export async function assignedQrForItem(repo: Repo, actor: Actor, kind: string, id: string, classId: string, origin: string, opts: { secret?: string } = {}): Promise<{ url: string } | null> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can create this link.");
  if (!isAssignedQrKind(kind) || !id || !classId) return null;
  const classes = await accessibleClasses(repo, actor);
  if (!classes.some((c) => s(c.id) === classId)) throw new ForbiddenError("Not your class.");
  const token = assignedQrToken(kind, id, classId, opts);
  return { url: `${origin.replace(/\/$/, "")}${assignedQrPath(token)}` };
}

// ------------------------------------------------------------------ student side (no session yet)

/** 📋 The link's class names (null: a bad / old / tampered link, or the class no longer exists). */
export async function assignedQrNames(repo: Repo, token: string, opts: { ip?: string | null; now?: Date; secret?: string } = {}): Promise<{ className: string } & { names: { id: string; name: string }[] } | null> {
  const now = opts.now ?? new Date();
  await limit(repo, `assignedqr:list:${opts.ip ?? "unknown"}`, LIMITS.listPerIp, LIMITS.windowMs, now);
  const parsed = parseToken(token, opts);
  if (!parsed) return null;
  const klass = await repo.findUnique("Class", { id: parsed.classId });
  if (!klass || klass.deletedAt) return null;
  const students = await classStudents(repo, parsed.classId, s(klass.schoolId));
  return { className: s(klass.name), names: listNames(students.map((x) => ({ id: x.studentId, name: x.name }))) };
}

/**
 * The exact "My Work" key (student/all-work.ts#allWorkItems's assignmentId) this assigned item would show as — the
 * bridge between the teacher's id for a kind (sometimes a join row, e.g. ReadRise's RRClassArticle) and the
 * student-facing id My Work actually keys its row by. null: no single resolvable row for this kind (see UNSUPPORTED)
 * or the underlying row is gone (cancelled, deleted) — callers fall back to the student home page.
 */
async function keyFor(repo: Repo, kind: AssignedKind, itemId: string): Promise<string | null> {
  switch (kind) {
    case "SKILL": case "PROGRESS_CHECK": {
      const a = await repo.findUnique("Assignment", { id: itemId });
      return a && !a.deletedAt ? itemId : null;
    }
    case "TEST": {
      // the teacher's id is the TeacherTest id; My Work keys the test by its underlying Assignment "set" row
      const sets = await repo.findMany("Assignment", { testId: itemId, deletedAt: null }, { select: ["id"] });
      return sets[0] ? `test:${s(sets[0].id)}` : null;
    }
    case "PLAN": return `plan:${itemId}`;
    case "NAFS_TEST": return `nafs_test:${itemId}`;
    case "NAFS_PRACTICE": return `nafs_practice:${itemId}`;
    case "READRISE": {
      const g = await repo.findUnique("RRClassArticle", { id: itemId });
      return g ? `readrise:${s(g.articleId)}` : null;
    }
    case "WRITING": return `writing:${itemId}`;
    case "FLUENCY": return `read_aloud:${itemId}`;
    case "EXIT_TICKET": return `exit_ticket:${itemId}`;
    case "RESPOND": return `respond:${itemId}`;
    case "LESSON": return `lesson:${itemId}`;
    default: return null;
  }
}

/** This one student's own href for `key` right now (never throws; "/student" when it can't be resolved). */
async function hrefFor(repo: Repo, user: Row, kind: AssignedKind, itemId: string, now: Date): Promise<string> {
  try {
    const key = await keyFor(repo, kind, itemId);
    if (!key) return "/student";
    const actor = await resolveActor(repo, user);
    const items = await allWorkItems(repo, actor, now);
    return items.find((x) => x.assignmentId === key)?.href ?? "/student";
  } catch { return "/student"; }
}

/** 👆 Tap a name → that student's own session + the solve page for THIS assigned item (never the student home). */
export async function assignedQrSignIn(repo: Repo, input: { token: string; studentId: string } & SessionMeta, cfg: AuthConfig, opts: { now?: Date; secret?: string } = {}): Promise<{ token: string; expiresAt: Date; user: Row; href: string }> {
  const now = opts.now ?? new Date();
  const ip = input.ip ?? "unknown";
  await limit(repo, `assignedqr:signin:${ip}`, LIMITS.signInPerIp, LIMITS.windowMs, now);
  const parsed = parseToken(input.token, opts);
  if (!parsed) throw new AssignedQrError("OFF", "This link does not work. Ask your teacher for a new one.");
  const klass = await repo.findUnique("Class", { id: parsed.classId });
  if (!klass || klass.deletedAt) throw new AssignedQrError("OFF", "This link does not work. Ask your teacher for a new one.");
  const st = (await classStudents(repo, parsed.classId, s(klass.schoolId))).find((x) => x.studentId === s(input.studentId));
  if (!st) throw new AssignedQrError("NOT_IN_CLASS", "This name is not in this class.");
  const user = await repo.findUnique("User", { id: st.userId });
  if (!user || user.role !== "STUDENT" || !user.isActive || user.deletedAt) throw new AssignedQrError("NOT_IN_CLASS", "This name is not in this class.");
  const session = await createSession(repo, user, cfg, { ip, userAgent: input.userAgent }, now);
  await repo.updateMany("User", { id: user.id }, { lastLoginAt: now });
  await audit(repo, { actorId: st.userId, action: "assigned_qr.sign_in", entityType: "User", entityId: st.userId, after: { classId: parsed.classId, kind: parsed.kind, itemId: parsed.itemId }, ip, at: now });
  const href = await hrefFor(repo, user, parsed.kind, parsed.itemId, now);
  return { token: session.token, expiresAt: session.expiresAt, user, href };
}
