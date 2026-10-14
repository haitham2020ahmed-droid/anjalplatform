import Link from "next/link";
import type { TFn } from "@/i18n";
import { Callout, ReportIntro, ReportSection, ReportSummary, ReportTable } from "@/components/report-kit";
import { mapGrowthSummary, signed } from "@/lib/report-summaries";
import { repo } from "@/server/auth/next";
import type { Actor } from "@/server/auth/rbac";
import type { Subject } from "@/server/map/map-plan";
import { reportsHub } from "@/server/map/map-reports";
import { growthReport } from "@/server/teacher/extras";

/**
 * MAP Growth Report (Reports → MAP): every student's RIT with their own MAP reports, and Growth —
 * shown ONLY once a Winter or Spring score exists after the Fall one.
 */
export async function ReportsTab({ actor, t, classId, subject }: { actor: Actor; t: TFn; classId: string; subject: Subject }) {
  const [v, growth] = await Promise.all([reportsHub(repo, actor, classId), growthReport(repo, actor, subject)]);
  const g = growth.find((c) => c.classId === classId && c.tested > 0) ?? null;
  const isAdmin = actor.role !== "TEACHER";
  return (
    <>
      <ReportIntro text="Each student's MAP score (RIT) and who reached the growth expected by now." />
      {(!v.continuum.READING || !v.continuum.LANGUAGE) && (
        <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("The Learning Continuum is not complete yet: study plans list the platform's skills for each RIT range instead.")} {isAdmin && <Link href="/admin/map-continuum" className="font-semibold underline">{t("Import it")}</Link>}</p>
      )}

      <ReportSection title={`${t("Students")} · ${v.className}`}>
        <ReportTable label="Students"
          cols={[{ key: "n", label: "Student" }, { key: "r", label: "Reading RIT", num: true }, { key: "l", label: "Language RIT", num: true }, { key: "p", label: "Student profile", sort: false }, { key: "s", label: "Study plan", sort: false, more: true }, { key: "f", label: "Family report", sort: false, more: true }]}
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
          hint={t("{m} of {n} met their growth · average {g} (expected {e})", { m: g.met, n: g.measured, g: signed(g.avgGrowth), e: signed(g.avgProjected) })}>
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
      <ReportSummary summary={mapGrowthSummary(v.students, g, { classId, subject, admin: isAdmin })} />
    </>
  );
}
