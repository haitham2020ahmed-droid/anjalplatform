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
  // many notifications of the same kind on the same day are shown as ONE line that opens to the list
  const groups: { key: string; items: typeof items }[] = [];
  for (const n of items) {
    const key = `${n.type}|${n.createdAt.slice(0, 10)}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(n); else groups.push({ key, items: [n] });
  }
  return (
    <AppShell name={String(me.displayName)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy">Notifications</h1>
        {unread > 0 && <form action={markAllReadAction}><button className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">Mark all as read</button></form>}
      </div>
      {items.length === 0 ? <p className="mt-4 text-slate-600">No notifications yet.</p> : (
        <ul className="mt-4 space-y-2">
          {groups.flatMap((g) => g.items.length >= 3 ? [g.items[0]] : g.items).map((n) => {
            const g = groups.find((x) => x.items[0] === n && x.items.length >= 3);
            if (g) return (
              <li key={`g-${g.key}`}>
                <details className={`rounded-xl p-4 ring-1 ${g.items.some((x) => !x.read) ? "bg-amber-50 ring-amber-200" : "bg-white ring-slate-200"}`}>
                  <summary className="flex cursor-pointer items-center justify-between gap-3 font-semibold text-brand-navy">
                    <span>{g.items.some((x) => !x.read) && <span className="me-2 inline-block h-2 w-2 rounded-full bg-red-600" aria-label="Unread" />}{g.items.length} × {n.title}</span>
                    <span className="text-xs text-slate-500">{n.createdAt.slice(0, 10)}</span>
                  </summary>
                  <ul className="mt-2 space-y-1">{g.items.map((x) => (
                    <li key={x.id}><form action={openNotificationAction}><input type="hidden" name="id" value={x.id} /><button className="w-full rounded-lg px-3 py-1.5 text-start text-sm hover:bg-white"><b>{x.title}</b> · {x.body}</button></form></li>
                  ))}</ul>
                </details>
              </li>
            );
            return (
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
          ); })}
        </ul>
      )}
    </AppShell>
  );
}
