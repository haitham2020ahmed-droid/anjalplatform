import Link from "next/link";
import type { TFn } from "@/i18n";
import { Callout, ReportSection, ReportTable } from "@/components/report-kit";
import { repo } from "@/server/auth/next";
import type { Actor } from "@/server/auth/rbac";
import type { Subject } from "@/server/map/map-plan";
import { reportsHub } from "@/server/map/map-reports";
import { growthReport } from "@/server/teacher/extras";

/**
 * Reports: every MAP report of the class in one list (printable / PDF), each student's reports, and Growth —
 * shown ONLY once a Winter or Spring score exists after the Fall one.
 */
export async function ReportsTab({ actor, t, classId, subject }: { actor: Actor; t: TFn; classId: string; subject: Subject }) {
  const [v, growth] = await Promise.all([reportsHub(repo, actor, classId), growthReport(repo, actor, subject)]);
  const g = growth.find((c) => c.classId === classId && c.tested > 0) ?? null;
  const isAdmin = actor.role !== "TEACHER";
  const btn = "inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  const reports: { title: string; what: string; links: [string, string][] }[] = [
    { title: "Class profile", what: "Percentile bands, class vs national, sub-areas, retest flags and projected proficiency.", links: [["Reading", `/map-report/class/${classId}/profile?subject=READING`], ["Language Usage", `/map-report/class/${classId}/profile?subject=LANGUAGE`]] },
    { title: "Group study plan", what: "Students of the same RIT band together for each sub-area, with the skills.", links: [["Reading", `/map-report/class/${classId}/groups?subject=READING`], ["Language Usage", `/map-report/class/${classId}/groups?subject=LANGUAGE`]] },
    { title: "Study plans · whole class", what: "Every student's personal study plan in one PDF.", links: [["Reading", `/map-report/class/${classId}/study-plans?subject=READING`], ["Language Usage", `/map-report/class/${classId}/study-plans?subject=LANGUAGE`]] },
    { title: "Family reports · whole class", what: "For parents: achievement, growth and the goal, two pages per student.", links: [["Open", `/map-report/class/${classId}/family`]] },
    { title: "3-level group plan (Word)", what: "The class in three groups by percentile, each group's goals and standards.", links: [["Reading", `/api/personal-plan-doc?classId=${classId}&subject=reading`], ["Language Usage", `/api/personal-plan-doc?classId=${classId}&subject=language`]] },
    { title: "Grade and school overview", what: "Every grade and class side by side: mean RIT vs national, bands, growth.", links: [["Open", `/teacher/map-center?${new URLSearchParams({ tab: "reports", view: "overview", classId, subject })}`]] },
  ];
  return (
    <>
      {(!v.continuum.READING || !v.continuum.LANGUAGE) && (
        <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("The Learning Continuum is not complete yet: study plans list the platform's skills for each RIT range instead.")} {isAdmin && <Link href="/admin/map-continuum" className="font-semibold underline">{t("Import it")}</Link>}</p>
      )}
      <ReportSection title="MAP reports" icon="📑" hint={t("Every report prints or saves as PDF.")}>
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <li key={r.title} className="flex flex-col rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-lg font-semibold text-brand-navy">{t(r.title)}</p>
              <p className="flex-1 text-sm text-slate-600">{t(r.what)}</p>
              <div className="mt-3 flex flex-wrap gap-2">{r.links.map(([l, href]) => <Link key={href} href={href} className={btn}>{t(l)}</Link>)}</div>
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title={`${t("Students")} · ${v.className}`} icon="👩‍🎓" className="mt-6">
        <ReportTable label="Students"
          cols={[{ key: "n", label: "Student" }, { key: "r", label: "Reading RIT", num: true }, { key: "l", label: "Language RIT", num: true }, { key: "p", label: "Student profile", sort: false }, { key: "s", label: "Study plan", sort: false }, { key: "f", label: "Family report", sort: false }]}
          rows={v.students.map((x) => ({
            id: x.id, sort: { n: x.name, r: x.reading, l: x.language },
            cells: {
              n: <Link href={`/teacher/students/${x.id}`} className="font-semibold text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link>, r: x.reading ?? "—", l: x.language ?? "—",
              p: x.reading !== null || x.language !== null ? <Link className="font-semibold text-brand-teal underline" href={`/map-report/profile/${x.id}`}>{t("Open")}</Link> : <span className="text-slate-400">—</span>,
              s: <span className="space-x-2">{x.reading !== null && <Link className="font-semibold text-brand-teal underline" href={`/map-report/study-plan/${x.id}?subject=READING`}>{t("Reading")}</Link>}{x.language !== null && <Link className="font-semibold text-brand-teal underline" href={`/map-report/study-plan/${x.id}?subject=LANGUAGE`}>{t("Language Usage")}</Link>}{x.reading === null && x.language === null && <span className="text-slate-400">—</span>}</span>,
              f: x.reading !== null || x.language !== null ? <Link className="font-semibold text-brand-teal underline" href={`/map-report/family/${x.id}`}>{t("Open")}</Link> : <span className="text-slate-400">—</span>,
            },
          }))} />
      </ReportSection>

      {g && (
        <ReportSection title={`${t("Growth")} · ${subject === "READING" ? t("Reading") : t("Language Usage")}`} icon="📈" className="mt-6"
          hint={t("{m} of {n} met their growth · average +{g} (expected +{e})", { m: g.met, n: g.tested, g: g.avgGrowth ?? "—", e: g.avgProjected ?? "—" })}>
          <Callout kind="meaning" className="mb-4" items={[t("“Met” means the student grew at least as much as NWEA expected by now.")]} />
          <ReportTable label={`${t("Growth")} · ${g.className}`}
            cols={[{ key: "n", label: "Student" }, { key: "f", label: "Fall", num: true }, { key: "l", label: "Latest", num: true }, { key: "g", label: "Growth", num: true }, { key: "e", label: "Expected by now", num: true }, { key: "m", label: "Met" }]}
            rows={g.rows.map((r) => ({
              id: r.studentId, flag: r.met === false ? "bad" : undefined, sort: { n: r.name, f: r.fall, l: r.latest, g: r.growth, e: r.expected, m: r.met === null ? null : r.met ? 1 : 0 },
              cells: {
                n: <Link href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link>, f: r.fall,
                l: <>{r.latest} <span className="text-xs text-slate-500">{r.latestTerm}</span></>,
                g: <span className={`font-semibold ${r.growth < 0 ? "text-red-700" : ""}`}>{r.growth > 0 ? "+" : ""}{r.growth}</span>,
                e: r.expected !== null ? `+${r.expected}` : "—",
                m: r.met === null ? "" : r.met ? <span className="font-semibold text-emerald-700">✓ {t("met")}</span> : <span className="font-semibold text-red-700">✗ {t("not yet")}</span>,
              },
            }))} />
        </ReportSection>
      )}
      {!g && <p className="mt-4 text-sm text-slate-500">{t("Growth appears here once a Winter or Spring score is imported after the Fall one.")}</p>}
    </>
  );
}
