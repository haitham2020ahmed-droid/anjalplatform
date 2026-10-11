import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LineChart } from "@/components/charts/line-chart";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentTierProgress } from "@/server/tiers/views";
import { setTierAction, unlockTierAction } from "../actions";
import { TierBadge } from "../tier-badge";

export const metadata = { title: "Student progress" };

/** 📈 One student's progress monitoring: check scores against the 80% line, fluency percentile, tier history. */
export default async function StudentTierPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const sp = await searchParams;
  const p = await studentTierProgress(repo, actor, studentId); // access checked inside
  const member = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const labels = p.points.map((x) => x.date.slice(5));
  const series = [
    { name: "Weekly Check %", color: "#4f46e5", points: p.points.map((x) => x.weekly) },
    { name: "Assigned sets %", color: "#0d9488", points: p.points.map((x) => x.sets) },
    { name: "Fluency percentile", color: "#d97706", points: p.points.map((x) => x.fluency) },
    { name: "80% goal", color: "#94a3b8", points: p.points.map(() => 80) },
  ];
  const SRC: Record<string, string> = { AUTO: "Rules", TEACHER: "Teacher" };
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/tiers${member ? `?class=${member.classId}` : ""}`, label: "Support tiers" }} icon="📈" title={`${p.name} · progress`}
        subtitle="Progress monitoring: each check against the 80% line (two checks in a row at 80%+ moves a student down a tier), and the fluency percentile.">
        <Link href={`/teacher/students/${studentId}`} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">Student page ▶</Link>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        {p.tier ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2"><TierBadge tier={p.tier.tier} /> <span className="text-sm text-slate-600">since {p.tier.since} · {p.tier.source === "TEACHER" ? "set by the teacher" : "set by the rules"}{p.tier.locked ? " 🔒" : ""}</span></p>
              <p className="mt-2 max-w-3xl text-sm text-slate-700">{p.tier.reason}</p>
              <p className="mt-1 text-sm text-slate-600">Focus skill: <b>{p.tier.focusSkill ?? "—"}</b> · Next check: <b className={p.tier.overdue ? "text-red-700" : ""}>{p.tier.tier === 1 ? "with the three yearly benchmarks" : `${p.tier.nextCheck ?? "—"}${p.tier.overdue ? " (overdue)" : ""}`}</b></p>
            </div>
            <div className="flex flex-col gap-2">
              <form action={setTierAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="back" value={`/teacher/tiers/${studentId}`} />
                <label className="text-xs">Tier<select name="tier" defaultValue={String(p.tier.tier)} className="mt-1 block rounded-lg border-slate-300 text-sm"><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select></label>
                <label className="text-xs">Reason<input name="reason" required minLength={3} maxLength={1000} className="mt-1 block rounded-lg border-slate-300 text-sm" /></label>
                <button className="rounded-lg bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:bg-brand-purple">Set and lock</button>
              </form>
              {p.tier.locked && <form action={unlockTierAction}><input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="back" value={`/teacher/tiers/${studentId}`} /><button className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy ring-1 ring-slate-300">🔓 Unlock (let the rules decide)</button></form>}
            </div>
          </div>
        ) : <p className="text-sm text-slate-600">No tier yet: the daily job sets it.</p>}
      </section>
      <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">Checks over time (last 6 months)</h2>
        {p.points.length ? <LineChart labels={labels} series={series} title={`Progress of ${p.name}: check scores and fluency percentile, with the 80% goal`} /> : <p className="mt-2 text-sm text-slate-600">No Weekly Checks, finished sets or fluency checks yet.</p>}
      </section>
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Tier history</h2>
          {p.history.length ? <ul className="mt-2 space-y-2 text-sm">{p.history.map((h, i) => <li key={i} className="rounded-xl bg-slate-50 p-2"><b className="tabular-nums">{h.date}</b> · Tier {h.from} → Tier {h.to} · {SRC[h.source] ?? h.source}{h.by ? ` (${h.by})` : ""}<br /><span className="text-slate-600">{h.reason}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No tier changes yet.</p>}
        </article>
        <article className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Reteach and re-checks</h2>
          {p.reteach.length ? <ul className="mt-2 space-y-2 text-sm">{p.reteach.map((r, i) => <li key={i} className="rounded-xl bg-slate-50 p-2"><b className="tabular-nums">{r.date}</b> · {r.reason}<br /><span className={r.outcome?.includes("✓") ? "text-emerald-700" : "text-slate-600"}>{r.outcome ?? "Re-check not taken yet"}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No reteach assigned yet (Tier 2/3 students with a focus skill get one automatically).</p>}
        </article>
      </section>
    </AppShell>
  );
}
