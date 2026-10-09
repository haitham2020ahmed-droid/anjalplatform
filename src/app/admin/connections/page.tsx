import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { HEALTH_UI, ShareBar, Thread } from "@/components/connect/thread";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { connections, type Stage } from "@/server/admin/connections";

export const metadata = { title: "Connections" };

const stagePct = (st: Stage) => { const c = st.checks.filter((x) => x.health !== "INFO" && x.total); return c.length ? Math.round((c.reduce((t, x) => t + x.ok / x.total, 0) / c.length) * 100) : null; };
const stageHealth = (st: Stage) => { const c = st.checks.filter((x) => x.health !== "INFO" && x.total); return c.some((x) => x.health === "BAD") ? "BAD" : c.some((x) => x.health === "WARN") ? "WARN" : c.length ? "GOOD" : "INFO"; };

/** 🔗 Is everything joined up? The learning thread from the Curriculum Map to the students, every link checked. */
export default async function ConnectionsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const v = await connections(repo, actor);
  const todo = v.stages.flatMap((st) => st.checks.filter((c) => c.health === "BAD" || c.health === "WARN").map((c) => ({ st, c })));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🔗" title="Connections"
        subtitle="How well the platform's parts are joined: Curriculum Map places, skills, questions, MAP goal areas, the Learning Continuum, students and plans. Each link is checked on the live data; the gaps and where to fix them are listed." />
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Overall</p>
            <p className="text-5xl font-bold tracking-tight text-brand-navy tabular-nums">{v.score}<span className="text-2xl text-slate-400">%</span></p>
          </div>
          <p className="max-w-md text-sm text-slate-600">{todo.length ? `${todo.length} link(s) to look at, listed below in the order learning flows.` : "Everything checked is joined up."} Checked {new Date(v.checkedAt).toISOString().slice(0, 16).replace("T", " ")} UTC.</p>
        </div>
        <div className="mt-8"><Thread nodes={v.stages.map((st) => ({ key: st.key, title: st.title, icon: st.icon, pct: stagePct(st), health: stageHealth(st), href: `#${st.key}` }))} /></div>
      </section>

      {v.stages.map((st) => (
        <section key={st.key} id={st.key} className="mt-6 scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold text-brand-navy"><span aria-hidden="true" className="me-2">{st.icon}</span>{st.title}</h2>
            <p className="text-sm text-slate-500">{st.summary}</p>
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {st.checks.map((c) => {
              const ui = HEALTH_UI[c.health];
              return (
                <li key={c.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_200px_180px] md:items-center">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{c.label}</p>
                    {c.detail && <p className="text-sm text-slate-500">{c.detail}</p>}
                    {c.gaps.length > 0 && (
                      <details className="mt-1 text-sm">
                        <summary className="cursor-pointer font-medium text-brand-teal">Show the gaps ({c.total - c.ok}{c.total - c.ok > c.gaps.length ? `, first ${c.gaps.length}` : ""})</summary>
                        <ul className="mt-2 flex flex-wrap gap-1.5">{c.gaps.map((g, i) => <li key={i}>{g.href ? <Link href={g.href} className="inline-block rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200 hover:ring-brand-teal">{g.label}</Link> : <span className="inline-block rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">{g.label}</span>}</li>)}</ul>
                      </details>
                    )}
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between text-sm"><span className="font-semibold tabular-nums text-slate-800">{c.ok} / {c.total}</span><span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${ui.chip}`}>{ui.label}</span></div>
                    <div className="mt-1.5"><ShareBar ok={c.ok} total={c.total} health={c.health} /></div>
                  </div>
                  <div className="md:text-end">{c.fix && <Link href={c.fix.href} className="inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{c.fix.label}</Link>}</div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </AppShell>
  );
}
