import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BandBar, Callout, ReportHeader } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classTiers } from "@/server/tiers/views";
import { TIER_RULES } from "@/server/tiers/rules";
import { setTierAction, unlockTierAction } from "./actions";
import { TierBadge, TIER_TONE } from "./tier-badge";

export const metadata = { title: "Support tiers" };

/**
 * 🧭 Support tiers (RTI/MTSS) of a class: set automatically every day by the rules; the teacher sees why, can set a
 * tier (it is then locked) or unlock it (the rules decide again). Counts are compared with the usual 80 / 15 / 5.
 */
export default async function TiersPage({ searchParams }: { searchParams: Promise<{ class?: string; tier?: string; msg?: string; full?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  // teachers: Support is a plan type inside Plans now (the full table stays for admins and ?full=1)
  { const q = await searchParams; if (actor.role === "TEACHER" && q.full !== "1") redirect(`/teacher/plans/support${q.class ? `?classId=${encodeURIComponent(q.class)}` : ""}`); }
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.class) ?? classes[0];
  const view = klass ? await classTiers(repo, actor, String(klass.id)) : null;
  const filter = Number(sp.tier) || 0;
  const rows = view ? view.rows.filter((r) => !filter || r.tier === filter) : [];
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const share = (n: number) => (view && view.total ? Math.round((100 * n) / view.total) : 0);
  const { t } = await getT();
  const href = (q: Record<string, string>) => `/teacher/tiers?${new URLSearchParams({ class: String(klass?.id ?? ""), ...q })}`;
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher", label: "Home" }} icon="🧭" title="Support tiers"
        subtitle={`Tier 1 core teaching · Tier 2 small-group support, checked every 14 days · Tier 3 intensive support, checked every 7 days. The platform sets tiers every day from the evidence and tells you when one changes; a student moves down only after ${TIER_RULES.EXIT_CHECKS_IN_A_ROW} checks in a row at ${TIER_RULES.EXIT_CHECK_PCT}%+.`}
        who={view?.className} filters={classes.length ? <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/tiers?class=${c.id}`} className={chip(c.id === klass?.id)}>{String(c.name)}</Link>)}</nav> : undefined}>
        <Link href={`/teacher/data-meeting${klass ? `?class=${klass.id}` : ""}`} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">🗂️ Data meeting</Link>
      </ReportHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!classes.length && <p className="mt-4 text-slate-600">You have no classes yet.</p>}
      {view && (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><BandBar label="Support tiers" parts={[{ key: "T1", value: view.counts[1] }, { key: "T2", value: view.counts[2] }, { key: "T3", value: view.counts[3] }]} /><p className="mt-2 text-xs text-slate-500">{t("Usual school picture: about 80% Tier 1 · 15% Tier 2 · 5% Tier 3.")}</p></div>
            <Callout kind="help" items={[
              (() => { const n = view.rows.filter((r) => r.overdue); return n.length ? <>{t("Checks overdue")}: {n.slice(0, 10).map((r, i) => <span key={r.studentId}>{i ? ", " : ""}<bdi>{r.name}</bdi></span>)}</> : null; })(),
              (() => { const n = view.rows.filter((r) => r.refer); return n.length ? <>{t("Refer for evaluation")}: {n.map((r, i) => <span key={r.studentId}>{i ? ", " : ""}<bdi>{r.name}</bdi></span>)}</> : null; })(),
              (() => { const n = view.rows.filter((r) => r.tier === 3); return n.length ? <>{t("Tier 3")}: {n.slice(0, 10).map((r, i) => <span key={r.studentId}>{i ? ", " : ""}<bdi>{r.name}</bdi></span>)}</> : null; })(),
            ]}>{!view.rows.some((r) => r.overdue || r.refer || r.tier === 3) ? t("No student needs urgent help right now.") : null}</Callout>
          </div>
          <section aria-label="Tier counts" className="grid gap-3 sm:grid-cols-3">
            {([1, 2, 3] as const).map((t) => (
              <Link key={t} href={href(filter === t ? {} : { tier: String(t) })} className={`rounded-2xl p-4 ring-1 ${filter === t ? "ring-2 ring-brand-navy" : ""} ${TIER_TONE[t]}`}>
                <p className="text-sm font-semibold"><span aria-hidden="true">{t === 1 ? "●" : t === 2 ? "▲" : "■"} </span>Tier {t}</p>
                <p className="text-3xl font-extrabold tabular-nums">{view.counts[t]} <span className="text-base font-semibold">({share(view.counts[t])}%)</span></p>
                <p className="text-xs">expected about {view.expected[t]}% · {filter === t ? "showing only these" : "click to filter"}</p>
              </Link>
            ))}
          </section>
          <div className="rk-box rk-tall mt-5">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">Support tiers of {view.className}</caption>
              <thead>
                <tr><th scope="col" className="p-3">Student</th><th scope="col" className="p-3">Tier</th><th scope="col" className="p-3">Since</th><th scope="col" className="p-3">Why</th><th scope="col" className="p-3">Focus skill</th><th scope="col" className="p-3">Next check</th><th scope="col" className="p-3">Source</th><th scope="col" className="p-3">Change</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="border-t border-slate-100 align-top">
                    <td className="p-3"><Link href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link> <Link href={`/teacher/tiers/${r.studentId}`} className="ms-1 text-xs font-semibold text-brand-teal hover:underline" aria-label={`Tier: ${r.name}`}>🪜</Link>{r.refer && <span className="mt-1 block w-fit rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">⚑ Refer for evaluation</span>}</td>
                    <td className="p-3"><TierBadge tier={r.tier} /></td>
                    <td className="p-3 tabular-nums text-slate-600">{r.since ?? "—"}</td>
                    <td className="max-w-sm p-3 text-slate-700">{r.reason}</td>
                    <td className="p-3">{r.focusSkill ?? "—"}</td>
                    <td className={`p-3 tabular-nums ${r.overdue ? "font-bold text-red-700" : "text-slate-600"}`}>{r.tier === 1 ? "3× a year" : r.nextCheck ?? "—"}{r.overdue ? " (overdue)" : ""}</td>
                    <td className="p-3">{r.source === "TEACHER" ? "Teacher" : "Auto"}{r.locked ? " 🔒" : ""}{r.lockNote && <span className="mt-1 block text-xs text-slate-600">{r.lockNote}</span>}</td>
                    <td className="p-3">
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-brand-navy">Set tier</summary>
                        <form action={setTierAction} className="mt-2 space-y-2">
                          <input type="hidden" name="studentId" value={r.studentId} /><input type="hidden" name="classId" value={view.classId} /><input type="hidden" name="filter" value={filter ? String(filter) : ""} />
                          <label className="block text-xs">Tier<select name="tier" defaultValue={String(r.tier)} className="mt-1 block w-full rounded-lg border-slate-300 text-sm"><option value="1">Tier 1 · Core</option><option value="2">Tier 2 · Targeted</option><option value="3">Tier 3 · Intensive</option></select></label>
                          <label className="block text-xs">Reason<input name="reason" required minLength={3} maxLength={1000} className="mt-1 block w-full rounded-lg border-slate-300 text-sm" placeholder="What you see in class" /></label>
                          <button className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-purple">Save and lock</button>
                        </form>
                      </details>
                      {r.locked && (
                        <form action={unlockTierAction} className="mt-2">
                          <input type="hidden" name="studentId" value={r.studentId} /><input type="hidden" name="classId" value={view.classId} /><input type="hidden" name="filter" value={filter ? String(filter) : ""} />
                          <button className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🔓 Unlock (let the rules decide)</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8} className="p-4 text-slate-600">No students {filter ? `in Tier ${filter}` : "in this class"}.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Open a student for their progress graph and tier history. Rules: Tier 3 with MAP at the {TIER_RULES.T3_MAP_PERCENTILE}th percentile or lower, two checks under {TIER_RULES.T3_CHECK_PCT}%, very low fluency with low comprehension, or no gain after two interventions; Tier 2 with risk {TIER_RULES.T2_RISK}+, MAP at the {TIER_RULES.T2_MAP_PERCENTILE}th percentile or lower, fluency under the {TIER_RULES.T2_FLUENCY_PERCENTILE}th, a Diagnostic below level or a last check under {TIER_RULES.T2_CHECK_PCT}%.</p>
        </>
      )}
    </AppShell>
  );
}
