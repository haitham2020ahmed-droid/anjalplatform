import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { AutoPrint } from "@/components/plans/auto-print";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { skillPlanForStaff } from "@/server/curriculum-map/plans";

/** One skill plan (teacher): places by unit with progress; printable / PDF. */
export default async function PlanPage({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ msg?: string; print?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const p = await skillPlanForStaff(repo, actor, (await params).planId);
  const sp = await searchParams;
  const units = [...new Set(p.places.map((x) => x.unit))];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/plans", label: "Skill plans" }} icon="🗂️" title={p.title} subtitle={`${p.className} · Grade ${p.grade} · ${p.places.length} place(s) · ${p.createdAt}`}><PrintButton /></PageHeader>
      {sp.print === "1" && <AutoPrint />}
      {sp.msg && (
        <div role="status" className="animate-pop mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">
          <span>✅ {sp.msg}</span><PrintButton />
        </div>
      )}
      {p.note && <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">💬 {p.note}</p>}
      <div className="space-y-5">
        {units.map((u) => (
          <section key={u} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
            <h2 className="text-xl font-bold text-brand-navy">{u}</h2>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {p.places.filter((x) => x.unit === u).map((x) => (
                <li key={x.code} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-500">{x.set}</p>
                  <p className="font-semibold text-slate-900">{x.label}</p>
                  {x.students && <div className="mt-2 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-teal" style={{ width: `${Math.round(x.progress * 100)}%` }} /></div><span className="text-xs tabular-nums text-slate-600">{x.students.done}/{x.students.total} done</span></div>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
