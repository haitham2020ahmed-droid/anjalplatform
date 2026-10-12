import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ENOUGH_QUESTIONS, mapCoverage, type CoverageRow } from "@/server/map/coverage";

export const metadata = { title: "Coverage Report" };
export const dynamic = "force-dynamic";

const TONE = { RED: "bg-red-50 text-red-800", ORANGE: "bg-amber-50 text-amber-900", OK: "" } as const;
const DOT = { RED: "🔴", ORANGE: "🟠", OK: "🟢" } as const;

/**
 * 📊 Coverage Report (admin only): every skill a MAP plan can show — Reading and Language Usage, every RIT band —
 * with its link to the Question Bank and its number of published questions. 🔴 0 questions · 🟠 under 25.
 * Always computed fresh (so it re-checks itself after every question import). Excel: all lists, one sheet each.
 */
export default async function CoveragePage({ searchParams }: { searchParams: Promise<{ show?: string; grade?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const r = await mapCoverage(repo, actor);
  const show = sp.show === "red" ? "red" : sp.show === "orange" ? "orange" : "all";
  const grade = Number(sp.grade) || null;
  const list = r.rows.filter((x) => (show === "red" ? x.tone === "RED" : show === "orange" ? x.tone === "ORANGE" : true) && (!grade || x.grade === grade));
  const q = (o: Record<string, string | number | null>) => `/admin/coverage?${new URLSearchParams(Object.entries({ show, grade: grade ?? "", ...o }).filter(([, v]) => v !== "" && v !== null && v !== "all").map(([k, v]) => [k, String(v)])).toString()}`;
  const pill = (on: boolean) => `inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`;
  const card = (label: string, n: number, tone: string, href?: string) => {
    const body = <><span className={`block text-2xl font-semibold tabular-nums ${tone}`}>{n}</span><span className="text-sm text-slate-600">{label}</span></>;
    return href ? <Link href={href} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal">{body}</Link> : <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">{body}</div>;
  };
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Back" }} icon="📊" title="Coverage Report"
        subtitle={`Every skill a MAP plan can show (Reading + Language Usage, all RIT bands): is it on the platform, linked to the Question Bank, and how many published questions does it have? 🔴 0 questions · 🟠 under ${ENOUGH_QUESTIONS}. Updated every time you open it.`}>
        <a href="/api/admin/coverage" className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">⬇️ Excel</a>
        <Link href="/admin/questions/import?to=curriculum" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">📥 Import questions</Link>
        <Link href="/admin/map-links" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">🔗 Fix MAP links</Link>
      </PageHeader>

      {!r.hasContinuum && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">The MAP Learning Continuum is not imported yet, so RIT bands and missing skills cannot be listed. Import it under MAP → Learning Continuum; the skills linked to MAP areas are listed below.</p>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Summary">
        {card("MAP skills", r.summary.skills, "text-brand-navy", q({ show: "all" }))}
        {card("🔴 0 questions", r.summary.zero, "text-red-700", q({ show: "red" }))}
        {card(`🟠 under ${ENOUGH_QUESTIONS}`, r.summary.under, "text-amber-700", q({ show: "orange" }))}
        {card(`🟢 ${ENOUGH_QUESTIONS}+ questions`, r.summary.ok, "text-emerald-700")}
        {card("Missing skills", r.summary.missing, "text-red-700", "#missing")}
        {card("Not linked to MAP", r.summary.notLinked, "text-amber-700", "#not-linked")}
      </section>

      <nav className="mt-5 flex flex-wrap items-center gap-2" aria-label="Filter">
        <Link href={q({ show: "all" })} className={pill(show === "all")}>All</Link>
        <Link href={q({ show: "red" })} className={pill(show === "red")}>🔴 0 questions</Link>
        <Link href={q({ show: "orange" })} className={pill(show === "orange")}>🟠 under {ENOUGH_QUESTIONS}</Link>
        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
        <Link href={q({ grade: "" })} className={pill(!grade)}>All grades</Link>
        {r.grades.map((g) => <Link key={g} href={q({ grade: g })} className={pill(grade === g)}>Grade {g}</Link>)}
      </nav>

      <section className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Skill</th><th className="p-3">Grade</th><th className="p-3">Subject · Strand</th><th className="p-3">RIT bands</th><th className="p-3">On platform</th><th className="p-3">Linked to bank</th><th className="p-3 text-end">Questions</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="p-4 text-slate-600">Nothing in this list. 🎉</td></tr>}
            {list.map((x: CoverageRow) => (
              <tr key={x.skillId} className={`border-b last:border-0 ${TONE[x.tone]}`}>
                <td className="p-3 font-medium">{DOT[x.tone]} <Link href={`/admin/questions?skill=${encodeURIComponent(x.skillId)}`} className="hover:underline">{x.skill}</Link></td>
                <td className="p-3 tabular-nums">{x.grade}</td>
                <td className="p-3">{x.subject} · {x.strand}</td>
                <td className="p-3 text-xs text-slate-600">{x.bands || "—"}</td>
                <td className="p-3">✓</td>
                <td className="p-3">{x.linked ? "✓" : "✗"}</td>
                <td className="p-3 text-end font-semibold tabular-nums">{x.questions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="missing" className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-red-200">
        <h2 className="border-b px-4 py-3 text-base font-semibold text-brand-navy">Missing skills · {r.missing.length}</h2>
        <p className="px-4 pt-2 text-sm text-slate-600">MAP statements no platform skill is linked to (by their CCSS codes). Add a skill with these standards, or link an existing skill's standards.</p>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Subject · Strand</th><th className="p-3">RIT band</th><th className="p-3">Topic</th><th className="p-3">Statement</th><th className="p-3">Standards</th></tr></thead>
          <tbody>{r.missing.slice(0, 400).map((m, i) => <tr key={i} className="border-b last:border-0"><td className="p-3">{m.subject} · {m.strand}</td><td className="p-3 tabular-nums">{m.band}</td><td className="p-3">{m.topic}</td><td className="p-3">{m.statement}</td><td className="p-3 text-xs">{m.standards || "—"}</td></tr>)}</tbody>
        </table>
        {r.missing.length > 400 && <p className="p-3 text-sm text-slate-600">… and {r.missing.length - 400} more in the Excel file.</p>}
      </section>

      <section id="not-linked" className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-amber-200">
        <h2 className="border-b px-4 py-3 text-base font-semibold text-brand-navy">Skills with questions but no MAP area · {r.notLinked.length}</h2>
        <p className="px-4 pt-2 text-sm text-slate-600">These skills never reach a MAP plan. Link them under <Link href="/admin/map-links" className="font-semibold underline">MAP links</Link>.</p>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Skill</th><th className="p-3">Grade</th><th className="p-3 text-end">Questions</th></tr></thead>
          <tbody>{r.notLinked.slice(0, 400).map((k) => <tr key={k.skillId} className="border-b last:border-0"><td className="p-3">{k.skill}</td><td className="p-3">{k.grade}</td><td className="p-3 text-end tabular-nums">{k.questions}</td></tr>)}</tbody>
        </table>
      </section>
    </AppShell>
  );
}
