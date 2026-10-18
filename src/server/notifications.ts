/** In-platform notifications (bell): count, list, open (marks read), mark all read. Own notifications only. */
import type { Repo } from "./seeding/repo";
import { ForbiddenError, type Actor } from "./auth/rbac";

import { TtlCache } from "./lib/ttl-cache";
import { cancelIndex } from "./student/cancelled-work";

export const unreadCount = (repo: Repo, userId: string) => repo.count("Notification", { userId, readAt: null });

/** The bell's number (every page header): kept 15 s per person (Update 42B); reading notifications refreshes it. */
const bellCache = new TtlCache<number>(15_000, 5000);
export const unreadCountCached = (repo: Repo, userId: string, now = Date.now()) => bellCache.getOrLoad(userId, () => unreadCount(repo, userId), now);

export async function listNotifications(repo: Repo, actor: Actor, limit = 50) {
  const all = await repo.findMany("Notification", { userId: actor.userId }, { orderBy: [{ field: "createdAt", dir: "desc" }, { field: "id", dir: "desc" }], take: limit });
  // r78: a student's notification about work the teacher cancelled on Assigned is not listed (its link is dead)
  const rows = actor.role === "STUDENT" && actor.studentId ? await withoutCancelledLinks(repo, actor.studentId, actor.schoolId, all) : all;
  return rows.map((n) => ({ id: String(n.id), type: String(n.type), title: String(n.title), body: String(n.body), link: n.link ? String(n.link) : null, read: Boolean(n.readAt), createdAt: new Date(String(n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt)).toISOString() }));
}

/** The work id a notification links to: /student/assignments/{id}, /quiz/{id} or /student/plans/{planId}. Pure. */
export function linkedWork(link: unknown): { assignmentId?: string; planId?: string } | null {
  const m = /^\/(?:student\/assignments|quiz)\/([^/?#]+)/.exec(String(link ?? ""));
  if (m) return { assignmentId: m[1] };
  const p = /^\/student\/plans\/([^/?#]+)/.exec(String(link ?? ""));
  return p ? { planId: p[1] } : null;
}

async function withoutCancelledLinks<T extends Record<string, unknown>>(repo: Repo, studentId: string, schoolId: string | null | undefined, rows: T[]): Promise<T[]> {
  const ix = await cancelIndex(repo, schoolId);
  const links = rows.map((n) => linkedWork(n.link));
  const aids = [...new Set(links.map((l) => l?.assignmentId).filter((x): x is string => Boolean(x)))];
  if (ix.empty && !aids.length) return rows;
  const found = aids.length ? await repo.findMany("Assignment", { id: { in: aids } }, { select: ["id", "deletedAt", "testId", "curriculumPlanId"] }) : [];
  const byId = new Map(found.map((a) => [String(a.id), a]));
  return rows.filter((_, i) => {
    const l = links[i];
    if (l?.assignmentId) { const a = byId.get(l.assignmentId); return !a || ix.live(a, studentId); }
    if (l?.planId) return ix.liveRef("PLAN", l.planId, studentId);
    return true;
  });
}

/** Marks one notification read and returns where it points. Only the owner can open it. */
export async function openNotification(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<string> {
  const n = await repo.findUnique("Notification", { id });
  if (!n || n.userId !== actor.userId) throw new ForbiddenError("Notification not found.");
  if (!n.readAt) await repo.updateMany("Notification", { id }, { readAt: now });
  bellCache.delete(actor.userId);
  const link = n.link ? String(n.link) : "/notifications";
  return link.startsWith("/") && !link.startsWith("//") ? link : "/notifications"; // internal links only
}

export async function markAllRead(repo: Repo, actor: Actor, now = new Date()): Promise<number> {
  const n = await repo.updateMany("Notification", { userId: actor.userId, readAt: null }, { readAt: now });
  bellCache.delete(actor.userId);
  return n;
}
