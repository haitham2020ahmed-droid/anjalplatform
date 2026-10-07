/** In-platform notifications (bell): count, list, open (marks read), mark all read. Own notifications only. */
import type { Repo } from "./seeding/repo";
import { ForbiddenError, type Actor } from "./auth/rbac";

export const unreadCount = (repo: Repo, userId: string) => repo.count("Notification", { userId, readAt: null });

export async function listNotifications(repo: Repo, actor: Actor, limit = 50) {
  const rows = await repo.findMany("Notification", { userId: actor.userId }, { orderBy: [{ field: "createdAt", dir: "desc" }, { field: "id", dir: "desc" }], take: limit });
  return rows.map((n) => ({ id: String(n.id), type: String(n.type), title: String(n.title), body: String(n.body), link: n.link ? String(n.link) : null, read: Boolean(n.readAt), createdAt: new Date(String(n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt)).toISOString() }));
}

/** Marks one notification read and returns where it points. Only the owner can open it. */
export async function openNotification(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<string> {
  const n = await repo.findUnique("Notification", { id });
  if (!n || n.userId !== actor.userId) throw new ForbiddenError("Notification not found.");
  if (!n.readAt) await repo.updateMany("Notification", { id }, { readAt: now });
  const link = n.link ? String(n.link) : "/notifications";
  return link.startsWith("/") && !link.startsWith("//") ? link : "/notifications"; // internal links only
}

export async function markAllRead(repo: Repo, actor: Actor, now = new Date()): Promise<number> {
  return repo.updateMany("Notification", { userId: actor.userId, readAt: null }, { readAt: now });
}
