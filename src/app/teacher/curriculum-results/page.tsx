import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { curriculumResults } from "@/server/curriculum-map/results";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "@/components/report-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Curriculum results" };

const tone = (v: number | null) => (v === null ? "text-slate-400" : v >= 75 ? "text-teal-800" : v >= 50 ? "text-amber-800" : "text-red-700");

/** 📊 Class results on the Curriculum Map (teachers: their classes; admins: every class). */
export default async function CurriculumResultsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const r = classId ? await curriculumResults(repo, actor, classId) : null;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="📊" title="Curriculum Results"
        subtitle="Answers and % correct on each place of the Curriculum Map, for the students of the class."
        who={r ? <>{r.className} · {t("Grade {n}", { n: r.grade })}</> : undefined}
        filters={classes.length ? <nav aria-label="Classes" className="flex flex-wrap gap-2">
          {classes.map((c) => <Link key={String(c.id)} href={`/teacher/curriculum-results?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
        </nav> : undefined} />
      {!r ? <p className="mt-6 text-slate-600">No classes yet.</p> : (
        <>
          <AtAGlance items={[
            { icon: "✍️", label: "Answers", value: r.answered, meaning: "on Curriculum Map places" },
            { icon: "🎯", label: "% correct", value: r.pct === null ? "—" : `${r.pct}%`, meaning: r.pct === null ? "no answers yet" : r.pct >= 75 ? "strong: most answers right" : r.pct >= 50 ? "getting there" : "needs more teaching", tone: toneOfPct(r.pct, [75, 50]) },
            { icon: "🚧", label: "Needs the Most Work", value: r.weakest.length, meaning: "places to reteach first" },
          ]} />
          {r.weakest.length > 0 && (
            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <ReportSection title="Needs the Most Work" icon="🚧" className="mb-0">
                <SimpleBar items={r.weakest.map((w) => ({ label: <><code className="text-xs">{w.code}</code> · {w.label}</>, value: w.pct, note: t("{n} answers", { n: w.answered }), band: w.pct === null ? null : w.pct >= 75 ? "GOOD" : w.pct >= 50 ? "OK" : "LOW" }))} />
              </ReportSection>
              <Callout kind="next" items={[<>{t("Reteach")} <b>{r.weakest[0].label}</b> ({r.weakest[0].pct}%)</>, t("Then assign practice on these places from Plans.")]} />
            </div>
          )}
          {r.units.map((u) => (
            <details key={u.title} className="rk-section mb-4 rounded-3xl bg-white shadow-sm ring-1 ring-slate-200" open={u === r.units[0]}>
              <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-brand-navy">{u.title}</summary>
              <div className="px-3 pb-4 sm:px-5">
                <ReportTable label={u.title}
                  cols={[{ key: "s", label: "Text set / selection" }, { key: "p", label: "Place" }, { key: "st", label: "Students", num: true }, { key: "a", label: "Answers", num: true }, { key: "pct", label: "% correct", num: true }]}
                  rows={u.sets.flatMap((st) => st.places.map((pl, i) => ({ id: pl.code, sort: { s: st.heading, pct: pl.pct }, flag: pl.pct !== null && pl.pct < 50 ? "bad" as const : undefined,
                    cells: { s: i === 0 ? st.heading : <span className="text-slate-400">↳ {st.heading}</span>, p: pl.label, st: pl.students, a: pl.answered, pct: <span className={`font-semibold ${tone(pl.pct)}`}>{pl.pct === null ? "—" : `${pl.pct}%`}</span> } })))} />
              </div>
            </details>
          ))}
        </>
      )}
    </AppShell>
  );
}
