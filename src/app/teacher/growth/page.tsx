import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
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
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/map-rit", label: "MAP" }} icon="📈" title="MAP Growth" subtitle="Growth from Fall to the latest MAP test, compared with what NWEA projected (Winter ≈ 55% of the year's projected growth, Spring = 100%).">
        <Link href="/teacher/growth" className={chip(subject === "READING")}>📖 Reading</Link><Link href="/teacher/growth?subject=LANGUAGE" className={chip(subject === "LANGUAGE")}>✏️ Language</Link><PrintButton />
      </PageHeader>
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">The growth report appears when a Winter or Spring MAP score is imported after the Fall one.</p> : (
        <>
          <section className="mb-5 grid gap-3 md:grid-cols-3">{classes.map((c) => (
            <div key={c.classId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="font-bold text-brand-navy">G{c.grade} · {c.className}</p>
              <p className="text-3xl font-extrabold text-brand-navy">{c.tested ? Math.round((100 * c.met) / c.tested) : 0}% <span className="text-sm font-semibold text-slate-500">met growth</span></p>
              <p className="text-sm text-slate-600">{c.met} of {c.tested} · average +{c.avgGrowth ?? "—"} (expected +{c.avgProjected ?? "—"})</p>
            </div>
          ))}</section>
          {classes.map((c) => (
            <section key={c.classId} className="mb-5 break-inside-avoid rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-brand-navy">G{c.grade} · {c.className}</h2>
              <table className="mt-2 min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-1">Student</th><th>Fall</th><th>Latest</th><th>Growth</th><th>Expected by now</th><th>Year goal</th><th /></tr></thead>
                <tbody>{c.rows.map((r) => <tr key={r.studentId} className="border-b last:border-0"><td className="py-1.5"><Link href={`/teacher/progress/${r.studentId}`} className="font-semibold text-brand-navy hover:underline">{r.name}</Link></td><td className="tabular-nums">{r.fall}</td><td className="tabular-nums">{r.latest} <span className="text-xs text-slate-500">{r.latestTerm}</span></td><td className={`tabular-nums font-semibold ${r.growth < 0 ? "text-red-700" : ""}`}>{r.growth > 0 ? "+" : ""}{r.growth}</td><td className="tabular-nums">{r.expected !== null ? `+${r.expected}` : "—"}</td><td className="tabular-nums">{r.projected !== null ? `+${r.projected}` : "—"}{r.pctOfGoal !== null ? <span className="text-xs text-slate-500"> ({r.pctOfGoal}%)</span> : null}</td><td>{r.met === null ? "" : r.met ? <span className="font-semibold text-emerald-700">✓ met</span> : <span className="font-semibold text-red-700">✗ below</span>}</td></tr>)}</tbody></table>
            </section>
          ))}
        </>
      )}
    </AppShell>
  );
}
