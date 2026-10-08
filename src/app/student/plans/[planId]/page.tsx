import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { skillPlanForStudent, type PlanView } from "@/server/curriculum-map/plans";

const TONE = { NOT_STARTED: "bg-white ring-slate-200", IN_PROGRESS: "bg-sky-50 ring-sky-300", COMPLETED: "bg-emerald-50 ring-emerald-300", OVERDUE: "bg-red-50 ring-red-300" } as const;
const ICON = { NOT_STARTED: "▶", IN_PROGRESS: "⏩", COMPLETED: "✅", OVERDUE: "⏰" } as const;

/** My plan as a map: tap a place to go straight to its questions. */
export default async function MyPlan({ params }: { params: Promise<{ planId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  let p: PlanView | null = null;
  try { p = await skillPlanForStudent(repo, actor, (await params).planId); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  if (!p) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">This plan is not assigned to you.</p></AppShell>;
  const units = [...new Set(p.places.map((x) => x.unit))];
  const done = p.places.filter((x) => x.status === "COMPLETED").length;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/plans", label: "My plans" }} icon="🗂️" title={p.title} subtitle={`${done} of ${p.places.length} places done · tap a place to start`}><PrintButton /></PageHeader>
      {p.note && <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">💬 {p.note}</p>}
      <div className="space-y-6">
        {units.map((u) => (
          <section key={u} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-bold text-brand-navy">🧭 {u}</h2>
            {[...new Set(p!.places.filter((x) => x.unit === u).map((x) => x.set))].map((set) => (
              <div key={set} className="mt-4">
                <p className="text-sm font-semibold text-slate-500">{set}</p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {p!.places.filter((x) => x.unit === u && x.set === set).map((x) => {
                    const st = x.status ?? "NOT_STARTED";
                    return (
                      <li key={x.code}>
                        <Link href={x.href ?? "#"} className={`lift flex items-center justify-between gap-3 rounded-2xl p-4 ring-2 ${TONE[st]}`}>
                          <span><span className="block font-bold text-brand-navy">{x.label}</span><span className="block text-xs text-slate-500">{Math.round(x.progress * 100)}%</span></span>
                          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-navy text-white">{ICON[st]}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </AppShell>
  );
}
