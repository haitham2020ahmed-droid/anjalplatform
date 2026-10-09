import { hideLevels } from "@/lib/hide-levels";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentSkillPlans } from "@/server/curriculum-map/plans";

export const metadata = { title: "My plans" };

/** 🗂️ My plans: skill plans my teacher assigned to me. */
export default async function MyPlans() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const plans = await studentSkillPlans(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="🗂️" title="My Plans" subtitle="Open a plan, then tap any part to start its questions. Download any plan as a PDF." />
      {plans.length === 0 ? <p className="rounded-3xl bg-white p-8 text-center text-slate-600 ring-1 ring-slate-200">No plans yet. Your teacher will send you one.</p> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {plans.map((p) => (
            <li key={p.id}><Link href={`/student/plans/${p.id}`} className="lift block rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <p className="text-xl font-bold text-brand-navy">{p.kind === "CURRICULUM" ? "📘" : "🗂️"} {hideLevels(p.title)}</p>
              {p.kind === "CURRICULUM" && <p className="text-sm text-slate-500">Your whole year: every unit, text set and skill</p>}
              <div className="mt-3 flex items-center gap-3"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-teal" style={{ width: `${p.places ? Math.round((100 * p.done) / p.places) : 0}%` }} /></div><span className="text-sm font-semibold tabular-nums text-slate-700">{p.done}/{p.places}</span></div>
            </Link></li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
