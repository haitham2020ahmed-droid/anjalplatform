import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { Tile } from "@/components/insights/badges";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherFollowup } from "@/server/insights/teacher-followup";
import { followupRulesAction } from "./actions";

export const metadata = { title: "Teacher follow-up" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "never");

/** 🧑‍🏫 Admin: is every teacher following up with their students? */
export default async function TeachersFollowupPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "analytics:school" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { rules, rows } = await teacherFollowup(repo, actor);
  const warned = rows.filter((r) => r.warnings.length);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Administration" }} icon="🧑‍🏫" title="Teacher Follow-Up" subtitle="Who signs in, assigns work, checks results and helps students at risk. Warnings show each teacher's classes so you can judge fairly."><PrintButton /></PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <dl className="grid gap-3 sm:grid-cols-4">
        <Tile label="Teachers" value={String(rows.length)} /><Tile label="With warnings" value={String(warned.length)} tone={warned.length ? "text-red-700" : "text-emerald-700"} />
        <Tile label="Assignments (30 days)" value={String(rows.reduce((t, r) => t + r.assignments30, 0))} /><Tile label="At-risk students" value={String(rows.reduce((t, r) => t + r.atRisk, 0))} />
      </dl>
      {warned.length > 0 && (
        <section className="mt-5 rounded-3xl bg-red-50 p-5 ring-1 ring-red-200">
          <h2 className="text-lg font-bold text-red-900">⚠️ Warnings</h2>
          <ul className="mt-2 space-y-2">{warned.map((r) => <li key={r.userId}><b>{r.name}</b><ul className="ms-5 list-disc text-sm text-red-900">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul></li>)}</ul>
        </section>
      )}
      <div className="mt-5 overflow-x-auto rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-3">Teacher</th><th className="px-2">Classes</th><th className="px-2">Students</th><th className="px-2">Last sign-in</th><th className="px-2">Assignments (30 d)</th><th className="px-2">Last assignment</th><th className="px-2">Results checked (30 d)</th><th className="px-2">At risk · helped</th><th className="px-2">Active this week</th><th className="px-2">On track</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.userId} className={`border-b last:border-0 ${r.warnings.length ? "bg-red-50/40" : ""}`}>
              <td className="py-2 pe-3 font-semibold">{r.name}</td><td className="px-2">{r.classes.map((c) => <Link key={c} href="/teacher/grade-summary" className="me-1">{c}</Link>)}</td><td className="px-2 tabular-nums">{r.students}</td>
              <td className="px-2">{day(r.lastLogin)}</td><td className="px-2 tabular-nums">{r.assignments30}</td><td className="px-2">{day(r.lastAssignment)}</td><td className="px-2 tabular-nums">{r.resultViews30}</td>
              <td className="px-2 tabular-nums">{r.atRisk} · {r.atRiskHelped}</td><td className="px-2 tabular-nums">{r.activePct === null ? "—" : `${r.activePct}%`}</td><td className="px-2 tabular-nums">{r.onTrackPct === null ? "—" : `${r.onTrackPct}%`}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <details className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200 print:hidden">
        <summary className="cursor-pointer font-bold text-brand-navy">⚙️ Warning rules</summary>
        <form action={followupRulesAction} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col font-semibold text-slate-700">No sign-in for (days)<input name="noLoginDays" type="number" min={1} max={90} defaultValue={rules.noLoginDays} className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <label className="flex flex-col font-semibold text-slate-700">No new assignment for (days)<input name="noAssignmentDays" type="number" min={1} max={90} defaultValue={rules.noAssignmentDays} className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <label className="flex flex-col font-semibold text-slate-700">At-risk students without new work for (days)<input name="atRiskDays" type="number" min={1} max={90} defaultValue={rules.atRiskDays} className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <button className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">Save rules</button>
        </form>
      </details>
    </AppShell>
  );
}
