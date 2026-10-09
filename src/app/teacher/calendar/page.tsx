import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { calendar, type CalEvent } from "@/server/teacher/extras";
import { weekStart } from "@/server/teacher/classroom";

export const metadata = { title: "Calendar" };
const ICON: Record<CalEvent["kind"], string> = { DUE: "📝", EXIT: "🎫", MAP_TEST: "🧭", RESPOND: "✍️", WRITING: "🖊" };
const TONE: Record<CalEvent["kind"], string> = { DUE: "bg-sky-50 text-sky-900", EXIT: "bg-violet-50 text-violet-900", MAP_TEST: "bg-emerald-50 text-emerald-900", RESPOND: "bg-amber-50 text-amber-900", WRITING: "bg-rose-50 text-rose-900" };

/** 🗓️ Five weeks of the teacher's classes: due dates, exit tickets, writing, Respond, MAP practice tests. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const base = weekStart(sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? new Date(`${sp.from}T00:00:00Z`) : new Date(Date.now() - 7 * 86_400_000));
  const events = await calendar(repo, actor, base, 35);
  const days = Array.from({ length: 35 }, (_, i) => new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const move = (w: number) => `/teacher/calendar?from=${new Date(base.getTime() + w * 7 * 86_400_000).toISOString().slice(0, 10)}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🗓️" title="Calendar" subtitle="Everything with a date in your classes: 📝 due work · 🎫 exit tickets · 🖊 writing · ✍️ Respond · 🧭 MAP practice tests.">
        <Link href={move(-4)} className="rounded-xl bg-white px-3 py-2 font-semibold ring-1 ring-slate-300 print:hidden">◀ Earlier</Link>
        <Link href="/teacher/calendar" className="rounded-xl bg-white px-3 py-2 font-semibold ring-1 ring-slate-300 print:hidden">Today</Link>
        <Link href={move(4)} className="rounded-xl bg-white px-3 py-2 font-semibold ring-1 ring-slate-300 print:hidden">Later ▶</Link>
        <PrintButton />
      </PageHeader>
      <div className="grid grid-cols-7 gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const list = events.filter((e) => e.date === d);
          return (
            <div key={d} className={`min-h-28 rounded-xl p-1.5 ring-1 ${d === today ? "bg-amber-50 ring-amber-300" : "bg-white ring-slate-200"}`}>
              <p className={`text-xs font-bold ${d === today ? "text-amber-800" : "text-slate-500"}`}>{Number(d.slice(8))}{d.slice(8) === "01" || d === days[0] ? ` ${new Date(`${d}T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" })}` : ""}</p>
              <ul className="mt-1 space-y-1">{list.slice(0, 4).map((e, i) => <li key={i}>{e.href ? <Link href={e.href} className={`block truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold hover:brightness-95 ${TONE[e.kind]}`} title={`${e.title}${e.className ? ` · ${e.className}` : ""}`}>{ICON[e.kind]} {e.className ? `${e.className}: ` : ""}{e.title}</Link> : null}</li>)}{list.length > 4 && <li className="text-[11px] text-slate-500">+{list.length - 4} more</li>}</ul>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
