import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherInbox } from "@/server/messages/admin-messages";

export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** ✉️ Messages from the school admin, newest first; unread ones in bold. */
export default async function TeacherMessagesPage() {
  const actor = await requireActor({ roles: ["TEACHER"] });
  const me = (await getActor())!.user;
  const inbox = await teacherInbox(repo, actor);
  const unread = inbox.filter((m) => !m.read).length;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="✉️" title="Messages" subtitle={unread ? `${unread} unread message${unread === 1 ? "" : "s"} from the school admin.` : "Messages and reports from the school admin."} />
      <Section>
        {inbox.length === 0 ? <p className="text-slate-600">No messages yet.</p> : (
          <ul className="divide-y divide-slate-200">
            {inbox.map((m) => (
              <li key={m.id}>
                <Link href={`/teacher/messages/${m.id}`} className="flex flex-col gap-0.5 rounded-lg px-2 py-3 hover:bg-slate-50 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="w-32 shrink-0 text-sm text-slate-500">{fmt(m.createdAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={m.read ? "text-slate-800" : "font-bold text-slate-900"}>{!m.read && <span className="me-1 inline-block h-2 w-2 rounded-full bg-brand-teal align-middle" aria-label="Unread" />}{m.subject}</span>
                    <span className="block truncate text-sm text-slate-500">{m.sender} · {m.preview}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}
