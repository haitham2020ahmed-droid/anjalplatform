import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { engineOverview } from "@/server/insights/daily";
import { recommendationStats } from "@/server/insights/recommendation-log";
import { interventionImpact } from "@/server/insights/interventions";
import { groupMisconceptions } from "@/server/insights/misconception-tags";
import { runEngineNowAction } from "./actions";

export const metadata = { title: "Learning Engine" };

/** 🧠 The learning engine of the school: what it knows, whether its advice works, which interventions work. */
export default async function LearningEnginePage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const ids = (await repo.findMany("Student", { schoolId: actor.schoolId }, { select: ["id"] })).map((x) => String(x.id));
  const [o, advice, impact, mis] = await Promise.all([engineOverview(repo, actor.schoolId!), recommendationStats(repo, ids), interventionImpact(repo, actor.schoolId!), groupMisconceptions(repo, ids, 30, new Date(), 8)]);
  const box = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🧠" title="Learning Engine"
        subtitle="What the platform knows about every student and whether its decisions work. Updated every night (and once a day on the first visit)." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <form action={runEngineNowAction} className="mb-5 flex flex-wrap items-center gap-3">
        <button className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">🔄 Update now</button>
        <span className="text-sm text-slate-600">Last update: {o.lastRun ? o.lastRun.day : "never"}</span>
      </form>
      <section className="grid gap-4 md:grid-cols-4">
        <div className={box}><p className="text-xs text-slate-500">Student profiles</p><p className="text-2xl font-extrabold text-brand-navy">{o.profiles.total}</p><p className="text-xs text-slate-600">{o.profiles.below} Below · {o.profiles.on} On · {o.profiles.above} Above · {o.profiles.unknown} no data</p></div>
        <div className={box}><p className="text-xs text-slate-500">🔮 Low chance of the MAP goal</p><p className="text-2xl font-extrabold text-red-700">{o.profiles.atRisk}</p><p className="text-xs text-slate-600">students under 40% (next MAP term)</p></div>
        <div className={box}><p className="text-xs text-slate-500">Wrong options with a misconception</p><p className="text-2xl font-extrabold text-brand-navy">{pct(o.options.tagged, o.options.wrong)}</p><p className="text-xs text-slate-600">{o.options.tagged} of {o.options.wrong}</p></div>
        <div className={box}><p className="text-xs text-slate-500">Skill prerequisites</p><p className="text-2xl font-extrabold text-brand-navy">{o.prerequisites}</p><p className="text-xs text-slate-600">practice sends a stuck student to the skill underneath</p></div>
      </section>
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className={box}>
          <h2 className="text-lg font-bold text-brand-navy">✅ Does the advice work? (last 60 days)</h2>
          <p className="mt-1 text-sm">{advice.made} recommendations · {advice.evaluated} checked after 7 days</p>
          <p className="mt-1 text-sm">Followed: <b>{advice.followedPct ?? "—"}%</b> · Improved: <b>{advice.improvedPct ?? "—"}%</b> · Improved when followed: <b className="text-emerald-700">{advice.improvedWhenFollowedPct ?? "—"}%</b></p>
        </article>
        <article className={box}>
          <h2 className="text-lg font-bold text-brand-navy">🎯 Which interventions work</h2>
          {impact.length ? <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Skill</th><th>Groups</th><th>Students</th><th>Improved</th><th>Avg change</th></tr></thead><tbody>{impact.map((r) => <tr key={r.skillName} className="border-t"><td className="py-1">{r.skillName}</td><td>{r.groups}</td><td>{r.students}</td><td>{r.improvedPct}%</td><td>{r.avgChange > 0 ? "+" : ""}{r.avgChange}</td></tr>)}</tbody></table> : <p className="mt-2 text-sm text-slate-500">No finished intervention groups yet. Teachers start them from <Link href="/teacher/intervention/groups" className="text-brand-teal underline">Intervention Groups</Link>.</p>}
        </article>
      </section>
      <section className={`mt-5 ${box}`}>
        <h2 className="text-lg font-bold text-brand-navy">🔍 The school's most common misconceptions (30 days)</h2>
        {mis.length ? <ul className="mt-2 grid gap-2 md:grid-cols-2">{mis.map((m) => <li key={m.code} className="rounded-xl bg-orange-50 p-3 text-sm ring-1 ring-orange-200"><b className="text-orange-900">{m.label}</b><br /><span className="text-xs text-orange-800">{m.students.length} students · {m.answers} wrong answers · {m.skills.join(", ")}</span><br /><span className="text-xs text-slate-700">💡 {m.fix}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Not enough data yet.</p>}
      </section>
    </AppShell>
  );
}
