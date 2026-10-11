/**
 * 💬 In-app feedback: any signed-in user (admin, teacher, student) writes a short note from the Feedback button; the
 * school's admins read it on /admin/feedback and mark it resolved. Only admins of the same school see the list.
 * The page path is cleaned (no query string: it could carry ids). Max 2000 characters; 20 notes per user per day.
 */
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;
export const FEEDBACK_MAX = 2000;
const PER_DAY = 20;

/** Pure: the page path only ("/teacher/classes/abc?x=1#y" → "/teacher/classes/abc"), at most 300 characters. */
export function cleanPath(v: unknown): string | null {
  const p = s(v).replace(CONTROL, "").trim().split(/[?#]/)[0].slice(0, 300);
  return p.startsWith("/") ? p : p ? `/${p}`.slice(0, 300) : null;
}

export async function saveFeedback(repo: Repo, actor: Actor, input: { message: string; path?: string | null }, now = new Date()): Promise<string> {
  const message = s(input.message).replace(CONTROL, "").trim();
  if (!message) throw new ValidationError("Write a few words first.");
  if (message.length > FEEDBACK_MAX) throw new ValidationError(`Keep it under ${FEEDBACK_MAX} characters.`);
  const since = new Date(now.getTime() - 86_400_000);
  if ((await repo.count("Feedback", { userId: actor.userId, createdAt: { gte: since } })) >= PER_DAY) throw new ValidationError("Thank you! You have sent a lot today: please try again tomorrow.");
  const row = await repo.create("Feedback", { userId: actor.userId, schoolId: actor.schoolId ?? null, role: actor.role, path: cleanPath(input.path), message, createdAt: now, resolved: false });
  return s(row.id);
}

export interface FeedbackItem { id: string; name: string; role: string; path: string | null; message: string; createdAt: string; resolved: boolean }

function adminScope(actor: Actor): string | null {
  if (actor.role === "SUPER_ADMIN") return actor.schoolId;
  if (actor.role !== "SCHOOL_ADMIN" || !actor.schoolId) throw new ForbiddenError("Only a school admin can do this.");
  return actor.schoolId;
}

/** The newest notes first (open ones first), at most 200. */
export async function listFeedback(repo: Repo, actor: Actor, opts: { resolved?: boolean } = {}): Promise<FeedbackItem[]> {
  const schoolId = adminScope(actor);
  const rows = await repo.findMany("Feedback", { ...(schoolId ? { schoolId } : {}), ...(opts.resolved === undefined ? {} : { resolved: opts.resolved }) }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 200 });
  const users = rows.length ? await repo.findMany("User", { id: { in: [...new Set(rows.map((r) => s(r.userId)))] } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(s(v)).toISOString());
  return rows.map((r) => ({ id: s(r.id), name: nameOf.get(s(r.userId)) ?? "", role: s(r.role), path: r.path ? s(r.path) : null, message: s(r.message), createdAt: iso(r.createdAt), resolved: r.resolved === true || r.resolved === 1 }))
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.createdAt.localeCompare(a.createdAt));
}

export async function setFeedbackResolved(repo: Repo, actor: Actor, id: string, resolved = true): Promise<void> {
  const schoolId = adminScope(actor);
  const row = await repo.findUnique("Feedback", { id: s(id) });
  if (!row || (schoolId && s(row.schoolId) !== schoolId)) throw new ValidationError("Feedback not found.");
  await repo.updateMany("Feedback", { id: row.id }, { resolved });
}
