import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentMap } from "@/server/map/student-map";
import { PageHeader } from "@/components/page-header";

const BAND: Record<string, string> = { Low: "bg-red-100 text-red-800", LoAvg: "bg-orange-100 text-orange-800", Avg: "bg-slate-100 text-slate-700", HiAvg: "bg-teal-100 text-teal-800", High: "bg-emerald-100 text-emerald-800" };

/** 🗺️ My MAP: my Reading RIT, my Spring goal, and adaptive practice by MAP goal area (weakest first). */
export default async function StudentMapPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const m = await studentMap(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="🗺️" title="My MAP" />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold text-slate-500">My Reading RIT</h2>
          {m.rit ? (
            <>
              <p className="mt-1 text-5xl font-bold text-brand-navy">{m.rit.value}</p>
              <p className="mt-1 text-slate-700">{m.rit.term} · national average {m.rit.nationalMean} · <span className={m.rit.diff >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{m.rit.diff >= 0 ? `+${m.rit.diff}` : m.rit.diff}</span></p>
              <p className="mt-2"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${BAND[m.rit.band]}`}>{m.rit.band} · percentile {m.rit.estimated ? "≈" : ""}{m.rit.percentile}</span></p>
            </>
          ) : <p className="mt-2 text-slate-600">Your MAP score is not on the platform yet.</p>}
        </section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold text-slate-500">My goal</h2>
          {m.projection ? (
            <>
              <p className="mt-1 text-5xl font-bold text-brand-navy">{m.projection.spring}</p>
              <p className="mt-1 text-slate-700">{m.projection.springTerm} projection (+{m.projection.growth} RIT from Fall)</p>
              {m.projection.latestSpring !== null && <p className={`mt-2 font-semibold ${m.projection.met ? "text-emerald-700" : "text-amber-800"}`}>{m.projection.met ? `🎉 Goal reached: ${m.projection.latestSpring}` : `Spring score ${m.projection.latestSpring}: ${m.projection.spring - m.projection.latestSpring} to go`}</p>}
            </>
          ) : <p className="mt-2 text-slate-600">Your goal appears when your teacher imports your Fall score and projection.</p>}
        </section>
      </div>
      <section className="mt-6">
        <h2 className="text-xl font-bold text-brand-navy">Practise for MAP</h2>
        <p className="text-sm text-slate-600">Practice adapts to you: it starts at your MAP level and every answer chooses the next question (harder after correct answers, easier after mistakes). Weakest areas first.</p>
        {m.areas.length === 0 ? <p className="mt-3 rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">No MAP practice is available yet.</p> : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {m.areas.map((a) => (
              <li key={a.code} className="rounded-2xl bg-white p-4 ring-1 ring-emerald-200">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold text-brand-navy">{a.name}</p><p className="text-sm text-slate-600">{a.skills.length} skill(s) · {a.mastery === null ? "not started" : `mastery ${a.mastery}%`}</p></div>
                  {a.next && <a href={`/practice/${a.next}?from=map`} className="shrink-0 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">Practise ▶</a>}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.mastery ?? 0} aria-label={`${a.name} mastery`}><div className="h-full bg-brand-teal" style={{ width: `${a.mastery ?? 0}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
