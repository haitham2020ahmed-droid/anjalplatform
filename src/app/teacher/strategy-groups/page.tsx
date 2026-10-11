import { NameList } from "@/components/name-list";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { classStrategyProfile, PHASE_LABEL, STRATEGY_LABEL } from "@/server/surveys/strategy";
import { openStrategySurveyAction } from "./actions";

export const metadata = { title: "Reading Strategy Groups" };

const bar = (pct: number | null) => (pct === null ? "bg-slate-200" : pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-500");

/** 🧭 The class Reading Strategy profile (before / during / after reading) and suggested strategy groups — for grouping only. */
export default async function StrategyGroupsPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  let p;
  try { p = await classStrategyProfile(repo, actor, sp.classId || null); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{e.message}</p></AppShell>; }
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/diagnostic", label: "Diagnostic Test" }} icon="🧭" title="Reading Strategy Groups" subtitle={`${p.className} · ${p.term} · ${p.taken} of ${p.roster} students took the survey. For flexible grouping only — it never changes a level or placement.`} />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="mb-5 flex flex-wrap gap-2">
        {p.classes.map((c) => <Link key={c.id} href={`/teacher/strategy-groups?classId=${c.id}`} aria-current={c.id === p.classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === p.classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{c.name}</Link>)}
      </nav>
      <section className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        <p className="flex-1 text-slate-700">{p.opened ? `✅ Opened for this class on ${p.opened}. Students who have not taken it this term can still take it.` : "Students can take the survey once per term from /student/strategy-survey. Open it to notify the class."}</p>
        <form action={openStrategySurveyAction}><input type="hidden" name="classId" value={p.classId} /><button className="rounded-xl bg-brand-navy px-4 py-2 font-bold text-white hover:bg-brand-purple">{p.opened ? "🔔 Remind the class" : "🔔 Open the survey for this class"}</button></form>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Class profile</h2>
          <ul className="mt-3 space-y-2">
            {p.phases.map((x) => <li key={x.phase} className="flex items-center gap-3"><span className="w-36 text-sm font-semibold text-slate-700">{PHASE_LABEL[x.phase]}</span><span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${bar(x.pct)}`} style={{ width: `${x.pct ?? 0}%` }} /></span><span className="w-12 text-right text-sm tabular-nums">{x.pct === null ? "—" : `${x.pct}%`}</span></li>)}
          </ul>
        </div>
        <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">By strategy</h2>
          <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-slate-500"><th className="py-1">Strategy</th><th className="text-right">Class %</th><th className="text-right">Weak</th></tr></thead>
            <tbody>{p.strategies.map((x) => <tr key={x.strategy} className="border-t border-slate-100"><td className="py-1">{x.label}</td><td className="text-right tabular-nums">{x.pct === null ? "—" : `${x.pct}%`}</td><td className="text-right tabular-nums">{x.weakCount}</td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-xl font-bold text-brand-navy">Suggested strategy groups</h2>
        {!p.groups.length ? <p className="rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">{p.taken ? "No weak strategies — every student chose the effective strategy most of the time." : "No results yet."}</p> : (
          <ul className="grid gap-4 md:grid-cols-2">
            {p.groups.map((g) => (
              <li key={g.strategy} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <p className="font-bold text-brand-navy">{g.label} · {g.students.length} student(s)</p>
                <p className="mt-1 text-sm text-slate-600">{g.tip}</p>
                <p className="mt-2 text-sm"><NameList items={g.students.map((x) => ({ name: x.name, note: `(${x.pct}%)` }))} /></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Students</h2>
          <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-slate-500"><th className="py-1">Name</th><th className="text-right">Before</th><th className="text-right">During</th><th className="text-right">After</th><th className="ps-3">Weak strategies</th></tr></thead>
            <tbody>{p.students.map((x) => <tr key={x.id} className="border-t border-slate-100 align-top"><td className="py-1">{x.name}</td><td className="text-right tabular-nums">{x.BEFORE}%</td><td className="text-right tabular-nums">{x.DURING}%</td><td className="text-right tabular-nums">{x.AFTER}%</td><td className="ps-3">{x.weak.map((k) => STRATEGY_LABEL[k]).join(", ") || "—"}</td></tr>)}</tbody></table>
        </div>
        <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Not taken yet ({p.notTaken.length})</h2>
          <p className="mt-2 text-sm text-slate-700">{p.notTaken.length ? <NameList items={p.notTaken} /> : "Everyone took it 🎉"}</p>
        </div>
      </section>
    </AppShell>
  );
}
