import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Section } from "@/components/page-header";
import { ClassChips, Empty, exportsOf } from "@/components/reports/report-ui";
import { AtAGlance, BandBar, Callout, ReportHeader, ReportSection, ReportTable } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { rtiWeeklyPlan, type Decision } from "@/server/tiers/weekly-plan";

export const metadata = { title: "RTI weekly plan" };

const DECISION_STYLE: Record<Decision, string> = {
  EXIT: "bg-emerald-100 text-emerald-900", STAY: "bg-slate-100 text-slate-800", INTENSIFY: "bg-red-100 text-red-900",
  REFER: "bg-purple-100 text-purple-900", RETEST: "bg-amber-100 text-amber-900", CHECK: "bg-sky-100 text-sky-900",
};
const DECISION_SHORT: Record<Decision, string> = { EXIT: "Exit candidate", STAY: "Stay", INTENSIFY: "Intensify", REFER: "Refer", RETEST: "Re-test", CHECK: "Check now" };

/** 🗓 RTI weekly groups (printable; linked from the RTI plan page): this week's Tier 2 / Tier 3 groups — students, focus skill, lesson, minutes, checks, decisions. Printable. */
export default async function RtiPlanPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const p = klass ? await rtiWeeklyPlan(repo, actor, klass.id) : null;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: klass ? `/teacher/rti-plan?classId=${klass.id}` : "/teacher/rti-plan", label: "RTI plan" }} icon="🗓" title="RTI weekly plan"
        subtitle={p ? <>Tier 2 and Tier 3 groups with their focus skill, lesson, minutes and progress checks. The tiers come from the Support Tiers page.</> : "This week's Tier 2 and Tier 3 groups."}
        who={p ? p.className : klass?.name} when={p ? <>{t("Week of")} <b>{p.weekOf}</b> – {p.weekEnd}</> : undefined}
        downloads={klass ? exportsOf({ kind: "rti", classId: klass.id, period: "TERM" }) : []}
        filters={<ClassChips classes={classes} current={klass?.id ?? null} href={(id) => `/teacher/rti-plan/weekly?classId=${id}`} />} />
      {!p ? <Empty>You have no classes yet.</Empty> : (
        <div className="space-y-5">
          <AtAGlance items={[
            { icon: "👩‍🎓", label: "Students", value: p.counts.students, meaning: t("{n} groups this week", { n: p.groups.length }) },
            { icon: "🟢", label: "Tier 1", value: p.counts.tier1, meaning: "core instruction", tone: "good" },
            { icon: "🟠", label: "Tier 2", value: p.counts.tier2, meaning: "targeted: a small group a few times a week", tone: p.counts.tier2 ? "warn" : "neutral" },
            { icon: "🔴", label: "Tier 3", value: p.counts.tier3, meaning: "intensive: a small group every day", tone: p.counts.tier3 ? "bad" : "neutral" },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportSection title="Support tiers" icon="🪜" className="mb-0">
              <BandBar parts={[{ key: "T1", value: p.counts.tier1 }, { key: "T2", value: p.counts.tier2 }, { key: "T3", value: p.counts.tier3 }]} />
            </ReportSection>
            <Callout kind="next" items={[
              ...p.groups.slice(0, 3).map((g) => <><b>{g.label}</b>: {g.minutes}</>),
              (() => { const n = p.groups.flatMap((g) => g.students).filter((s) => s.overdue).length; return n ? t("{n} progress checks are overdue: do them first.", { n }) : null; })(),
            ]} />
          </div>
          {!p.groups.length ? <Empty>No student is in Tier 2 or Tier 3 this week: core instruction for everyone.</Empty> : p.groups.map((g) => (
            <Section key={g.key} title={g.label} icon={g.tier === 3 ? "🔴" : "🟠"} tone={g.tier === 3 ? "amber" : "white"} className="rk-section break-inside-avoid">
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
              <div className="mt-3"><ReportTable label={`Students of ${g.label}`}
                cols={[{ key: "n", label: "Student" }, { key: "s", label: "In tier since" }, { key: "c", label: "Next check" }, { key: "l", label: "Last checks", sort: false }, { key: "d", label: "Decision" }]}
                rows={g.students.map((st) => ({
                  id: st.studentId, flag: st.overdue ? "bad" : st.checkThisWeek ? "warn" : undefined, sort: { n: st.name, s: st.since, c: st.nextCheck, d: DECISION_SHORT[st.decision] },
                  cells: {
                    n: <><Link href={`/teacher/students/${st.studentId}`} className="font-semibold text-brand-teal hover:underline"><bdi>{st.name}</bdi></Link> <Link href={`/teacher/tiers/${st.studentId}`} className="ms-1 text-xs font-semibold text-brand-teal hover:underline print:hidden" aria-label={`Tier: ${st.name}`}>🪜</Link>{st.locked && <span className="ms-1 text-xs text-slate-500">(teacher's tier)</span>}</>,
                    s: st.since ?? "—",
                    c: <span className={st.overdue ? "font-semibold text-red-700" : st.checkThisWeek ? "font-semibold text-amber-800" : ""}>{st.nextCheck ?? "—"}{st.overdue ? " (overdue)" : st.checkThisWeek ? " (this week)" : ""}</span>,
                    l: <>{st.checks.length ? st.checks.map((c, i) => <span key={i} className="me-2 inline-block whitespace-nowrap">{c.date}: <b>{c.pct}%</b>{c.items ? ` of ${c.items}` : ""}{c.theta !== null ? <span className="text-xs text-slate-500"> (ability {c.theta >= 0 ? "+" : "−"}{Math.abs(c.theta).toFixed(1)}{c.se ? ` ± ${c.se.toFixed(1)}` : ""})</span> : null}{c.signal === "INVALID" ? <span className="text-xs text-amber-800"> invalid</span> : null}</span>) : <span className="text-slate-500">No check yet</span>}</>,
                    d: <span className="block text-start"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${DECISION_STYLE[st.decision]}`} title={st.decisionText}>{DECISION_SHORT[st.decision]}</span><span className="mt-1 block text-xs text-slate-600">{st.decisionText}</span></span>,
                  },
                }))} /></div>
            </Section>
          ))}
          <ReportSection title="Decision rules" icon="⚖️" hint="The same rules the daily tier job uses; the decision column is a suggestion — the teacher decides.">
            <ul className="list-disc space-y-1 ps-5 text-sm text-slate-700">{p.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </ReportSection>
        </div>
      )}
    </AppShell>
  );
}
