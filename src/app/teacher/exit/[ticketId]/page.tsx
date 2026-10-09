import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { exitTicketResults } from "@/server/teacher/classroom";
import { closeTicketAction } from "../../week/actions";

export const metadata = { title: "Exit ticket results" };

/** 🎫 Live results (the page refreshes every 10 seconds while the ticket is open). */
export default async function ExitResultsPage({ params, searchParams }: { params: Promise<{ ticketId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { ticketId } = await params;
  const sp = await searchParams;
  const r = await exitTicketResults(repo, actor, ticketId);
  return (
    <AppShell name={String(me.displayName)}>
      {r.status === "OPEN" && <meta httpEquiv="refresh" content="10" />}
      <PageHeader back={{ href: `/teacher/week?classId=${r.classId}`, label: "My week" }} icon="🎫" title={r.title} subtitle={<>{r.answered} of {r.members} students answered{r.status === "OPEN" ? " · updates by itself" : " · closed"}.</>}>
        <PrintButton />
        {r.status === "OPEN" && <form action={closeTicketAction}><input type="hidden" name="ticketId" value={r.id} /><button className="rounded-xl bg-slate-700 px-4 py-2 font-semibold text-white">Close</button></form>}
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <section className="grid gap-3 md:grid-cols-3">
        {r.questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">{i + 1}. {q.stem}</p>
            <p className={`mt-2 text-3xl font-bold ${q.pct === null ? "text-slate-400" : q.pct >= 70 ? "text-emerald-700" : q.pct >= 50 ? "text-amber-700" : "text-red-700"}`}>{q.pct === null ? "—" : `${q.pct}%`}</p>
            <p className="text-xs text-slate-500">{q.answered} answers</p>
          </div>
        ))}
      </section>
      <section className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="font-bold text-brand-navy">Students (Lowest First)</h2>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{r.students.map((s) => <li key={s.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"><span>{s.name}</span><span className={`font-semibold tabular-nums ${s.score === null ? "text-slate-400" : s.score === s.total ? "text-emerald-700" : s.score <= 1 ? "text-red-700" : "text-amber-700"}`}>{s.score === null ? "not yet" : `${s.score}/${s.total}`}</span></li>)}</ul>
      </section>
    </AppShell>
  );
}
