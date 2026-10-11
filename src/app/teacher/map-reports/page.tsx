import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReportHeader, ReportSection, ReportTable } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { reportsHub } from "@/server/map/map-reports";

export const metadata = { title: "MAP Reports" };

/** 📑 Every MAP report of a class in one place: per student, per group, whole class. */
export default async function MapReportsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await reportsHub(repo, actor, classId) : null;
  const isAdmin = actor.role !== "TEACHER";
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const card = "lift flex flex-col rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="📑" title="MAP Reports"
        subtitle="Personal study plans, family reports and group study plans from the MAP results, the Learning Continuum and each student's practice on the platform. Every report prints or saves as PDF."
        who={v?.className} print={false}
        filters={classes.length ? <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/map-reports?classId=${c.id}`} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav> : undefined} />
      {v && (!v.continuum.READING || !v.continuum.LANGUAGE) && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">📘 The Learning Continuum is {v.continuum.READING || v.continuum.LANGUAGE ? `missing for ${v.continuum.READING ? "Language Usage" : "Reading"}` : "not imported yet"}: study plans then list the platform&apos;s skills of each RIT range instead of “ready to learn” statements. {isAdmin ? <Link href="/admin/map-continuum" className="font-semibold underline">Import it</Link> : "Ask the admin to import it."}</p>
      )}
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No class yet.</p> : (
        <>
          {v && (
            <>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div className={`${card} ring-2 ring-teal-300`}><p className="text-lg font-bold text-brand-navy">📊 Class Profile</p><p className="flex-1 text-sm text-slate-600">NWEA style: percentile bands, class vs national, instructional areas, test details with retest flags, growth, projected proficiency and the achievement × growth chart.</p><div className="mt-3 flex gap-2"><Link className={btn} href={`/map-report/class/${classId}/profile?subject=READING`}>📖 Reading</Link><Link className={btn} href={`/map-report/class/${classId}/profile?subject=LANGUAGE`}>✍️ Language</Link></div></div>
                <div className={card}><p className="text-lg font-bold text-brand-navy">🏫 Grade & School Overview</p><p className="flex-1 text-sm text-slate-600">Every grade and class side by side: mean RIT vs national, percentile bands, growth, tests to check.</p><div className="mt-3"><Link className={btn} href="/teacher/map-overview">Open</Link></div></div>
                <div className={card}><p className="text-lg font-bold text-brand-navy">👥 Group Study Plan</p><p className="flex-1 text-sm text-slate-600">Students of the same RIT band together for each goal area: what to develop, the skills, who mastered them — send each group its practice.</p><div className="mt-3 flex gap-2"><Link className={btn} href={`/map-report/class/${classId}/groups?subject=READING`}>📖 Reading</Link><Link className={btn} href={`/map-report/class/${classId}/groups?subject=LANGUAGE`}>✍️ Language</Link></div></div>
                <div className={card}><p className="text-lg font-bold text-brand-navy">🧭 Study Plans · whole class</p><p className="flex-1 text-sm text-slate-600">Every student&apos;s Personal Study Plan in one PDF: cover with each goal area, then Reinforce · Develop · Introduce with the skills.</p><div className="mt-3 flex gap-2"><Link className={btn} href={`/map-report/class/${classId}/study-plans?subject=READING`}>📖 Reading</Link><Link className={btn} href={`/map-report/class/${classId}/study-plans?subject=LANGUAGE`}>✍️ Language</Link></div></div>
                <div className={card}><p className="text-lg font-bold text-brand-navy">👪 Family Reports · whole class</p><p className="flex-1 text-sm text-slate-600">For parents: achievement, growth, the RIT history against the national average, the goal and the practice — a cover list, then 2 pages per student.</p><div className="mt-3"><Link className={btn} href={`/map-report/class/${classId}/family`}>Open</Link></div></div>
                <div className={card}><p className="text-lg font-bold text-brand-navy">🎚 3-Level Group Plan</p><p className="flex-1 text-sm text-slate-600">Below · On · Above by percentile, each group&apos;s goals and standards (Word / PDF).</p><div className="mt-3"><Link className={btn} href={`/teacher/personal-plan?classId=${classId}`}>Open</Link></div></div>
                <div className={card}><p className="text-lg font-bold text-brand-navy">📋 Individual MAP Plans</p><p className="flex-1 text-sm text-slate-600">Each student&apos;s plan to check, edit and assign as practice at each student’s level; print all.</p><div className="mt-3"><Link className={btn} href={`/teacher/map-plans?classId=${classId}&tab=plans`}>Open</Link></div></div>
                <div className={card}><p className="text-lg font-bold text-brand-navy">🧭 MAP Skill Plan</p><p className="flex-1 text-sm text-slate-600">The platform&apos;s skills in six RIT ranges for the grade; the class&apos;s students in each range.</p><div className="mt-3"><Link className={btn} href={`/teacher/map-skill-plan?classId=${classId}`}>Open</Link></div></div>
              </div>
              <ReportSection title={`Students · ${v.className}`} icon="👩‍🎓" className="mt-6">
                <ReportTable label="Students"
                  cols={[{ key: "n", label: "Student" }, { key: "r", label: "Reading RIT", num: true }, { key: "l", label: "Language RIT", num: true }, { key: "p", label: "Student Profile", sort: false }, { key: "s", label: "Personal Study Plan", sort: false }, { key: "f", label: "Family Report", sort: false }]}
                  rows={v.students.map((x) => ({
                    id: x.id, sort: { n: x.name, r: x.reading, l: x.language },
                    cells: { n: <span className="text-slate-800">{x.name}</span>, r: x.reading ?? "—", l: x.language ?? "—",
                      p: (x.reading !== null || x.language !== null) ? <Link className="font-semibold text-brand-teal underline" href={`/map-report/profile/${x.id}`}>Open</Link> : <span className="text-slate-400">—</span>,
                      s: <span className="space-x-2">{x.reading !== null && <Link className="font-semibold text-brand-teal underline" href={`/map-report/study-plan/${x.id}?subject=READING`}>Reading</Link>}{x.language !== null && <Link className="font-semibold text-brand-teal underline" href={`/map-report/study-plan/${x.id}?subject=LANGUAGE`}>Language</Link>}{x.reading === null && x.language === null && <span className="text-slate-400">no score</span>}</span>,
                      f: (x.reading !== null || x.language !== null) ? <Link className="font-semibold text-brand-teal underline" href={`/map-report/family/${x.id}`}>Open</Link> : <span className="text-slate-400">—</span> },
                  }))} />
              </ReportSection>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
