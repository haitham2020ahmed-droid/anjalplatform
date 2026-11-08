import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, EmptyState, ReportHeader, ReportSection } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { standardsReport, type StdBand, type StdRow } from "@/server/reports/standards-report";
import { mapStandardsView, standardCode, standardDescriptions } from "@/server/map/map-standards";
import { MapStandardsSection } from "./map-section";

export const metadata = { title: "Standards (CCSS)" };

const BAND: Record<StdBand, { label: string; bar: string; pill: string }> = {
  MET: { label: "Mastered (80%+)", bar: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-900" },
  NEAR: { label: "Getting there (60–79%)", bar: "bg-amber-400", pill: "bg-amber-100 text-amber-900" },
  BELOW: { label: "Needs work (under 60%)", bar: "bg-rose-500", pill: "bg-rose-100 text-rose-900" },
  NONE: { label: "Not started", bar: "bg-slate-200", pill: "bg-slate-100 text-slate-700" },
};
const ORDER: StdBand[] = ["MET", "NEAR", "BELOW", "NONE"];

/** One standard's class bar (green / yellow / red / grey) with the numbers in words for screen readers. */
function Bar({ r, total, t }: { r: StdRow; total: number; t: (s: string, v?: Record<string, string | number>) => string }) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={ORDER.map((b) => `${t(BAND[b].label)}: ${r.counts[b]}`).join(", ")}>
      {ORDER.map((b) => r.counts[b] > 0 && <span key={b} className={BAND[b].bar} style={{ width: `${(100 * r.counts[b]) / Math.max(1, total)}%` }} />)}
    </div>
  );
}

/**
 * 📐 Standards (CCSS) for a class (Nov 2026, IXL "Standards Proficiency"): every Common Core standard of the grade with
 * the class's progress on it from the skill stars (green ≥ 80 %, yellow 60–79 %, red under 60 %, grey not started),
 * grouped by strand. A standard opens its skills and the students who still need it, with Assign.
 */
export default async function StandardsPage({ searchParams }: { searchParams: Promise<{ classId?: string; standard?: string; source?: string; std?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => String(c.id) === sp.classId) ?? classes[0];
  const isMap = sp.source === "map";
  const v = klass ? await standardsReport(repo, actor, String(klass.id), isMap ? null : sp.standard ?? null) : null;
  // 📐 MAP (NWEA) view: the "likely proficient" table uploaded for this class, beside the skill stars
  const mapV = klass && isMap ? await mapStandardsView(repo, actor, String(klass.id)) : null;
  const mapDesc = mapV ? await standardDescriptions(repo, mapV.rows.map((r) => r.code)) : new Map<string, string>();
  const skillsByCode = new Map((v?.rows ?? []).map((r) => [standardCode(r.code) ?? r.code, r.skills.map((k) => ({ skillId: k.skillId, name: k.name }))]));
  const canUpload = actor.role !== "SUPER_ADMIN" || !!actor.schoolId;
  const href = (p: Record<string, string | undefined>) => `/teacher/reports/standards?${new URLSearchParams(Object.entries({ classId: v?.classId, standard: sp.standard, ...p }).filter(([, x]) => x) as [string, string][])}`;
  const srcTabs = klass ? (
    <div className="mb-4 flex flex-wrap gap-2 print:hidden" role="tablist">
      <Link prefetch={false} href={`/teacher/reports/standards?${new URLSearchParams({ classId: String(klass.id) })}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${!isMap ? "bg-brand-teal text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`}>⭐ {t("From the skill stars")}</Link>
      <Link prefetch={false} href={`/teacher/reports/standards?${new URLSearchParams({ classId: String(klass.id), source: "map" })}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${isMap ? "bg-brand-teal text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`}>🧭 {t("From MAP (NWEA)")}</Link>
    </div>
  ) : null;
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  const strands = v ? [...new Set(v.rows.map((r) => r.strand))] : [];
  const sum = (b: StdBand) => (v ? v.rows.filter((r) => r.pctMet !== null && (b === "MET" ? r.pctMet >= 80 : b === "NEAR" ? r.pctMet >= 60 && r.pctMet < 80 : r.pctMet < 60)).length : 0);
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="📐" title="Standards (CCSS)" who={klass ? <bdi>{String(klass.name)}</bdi> : undefined}
        subtitle={isMap ? "Each Common Core standard from the class's MAP test: who is likely proficient (NWEA)." : "How far the class is on each Common Core standard, from the skill stars."}
        filters={classes.length > 1 ? <div className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} prefetch={false} href={`/teacher/reports/standards?${new URLSearchParams({ classId: String(c.id), ...(isMap ? { source: "map" } : {}) })}`} className={chip(String(c.id) === String(klass?.id))}>{String(c.name)}</Link>)}</div> : undefined} />
      {srcTabs}
      {sp.msg && <p className="mb-4 rounded-xl bg-slate-50 px-4 py-2 text-sm text-slate-800 ring-1 ring-slate-200" role="status">{sp.msg}</p>}
      {!v ? <EmptyState icon="🏫" title="You do not teach any class yet." /> : isMap ? (
        <MapStandardsSection classId={v.classId} view={mapV} desc={Object.fromEntries(mapDesc)} skills={Object.fromEntries(skillsByCode)} open={sp.std ?? null} canUpload={canUpload} canAssign={actor.role === "TEACHER"} />
      ) : !v.rows.length ? <EmptyState icon="📐" title="No standards are linked to this grade's skills yet." /> : (
        <>
          <AtAGlance items={[
            { icon: "📐", label: "Standards", value: v.rows.length, meaning: t("Grade {g}", { g: v.grade }) },
            { icon: "🟢", label: "Mastered by most", value: sum("MET"), meaning: "80% or more of those who started", tone: "good" },
            { icon: "🟡", label: "Getting there", value: sum("NEAR"), meaning: "60–79% of those who started" },
            { icon: "🔴", label: "Needs work", value: sum("BELOW"), meaning: "under 60% of those who started", tone: sum("BELOW") ? "warn" : "neutral" },
          ]} />
          <p className="mb-4 flex flex-wrap gap-3 text-xs text-slate-600">{ORDER.map((b) => <span key={b} className="flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded-sm ${BAND[b].bar}`} />{t(BAND[b].label)}</span>)}</p>

          {v.open && (
            <ReportSection title={`${v.open.code}`} icon="🔎" hint={v.open.description}>
              <div className="mb-3 flex flex-wrap items-center gap-3"><div className="w-full max-w-md"><Bar r={v.open} total={v.students} t={t} /></div><Link prefetch={false} href={href({ standard: undefined })} className="text-sm font-semibold text-brand-teal underline print:hidden">{t("Close")}</Link></div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="font-semibold text-brand-navy">{t("Skills of this standard")}</h3>
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">{v.open.skills.map((k) => (
                    <li key={k.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <Link prefetch={false} href={`/skill/${k.skillId}`} className="font-semibold text-brand-navy hover:underline">{k.name}</Link>
                      <span className="flex items-center gap-2 tabular-nums text-xs text-slate-600">⭐ {k.mastered} · ◐ {k.practising} · ☆ {k.notStarted}
                        {actor.role === "TEACHER" && <Link prefetch={false} href={`/teacher/skill-assign?${new URLSearchParams({ skillId: k.skillId, classId: v.classId })}`} className="rounded-lg bg-brand-navy px-2 py-0.5 font-semibold text-white print:hidden">{t("Assign")}</Link>}
                      </span>
                    </li>
                  ))}</ul>
                </div>
                <div>
                  <h3 className="font-semibold text-brand-navy">{t("Students")}</h3>
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">{v.open.byStudent.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2 py-1.5" data-std-student={x.band}>
                      <Link prefetch={false} href={`/teacher/students/${x.id}`} className="truncate text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${BAND[x.band].pill}`}>{x.avg !== null ? `${x.avg}%` : t("Not started")}{x.started ? ` · ${t("{n} of {m} skills", { n: x.started, m: x.of })}` : ""}</span>
                    </li>
                  ))}</ul>
                </div>
              </div>
            </ReportSection>
          )}

          {strands.map((st) => (
            <ReportSection key={st} title={st} icon="📚">
              <ul className="divide-y divide-slate-100">{v.rows.filter((r) => r.strand === st).map((r) => (
                <li key={r.id} className={`grid gap-2 py-2 sm:grid-cols-[8rem_1fr_14rem] sm:items-center ${v.open?.id === r.id ? "bg-teal-50/60" : ""}`} data-standard={r.code}>
                  <Link prefetch={false} href={href({ standard: r.id })} className="font-semibold text-brand-navy hover:underline" dir="ltr">{r.code}</Link>
                  <p className="text-sm text-slate-700" data-content lang="en">{r.description || "—"}</p>
                  <div className="flex items-center gap-2">
                    <Bar r={r} total={v.students} t={t} />
                    <b className={`shrink-0 text-sm tabular-nums ${r.pctMet === null ? "text-slate-400" : r.pctMet >= 80 ? "text-emerald-700" : r.pctMet >= 60 ? "text-amber-700" : "text-rose-700"}`}>{r.pctMet === null ? "—" : `${r.pctMet}%`}</b>
                  </div>
                </li>
              ))}</ul>
            </ReportSection>
          ))}
          <p className="text-xs text-slate-500">{t("The % is the share of the students who started a skill of the standard and average 80% or more on its skills (a ⭐ counts 100). Open a standard for its skills and students.")}</p>
        </>
      )}
    </AppShell>
  );
}
