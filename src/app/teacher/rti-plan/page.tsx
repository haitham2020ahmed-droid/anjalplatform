import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { ClassChips, Empty, ExportLinks, Stat, Stats, TableBox, td, th } from "@/components/reports/report-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { rtiWeeklyPlan, type Decision } from "@/server/tiers/weekly-plan";

export const metadata = { title: "RTI weekly plan" };

const DECISION_STYLE: Record<Decision, string> = {
  EXIT: "bg-emerald-100 text-emerald-900", STAY: "bg-slate-100 text-slate-800", INTENSIFY: "bg-red-100 text-red-900",
  REFER: "bg-purple-100 text-purple-900", RETEST: "bg-amber-100 text-amber-900", CHECK: "bg-sky-100 text-sky-900",
};
const DECISION_SHORT: Record<Decision, string> = { EXIT: "Exit candidate", STAY: "Stay", INTENSIFY: "Intensify", REFER: "Refer", RETEST: "Re-test", CHECK: "Check now" };

/** 🗓 RTI weekly plan: this week's Tier 2 / Tier 3 groups — students, focus skill, lesson, minutes, checks, decisions. Printable. */
export default async function RtiPlanPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const p = klass ? await rtiWeeklyPlan(repo, actor, klass.id) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/tiers", label: "Support Tiers" }} icon="🗓" title="RTI weekly plan"
        subtitle={p ? <>Week of <b>{p.weekOf}</b> – {p.weekEnd} · <bdi>{p.className}</bdi>. Tier 2 and Tier 3 groups with their focus skill, lesson, minutes and progress checks. The tiers come from the Support Tiers page.</> : "This week's Tier 2 and Tier 3 groups."}>
        <PrintButton label="🖨 Print / Save as PDF" />
      </PageHeader>
      <div className="print:hidden"><ClassChips classes={classes} current={klass?.id ?? null} href={(id) => `/teacher/rti-plan?classId=${id}`} /></div>
      {!p ? <Empty>You have no classes yet.</Empty> : (
        <div className="space-y-5">
          <Stats>
            <Stat label="Students" value={p.counts.students} />
            <Stat label="Tier 1" value={p.counts.tier1} note="core instruction" tone="teal" />
            <Stat label="Tier 2" value={p.counts.tier2} note="targeted" tone={p.counts.tier2 ? "amber" : "slate"} />
            <Stat label="Tier 3" value={p.counts.tier3} note="intensive" tone={p.counts.tier3 ? "red" : "slate"} />
            <Stat label="Groups this week" value={p.groups.length} />
          </Stats>
          <ExportLinks report={{ kind: "rti", classId: klass!.id, period: "TERM" }} />
          {!p.groups.length ? <Empty>No student is in Tier 2 or Tier 3 this week: core instruction for everyone.</Empty> : p.groups.map((g) => (
            <Section key={g.key} title={g.label} icon={g.tier === 3 ? "🔴" : "🟠"} tone={g.tier === 3 ? "amber" : "white"} className="break-inside-avoid">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-slate-200 text-sm">
                  <p className="font-semibold text-brand-navy">📚 Intervention lesson</p>
                  {g.lesson ? (
                    <>
                      <p className="mt-1"><Link href={g.lesson.href} className="font-semibold text-brand-teal hover:underline">{g.lesson.name}</Link></p>
                      <p className="mt-1 text-slate-600"><b>Warm-up:</b> {g.lesson.warmUp}</p>
                      {g.lesson.approaches.map((a, i) => <p key={i} className="mt-1 text-slate-600"><b>{g.tier === 3 ? `Re-teach approach ${i + 1}` : "If they do not get it"}:</b> {a}</p>)}
                    </>
                  ) : <p className="mt-1 text-slate-600">{g.fallback}</p>}
                  {g.assignHref && <p className="mt-2 print:hidden"><Link href={g.assignHref} className="inline-flex min-h-10 items-center font-semibold text-brand-teal hover:underline">Assign practice on the skill →</Link></p>}
                </div>
                <div className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-slate-200 text-sm">
                  <p className="font-semibold text-brand-navy">⏱ Time</p>
                  <p className="mt-1 text-slate-700">{g.minutes}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-slate-200 text-sm">
                  <p className="font-semibold text-brand-navy">📋 Progress checks</p>
                  <p className="mt-1 text-slate-700">Every {g.checkEvery} days (8 items).</p>
                  <p className="mt-1 text-slate-700">{g.checkDates.length ? <>Due this week or overdue: <b>{g.checkDates.join(", ")}</b></> : "None due this week."}</p>
                </div>
              </div>
              <TableBox label={`Students of ${g.label}`}>
                <table className="mt-3 w-full min-w-[640px] text-sm">
                  <thead><tr><th className={th}>Student</th><th className={th}>In tier since</th><th className={th}>Next check</th><th className={th}>Last checks</th><th className={th}>Decision</th></tr></thead>
                  <tbody>{g.students.map((st) => (
                    <tr key={st.studentId} className="border-t border-slate-100">
                      <td className={td}><Link href={`/teacher/tiers/${st.studentId}`} className="font-semibold text-brand-teal hover:underline"><bdi>{st.name}</bdi></Link>{st.locked && <span className="ms-1 text-xs text-slate-500">(teacher's tier)</span>}</td>
                      <td className={td}>{st.since ?? "—"}</td>
                      <td className={`${td} ${st.overdue ? "font-semibold text-red-700" : st.checkThisWeek ? "font-semibold text-amber-800" : ""}`}>{st.nextCheck ?? "—"}{st.overdue ? " (overdue)" : st.checkThisWeek ? " (this week)" : ""}</td>
                      <td className={td}>{st.checks.length ? st.checks.map((c, i) => <span key={i} className="me-2 inline-block whitespace-nowrap">{c.date}: <b>{c.pct}%</b>{c.items ? ` of ${c.items}` : ""}{c.theta !== null ? <span className="text-xs text-slate-500"> (ability {c.theta >= 0 ? "+" : "−"}{Math.abs(c.theta).toFixed(1)}{c.se ? ` ± ${c.se.toFixed(1)}` : ""})</span> : null}{c.signal === "INVALID" ? <span className="text-xs text-amber-800"> invalid</span> : null}</span>) : <span className="text-slate-500">No check yet</span>}</td>
                      <td className={td}><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${DECISION_STYLE[st.decision]}`} title={st.decisionText}>{DECISION_SHORT[st.decision]}</span><p className="mt-1 text-xs text-slate-600">{st.decisionText}</p></td>
                    </tr>
                  ))}</tbody>
                </table>
              </TableBox>
            </Section>
          ))}
          <Section title="Decision rules" icon="⚖️" hint="The same rules the daily tier job uses; the decision column is a suggestion — the teacher decides.">
            <ul className="list-disc space-y-1 ps-5 text-sm text-slate-700">{p.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </Section>
        </div>
      )}
    </AppShell>
  );
}
