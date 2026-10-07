import { getActor, repo } from "@/server/auth/next";
import { unreadCount } from "@/server/notifications";

/** Bell with the unread count, in every page header. */
export async function NotificationBell() {
  const me = await getActor();
  if (!me) return null;
  const n = await unreadCount(repo, me.actor.userId);
  return (
    <a href="/notifications" className="relative inline-flex items-center rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-brand-navy" aria-label={n ? `Notifications: ${n} unread` : "Notifications"}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {n > 0 && <span className="absolute -end-1 -top-1 min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-xs font-bold text-white">{n > 99 ? "99+" : n}</span>}
    </a>
  );
}
