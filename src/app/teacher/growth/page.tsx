import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { growthReport } from "@/server/teacher/extras";

export const metadata = { title: "MAP growth" };

/** 📈 After Winter / Spring: who grew as NWEA projected (expected share of the year's growth), by class. */
export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const subject = (await searchParams).subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const classes = (await growthReport(repo, actor, subject)).filter((c) => c.tested > 0);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/map-rit", label: "MAP" }} icon="📈" title="MAP Growth" subtitle="Growth from Fall to the latest MAP test, compared with what NWEA projected (Winter ≈ 55% of the year's projected growth, Spring = 100%)."
        when={subject === "READING" ? t("MAP Reading") : t("MAP Language")}
        filters={<div className="flex flex-wrap gap-2"><Link href="/teacher/growth" className={chip(subject === "READING")}>📖 Reading</Link><Link href="/teacher/growth?subject=LANGUAGE" className={chip(subject === "LANGUAGE")}>✏️ Language</Link></div>} />
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">The growth report appears when a Winter or Spring MAP score is imported after the Fall one.</p> : (
        <>
          <AtAGlance title="Met growth" items={classes.map((c) => ({ icon: "🌱", label: `G${c.grade} · ${c.className}`, value: `${c.tested ? Math.round((100 * c.met) / c.tested) : 0}%`,
            meaning: t("{m} of {n} · average +{g} (expected +{e})", { m: c.met, n: c.tested, g: c.avgGrowth ?? "—", e: c.avgProjected ?? "—" }), tone: c.tested && c.met / c.tested >= 0.5 ? "good" as const : "warn" as const }))} />
          <Callout kind="meaning" className="mb-5" items={[t("“Met” means the student grew at least as much as NWEA expected by now."), t("Students marked ✗ below need extra support before the next MAP test.")]} />
          {classes.map((c) => (
            <ReportSection key={c.classId} title={`G${c.grade} · ${c.className}`} icon="🏫">
              <ReportTable label={`G${c.grade} · ${c.className}`}
                cols={[{ key: "n", label: "Student" }, { key: "f", label: "Fall", num: true }, { key: "l", label: "Latest", num: true }, { key: "g", label: "Growth", num: true }, { key: "e", label: "Expected by now", num: true }, { key: "y", label: "Year goal", num: true }, { key: "m", label: "Met" }]}
                rows={c.rows.map((r) => ({
                  id: r.studentId, flag: r.met === false ? "bad" : undefined, sort: { n: r.name, f: r.fall, l: r.latest, g: r.growth, e: r.expected, y: r.projected, m: r.met === null ? null : r.met ? 1 : 0 },
                  cells: { n: <Link href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline">{r.name}</Link>, f: r.fall, l: <>{r.latest} <span className="text-xs text-slate-500">{r.latestTerm}</span></>,
                    g: <span className={`font-semibold ${r.growth < 0 ? "text-red-700" : ""}`}>{r.growth > 0 ? "+" : ""}{r.growth}</span>, e: r.expected !== null ? `+${r.expected}` : "—",
                    y: <>{r.projected !== null ? `+${r.projected}` : "—"}{r.pctOfGoal !== null ? <span className="text-xs text-slate-500"> ({r.pctOfGoal}%)</span> : null}</>,
                    m: r.met === null ? "" : r.met ? <span className="font-semibold text-emerald-700">✓ met</span> : <span className="font-semibold text-red-700">✗ below</span> },
                }))} />
            </ReportSection>
          ))}
        </>
      )}
    </AppShell>
  );
}
