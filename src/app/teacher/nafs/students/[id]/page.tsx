import Link from "next/link";
import { redirect } from "next/navigation";
import { nafsDbGate } from "@/components/db-update-needed";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { NAFS_GROUPS, nafsStudentDashboard } from "@/server/nafs/dashboard";
import { DIFFICULTY_NAME, codeName } from "@/server/nafs/framework";
import { getT } from "@/i18n/server";
import { PrintButton } from "@/components/plans/print-button";
import { AttemptsView, Delta, GROUP_CLS, kindName, Pc } from "@/components/nafs/dashboard-tab";
import { Sparkline } from "@/components/nafs/charts";

export const metadata = { title: "NAFS student" };

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:break-inside-avoid print:shadow-none";

/**
 * 🇸🇦 NAFS dashboard — one student (teacher / admin only): every test and practice in date order with the change from
 * the previous and the first, each Ministry standard's trend, strengths and weaknesses, the practice history and the
 * recommended next standards with one-click actions. NAFS tables only; the group word is teacher-facing.
 */
export default async function NafsStudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const gate = await nafsDbGate(); if (gate) return gate;
  const me = (await getActor())!.user;
  const { t } = await getT();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await nafsStudentDashboard(repo, actor, id, { from: sp.from, to: sp.to }).catch(() => null);
  if (!d) redirect("/teacher/nafs?tab=reports&msg=" + encodeURIComponent(t("This student is not in one of your Grade 6 classes.")));
  const codes = d.standards.map((x) => x.code);
  const groupName = (k: (typeof NAFS_GROUPS)[number]["key"]) => t(NAFS_GROUPS.find((g) => g.key === k)!.name);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/nafs?tab=reports&class=${d.classId}`, label: "Reports" }} icon="🇸🇦" title={d.name} subtitle={`${d.className} · ${t("NAFS tests and practice")}`}>
        <PrintButton label={t("Print")} />
      </PageHeader>
      <div className="grid gap-4">
        <form method="get" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
          <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("From")}<input type="date" name="from" defaultValue={d.range.from ?? ""} className="min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line" /></label>
          <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("To")}<input type="date" name="to" defaultValue={d.range.to ?? ""} className="min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line" /></label>
          <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        </form>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("Overview")}>
          <div className={CARD}><p className="text-3xl font-bold"><Pc v={d.latest} /></p><p className="mt-1 text-sm text-ink-2">{t("Latest test")}</p></div>
          <div className={CARD}>
            <p className="text-sm text-ink-2">{t("Group (teachers only)")}</p>
            {d.group ? <p className="mt-1"><span className={`rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${GROUP_CLS[d.group]}`}>{groupName(d.group)}</span>{d.prevGroup && d.prevGroup !== d.group && <span className="ms-2 text-xs text-muted">{t("before")}: {groupName(d.prevGroup)}</span>}</p> : <p className="mt-1 text-sm text-muted">{t("No NAFS test yet")}</p>}
          </div>
          <div className={CARD}><p className="text-3xl font-bold tabular-nums text-ink">{d.attempts.filter((a) => a.kind === "TEST").length}</p><p className="mt-1 text-sm text-ink-2">{t("Tests taken")}</p></div>
          <div className={CARD}><p className="text-3xl font-bold tabular-nums text-ink">{d.practice.length}</p><p className="mt-1 text-sm text-ink-2">{t("Practice sessions")}</p></div>
        </section>

        <section className={`${CARD} ring-2 ring-teal-200`} aria-labelledby="rec-h">
          <h2 id="rec-h" className="text-lg font-semibold text-ink">{t("Recommended next standards")}</h2>
          {!d.recommended.length ? <p className="mt-2 text-sm text-muted">{t("No results yet.")}</p> : <>
            <ul className="mt-2 grid gap-1.5 text-sm">
              {d.recommended.map((x) => <li key={x.code} className="text-ink"><b className="me-1 font-mono" dir="ltr">{x.short}</b>{t(x.text)} <span className="text-xs text-muted">· {t(x.why === "WEAK" ? "weak in the results" : "not practised or tested enough yet")}</span></li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-1.5 print:hidden">
              <Link href={d.practiceHref} className="inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white">🎯 {t("Assign adaptive practice on these standards")}</Link>
              <Link href={d.testHref} className="inline-flex min-h-10 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white">📝 {t("Make a test on these standards")}</Link>
            </div>
          </>}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className={CARD}><h2 className="text-lg font-semibold text-emerald-800">{t("Strengths")}</h2>{d.strengths.length ? <ul className="mt-2 grid gap-1 text-sm">{d.strengths.map((c) => { const x = d.standards.find((y) => y.code === c)!; return <li key={c}><b className="me-1 font-mono" dir="ltr">{x.short}</b>{t(x.text)} <Pc v={x.pct} /></li>; })}</ul> : <p className="mt-2 text-sm text-muted">—</p>}</section>
          <section className={CARD}><h2 className="text-lg font-semibold text-rose-800">{t("Weaknesses")}</h2>{d.weaknesses.length ? <ul className="mt-2 grid gap-1 text-sm">{d.weaknesses.map((c) => { const x = d.standards.find((y) => y.code === c)!; return <li key={c}><b className="me-1 font-mono" dir="ltr">{x.short}</b>{t(x.text)} <Pc v={x.pct} /></li>; })}</ul> : <p className="mt-2 text-sm text-muted">—</p>}</section>
        </div>

        <section className={CARD} aria-labelledby="att-h">
          <h2 id="att-h" className="text-lg font-semibold text-ink">{t("Every attempt in date order")}</h2>
          {!d.attempts.length ? <p className="mt-2 text-sm text-muted">{t("No results yet.")}</p> : <div className="mt-2"><AttemptsView attempts={d.attempts} codes={codes} t={t} title="Score attempt by attempt" /></div>}
        </section>

        <section className={CARD} aria-labelledby="std-h">
          <h2 id="std-h" className="text-lg font-semibold text-ink">{t("Each standard over time")}</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Standard")}</th><th>{t("Tests %")}</th><th>{t("Practice %")}</th><th>{t("Trend")}</th><th>{t("First")}</th><th>{t("Latest")}</th><th>{t("Change from first")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {d.standards.map((x) => (
                  <tr key={x.code}>
                    <td className="py-2 text-ink"><b className="me-1 font-mono" dir="ltr">{x.short}</b>{t(x.text)}</td>
                    <td className="text-center"><Pc v={x.testPct} /><span className="block text-[11px] text-muted">({x.testN})</span></td>
                    <td className="text-center"><Pc v={x.practicePct} /><span className="block text-[11px] text-muted">({x.practiceN})</span></td>
                    <td className="text-center"><Sparkline points={x.trend.map((p) => p.pct)} label={x.short} /></td>
                    <td className="text-center"><Pc v={x.first} /></td><td className="text-center"><Pc v={x.latest} /></td><td className="text-center"><Delta v={x.change} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={CARD} aria-labelledby="pr-h">
          <h2 id="pr-h" className="text-lg font-semibold text-ink">{t("Practice history")}</h2>
          {!d.practice.length ? <p className="mt-2 text-sm text-muted">{t("No adaptive practice yet. Give the first one below.")}</p> : (
            <ul className="mt-2 divide-y divide-line">
              {d.practice.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <p className="font-semibold text-ink"><span className="me-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-900 ring-1 ring-teal-200">{t(kindName("PRACTICE"))}</span>{p.title} <span className="text-xs font-normal text-muted">· {new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {t("{n} answers", { n: p.asked })} · <Pc v={p.pct} />{p.seconds ? ` · ${t("{n} min", { n: Math.round(p.seconds / 60) })}` : ""}</span></p>
                  {p.targets.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5 text-xs">{p.targets.map((x) => <span key={x.code} className={`rounded-full px-2 py-0.5 ring-1 ${x.mastered ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-surface-2 text-ink-2 ring-line"}`}><b>{codeName(x.code, t)}</b> · <Pc v={x.pct} /> ({x.n}) · {t("reached")} {x.reached ? t(DIFFICULTY_NAME[x.reached]) : "—"}{x.mastered ? " ✓" : ""}</span>)}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
