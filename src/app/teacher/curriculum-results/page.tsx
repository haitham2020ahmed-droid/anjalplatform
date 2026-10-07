import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { curriculumResults } from "@/server/curriculum-map/results";
import { PageHeader } from "@/components/page-header";

const tone = (v: number | null) => (v === null ? "text-slate-400" : v >= 75 ? "text-teal-800" : v >= 50 ? "text-amber-800" : "text-red-700");

/** 📊 Class results on the Curriculum Map (teachers: their classes; admins: every class). */
export default async function CurriculumResultsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const r = classId ? await curriculumResults(repo, actor, classId) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="📊" title="Curriculum results" subtitle={<>Answers and % correct on each place of the Curriculum Map, for the students of the class.</>} />
      {!r ? <p className="mt-6 text-slate-600">No classes yet.</p> : (
        <>
          <nav aria-label="Classes" className="mt-4 flex flex-wrap gap-2">
            {classes.map((c) => <Link key={String(c.id)} href={`/teacher/curriculum-results?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
          </nav>
          <p className="mt-4 text-lg font-semibold text-brand-navy">{r.className} · Grade {r.grade} · {r.answered} answers · <span className={tone(r.pct)}>{r.pct === null ? "no answers yet" : `${r.pct}% correct`}</span></p>
          {r.weakest.length > 0 && (
            <section className="mt-4 rounded-2xl bg-red-50/50 p-4 ring-1 ring-red-200">
              <h2 className="font-bold text-red-900">Needs the most work</h2>
              <ul className="mt-1 text-sm">{r.weakest.map((w) => <li key={w.code}><code className="text-xs">{w.code}</code> · {w.label}: <span className={`font-semibold ${tone(w.pct)}`}>{w.pct}%</span> ({w.answered} answers)</li>)}</ul>
            </section>
          )}
          {r.units.map((u) => (
            <details key={u.title} className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200" open={u === r.units[0]}>
              <summary className="cursor-pointer px-5 py-3 text-lg font-bold text-brand-navy">{u.title}</summary>
              <div className="overflow-x-auto px-5 pb-4">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b text-slate-500"><th className="py-2">Text set / selection</th><th>Place</th><th>Students</th><th>Answers</th><th>% correct</th></tr></thead>
                  <tbody>{u.sets.flatMap((st) => st.places.map((pl, i) => (
                    <tr key={pl.code} className="border-b last:border-0"><td className="py-1.5 pe-3 font-medium">{i === 0 ? st.heading : ""}</td><td>{pl.label}</td><td className="tabular-nums">{pl.students}</td><td className="tabular-nums">{pl.answered}</td><td className={`tabular-nums font-semibold ${tone(pl.pct)}`}>{pl.pct === null ? "—" : `${pl.pct}%`}</td></tr>
                  )))}</tbody>
                </table>
              </div>
            </details>
          ))}
        </>
      )}
    </AppShell>
  );
}
