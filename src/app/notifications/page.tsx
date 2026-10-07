import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listNotifications } from "@/server/notifications";
import { markAllReadAction, openNotificationAction } from "./actions";

/** Notification list: newest first; opening one marks it read and goes to its link. */
export default async function NotificationsPage() {
  const actor = await requireActor({});
  const me = (await getActor())!.user;
  const items = await listNotifications(repo, actor);
  const unread = items.filter((n) => !n.read).length;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy">Notifications</h1>
        {unread > 0 && <form action={markAllReadAction}><button className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">Mark all as read</button></form>}
      </div>
      {items.length === 0 ? <p className="mt-4 text-slate-600">No notifications yet.</p> : (
        <ul className="mt-4 space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotificationAction}>
                <input type="hidden" name="id" value={n.id} />
                <button className={`w-full rounded-xl p-4 text-start ring-1 hover:ring-brand-teal ${n.read ? "bg-white ring-slate-200" : "bg-amber-50 ring-amber-200"}`}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-brand-navy">{!n.read && <span className="me-2 inline-block h-2 w-2 rounded-full bg-red-600" aria-label="Unread" />}{n.title}</span>
                    <span className="text-xs text-slate-500">{n.createdAt.slice(0, 10)}</span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-700">{n.body}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
