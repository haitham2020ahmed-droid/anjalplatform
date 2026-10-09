import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { bridges } from "@/server/curriculum-map/bridge";
import { importBridgesAction, resetBridgesAction } from "./actions";

export const metadata = { title: "Cross-Grade Bridge" };

/** 🌉 Cross-Grade Bridge: each category linked to the same skill one grade up (🚀) and one grade down (🛟). */
export default async function BridgePage({ searchParams }: { searchParams: Promise<{ grade?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const grade = [4, 5, 6].includes(Number(sp.grade)) ? Number(sp.grade) : 5;
  const rows = await bridges(repo, actor.schoolId!, grade);
  const isAdmin = actor.role !== "TEACHER";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/admin/curriculum-map?grade=${grade}`, label: "Curriculum Map" }} icon="🌉" title="Cross-Grade Bridge"
        subtitle={<>Each category is linked to the <b>same skill</b> one grade up — a <b>🚀 challenge path</b> for students who master Above Level — and one grade down — a <b>🛟 support path</b> for students who struggle at Below Level. The adaptive ladder becomes 🛟 Support → Below → On → Above → 🚀 Challenge: a real difference in text difficulty, with no question copied.</>}>
        <a href="/api/bridge-csv" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Download (CSV)</a>
      </PageHeader>
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Grade" className="mb-4 flex gap-2">{[4, 5, 6].map((g) => <Link key={g} href={`/admin/curriculum-map/bridge?grade=${g}`} aria-current={g === grade ? "page" : undefined} className={`rounded-full px-5 py-2 text-sm font-bold ${g === grade ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>Grade {g}</Link>)}</nav>
      {isAdmin && (
        <Section title="Use Your Own Bridge Sheet" icon="📥" tone="amber" className="mb-6" hint="Columns: From, Challenge, Support (Curriculum Map codes, e.g. G5.U1.TS2.ACS). Download the current bridge to start from it. Rows in your sheet replace the automatic match for those places.">
          <div className="flex flex-wrap items-center gap-3">
            <form action={importBridgesAction} className="flex flex-wrap items-center gap-3 text-sm"><input type="file" name="file" accept=".csv,.xlsx" required /><button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Import</button></form>
            <form action={resetBridgesAction}><button className="text-sm font-semibold text-slate-500 underline">Back to the automatic match</button></form>
          </div>
        </Section>
      )}
      <div className="overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Grade {grade} place</th><th className="p-3">🚀 Challenge (Grade {grade + 1})</th><th className="p-3">🛟 Support (Grade {grade - 1})</th><th className="p-3">Source</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.from} className="border-b align-top last:border-0">
              <td className="p-3"><code className="text-xs text-emerald-800">{r.from}</code><p className="text-slate-700">{r.fromLabel.split(" · ").slice(1).join(" · ")}</p></td>
              <td className="p-3">{r.challenge ? <><code className="text-xs text-violet-800">{r.challenge}</code><p className="text-slate-600">{r.challengeLabel?.split(" · ").slice(1).join(" · ")}</p></> : <span className="text-slate-400">—</span>}</td>
              <td className="p-3">{r.support ? <><code className="text-xs text-orange-800">{r.support}</code><p className="text-slate-600">{r.supportLabel?.split(" · ").slice(1).join(" · ")}</p></> : <span className="text-slate-400">—</span>}</td>
              <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.source === "AUTO" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-900"}`}>{r.source === "AUTO" ? "Automatic" : "Your sheet"}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </AppShell>
  );
}
