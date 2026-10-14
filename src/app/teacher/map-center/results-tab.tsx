import Link from "next/link";
import type { TFn } from "@/i18n";
import { NameList } from "@/components/name-list";
import { ReportIntro, ReportSection, ReportSummary } from "@/components/report-kit";
import { mapResultsSummary } from "@/lib/report-summaries";
import { EmptyState } from "@/components/ui-kit";
import { DESC_STYLE, STATUS_STYLE } from "@/components/map/map-ui";
import { repo } from "@/server/auth/next";
import { can, type Actor } from "@/server/auth/rbac";
import { bandSettings, GROUPS, type Subject } from "@/server/map/map-plan";
import { classMatrix } from "@/server/map/map-more";
import { saveBandsAction } from "../map-plans/actions";
import { BTN_MAIN } from "@/components/plans/plan-builder";

/** Results: the class's MAP scores for one subject — RIT, projection, each sub-area (RIT, band, descriptor). */
export async function ResultsTab({ actor, t, classId, subject }: { actor: Actor; t: TFn; classId: string; subject: Subject }) {
  const m = await classMatrix(repo, actor, classId, subject);
  const groups = GROUPS.filter((g) => g.subject === subject);
  const isAdmin = actor.role !== "TEACHER" && can(actor, "settings:school");
  const bands = isAdmin ? await bandSettings(repo, actor.schoolId) : null;
  const enter = <Link href="/teacher/map-rit" className={BTN_MAIN}>{t("Enter scores")}</Link>;
  const summary = mapResultsSummary(m.rows, { classId, subject, total: m.rows.length + m.noScores.length, areaName: (k) => groups.find((g) => g.key === k)?.name ?? k });
  if (!m.rows.length) return <><ReportIntro text="Each student's MAP score and sub-area scores, lowest first." /><EmptyState icon="🗺️" title="No MAP scores yet" text="Enter or import the class's MAP scores to see results and make plans." action={{ href: "/teacher/map-rit", label: "Enter scores" }} /><ReportSummary summary={summary} /></>;
  return (
    <>
      <ReportIntro text="Each student's MAP score and sub-area scores, lowest first." />
      <ReportSection title={`${m.className} · ${subject === "READING" ? t("Reading") : t("Language Usage")}`} icon="📊"
        hint={<>{m.rows[0]?.profile.term ?? ""} · {t("{n} with scores · lowest RIT first", { n: m.rows.length })}</>}>
        <div className="mb-3 flex justify-end print:hidden">{enter}</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-start text-sm">
            <thead><tr className="border-b text-xs text-slate-500">
              <th className="py-2 pe-3 text-start">{t("Student")}</th><th className="px-2 text-start">RIT</th><th className="px-2 text-start">{t("Projection")}</th>
              {groups.map((g) => <th key={g.key} className="px-2 text-start">{g.name}</th>)}
            </tr></thead>
            <tbody>{m.rows.map((r) => (
              <tr key={r.studentId} className="border-b align-top last:border-0">
                <td className="py-2 pe-3"><Link href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link>{r.retest && <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{t("retest?")}</span>}</td>
                <td className="px-2"><b className="tabular-nums">{r.profile.overall?.rit}</b> <span className="text-xs text-slate-500">{r.profile.overall?.band}</span>{r.profile.overall?.descriptor && <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${DESC_STYLE[r.profile.overall.descriptor]}`}>{r.profile.overall.descriptor}</span>}</td>
                <td className="px-2 tabular-nums">{r.profile.fall ? `${r.profile.fall.rit} → ${r.profile.fall.projection ?? "?"}` : "—"}</td>
                {groups.map((g) => { const a = r.profile.areas.find((x) => x.group === g.key); return <td key={g.key} className="px-2">{a?.rit !== null && a?.rit !== undefined ? <span className={`inline-block rounded-lg px-2 py-1 ring-1 ${STATUS_STYLE[a.status ?? "MAINTAIN"]}`}><b className="tabular-nums">{a.rit}</b> <span className="text-xs">{a.band}</span><br /><span className="text-xs">{a.descriptor}</span></span> : <span className="text-slate-400">—</span>}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {m.noScores.length > 0 && <p className="mt-3 text-sm text-slate-500">{t("No scores yet:")} <NameList items={m.noScores} sep=", " />.</p>}
        <p className="mt-3 text-xs text-slate-500">{t("Red = the lowest sub-areas (focus) · green = strong. The plan tab suggests skills from the lowest sub-areas.")}</p>
      </ReportSection>
      <ReportSummary summary={summary} />
      {bands && (
        <details className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200 print:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-brand-navy">{t("RIT bands (admin)")}</summary>
          <form action={saveBandsAction} className="flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="classId" value={classId} /><input type="hidden" name="subject" value={subject} /><input type="hidden" name="tab" value="matrix" />
            <label className="text-sm">{t("Band size")} <input name="size" type="number" min={5} max={20} defaultValue={bands.size} className="mt-1 block min-h-11 w-24 rounded-lg border border-slate-300 px-2" /></label>
            <label className="text-sm">{t("From RIT")} <input name="min" type="number" min={100} max={300} defaultValue={bands.min} className="mt-1 block min-h-11 w-24 rounded-lg border border-slate-300 px-2" /></label>
            <label className="text-sm">{t("To RIT")} <input name="max" type="number" min={150} max={350} defaultValue={bands.max} className="mt-1 block min-h-11 w-24 rounded-lg border border-slate-300 px-2" /></label>
            <button className={BTN_MAIN}>{t("Save")}</button>
          </form>
        </details>
      )}
    </>
  );
}
