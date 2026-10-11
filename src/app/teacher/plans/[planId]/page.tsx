import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { AutoPrint } from "@/components/plans/auto-print";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { isSkillPlanKind, skillPlanForStaff } from "@/server/curriculum-map/plans";
import { curriculumPlanGrid } from "@/server/curriculum-map/curriculum-plan";
import { CurriculumGrid } from "@/components/plans/curriculum-grid";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

/** One skill plan (teacher): places by unit with progress; printable / PDF. */
export default async function PlanPage({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ msg?: string; print?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const planId = (await params).planId;
  const sp = await searchParams;
  const row = await repo.findUnique("SkillPlan", { id: planId });
  if (row && String(row.kind) === "CURRICULUM") {
    const g = await curriculumPlanGrid(repo, actor, planId);
    return (
      <AppShell name={String(me.displayName)}>
        <PageHeader back={{ href: "/teacher/plans", label: "Plans" }} icon="📘" title={g.title} subtitle={`${g.className} · ${t("{n} part(s)", { n: g.items.length })} · ${t("{n} student(s)", { n: g.students.length })} · ${t("{n} correct answers finish a part", { n: g.target })}`}><PrintButton /></PageHeader>
        {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">✅ {sp.msg}</p>}
        <CurriculumGrid g={g} canEdit />
      </AppShell>
    );
  }
  const p = await skillPlanForStaff(repo, actor, planId);
  const units = [...new Set(p.places.map((x) => x.unit))];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/plans", label: "Plans" }} icon="🗂️" title={p.title} subtitle={`${p.className} · ${t("Grade {n}", { n: p.grade })} · ${t(isSkillPlanKind(String(row?.kind)) ? "{n} skill(s)" : "{n} place(s)", { n: p.places.length })} · ${p.createdAt}`}><PrintButton /></PageHeader>
      {sp.print === "1" && <AutoPrint />}
      {sp.msg && (
        <div role="status" className="animate-pop mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">
          <span>✅ {sp.msg}</span><PrintButton />
        </div>
      )}
      {p.note && <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">💬 {p.note}</p>}
      {units.length === 0 && <EmptyState icon="🗂️" title="Nothing here yet" text="This plan has no skills yet." action={{ href: "/teacher/plans", label: "Plans" }} />}
      <div className="space-y-5">
        {units.map((u) => (
          <section key={u} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
            <h2 className="text-xl font-bold text-brand-navy">{u}</h2>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {p.places.filter((x) => x.unit === u).map((x) => (
                <li key={`${x.code}|${x.label}`} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-500">{x.set}</p>
                  <p className="font-semibold text-slate-900">{x.label}</p>
                  {x.students && <div className="mt-2 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-teal" style={{ width: `${Math.round(x.progress * 100)}%` }} /></div><span className="text-xs tabular-nums text-slate-600">{t("{done}/{total} done", { done: x.students.done, total: x.students.total })}</span></div>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
