import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { InfoTip } from "@/components/report-kit/info-tip";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classTiers } from "@/server/tiers/views";
import { strugglingSkills } from "@/server/tiers/struggling";
import { quickSendSupportPlanAction } from "@/app/teacher/plans/editor-actions";

export const metadata = { title: "Support plan" };

/** Clarifies that this level is not a single test score: it only moves with MAP, weekly checks and the Diagnostic
 * agreeing, and stays put for 14 days even then — a different, stricter basis than the "Needs support" label used
 * on Student Skills or the drop/rise patterns on Early warning (r94: teachers compared the three screens and asked
 * why they disagreed; they don't disagree, they measure different things). */
const SUPPORT_LEVEL_RULE = "This level only changes when MAP, weekly checks and the Diagnostic agree, and stays for at least 14 days — it is not based on one test. \"Needs support\" on other pages (Student Skills, Early warning) can use a different measure.";

/** The three support levels: the plain colour the teacher reads, with the usual RTI term kept beside it. */
const SUPPORT_LEVEL = {
  1: { dot: "🟢", plain: "No support needed", term: "Tier 1 · Core", tone: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  2: { dot: "🟠", plain: "Needs some support", term: "Tier 2 · Targeted", tone: "bg-amber-50 text-amber-900 ring-amber-200" },
  3: { dot: "🔴", plain: "Needs strong support", term: "Tier 3 · Intensive", tone: "bg-red-50 text-red-900 ring-red-200" },
} as const;

/**
 * 🛟 Support plan (RTI) — a plan type inside Plans. A short explanation of the levels at the top; one row per student
 * who needs support: name, colour (with the Tier term), struggling skills and "Create Plan" (a custom plan for that
 * student with those skills, sent with Review & Send). The platform still sets each level automatically every day.
 * Students never see any of this: their support skills arrive as normal work in My Work.
 * r86: a second, optional "Send as-is" button sends that exact same suggested plan immediately (editor-actions.ts's
 * quickSendSupportPlanAction) — a fast path for the clear-cut cases, kept beside (never replacing) "Create Plan".
 */
export default async function SupportPlanPage({ searchParams }: { searchParams: Promise<{ classId?: string; class?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const want = sp.classId ?? sp.class;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => String(c.id) === want) ?? classes[0];
  const view = klass ? await classTiers(repo, actor, String(klass.id)) : null;
  const rows = (view?.rows ?? []).filter((r) => r.tier >= 2).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
  const weak = view ? await strugglingSkills(repo, rows.map((r) => r.studentId)) : new Map();
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/plans", label: "Plans" }} icon="🛟" title="Support plan"
        subtitle={t("Students who need support and the skills they struggle with. The platform sets each level automatically from their results and tells you when it changes.")} />

      <section aria-label={t("What the levels mean")} className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="flex items-center gap-1 text-base font-semibold text-brand-navy">{t("What the levels mean")} <InfoTip text={SUPPORT_LEVEL_RULE} /></h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {([1, 2, 3] as const).map((k) => (
            <li key={k} className={`rounded-xl px-3 py-2 text-sm ring-1 ${SUPPORT_LEVEL[k].tone}`}>
              <span className="font-semibold">{SUPPORT_LEVEL[k].dot} {t(SUPPORT_LEVEL[k].plain)}</span>
              <span className="block text-xs opacity-80">{SUPPORT_LEVEL[k].term}{view ? ` · ${view.counts[k]} ${t("students")}` : ""}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">{t("Tier 1 (Core): the regular class teaching is enough. Tier 2 (Targeted): extra practice on a few skills, checked every 2 weeks. Tier 3 (Intensive): daily focused help, checked every week.")}</p>
      </section>

      {classes.length > 1 && <nav aria-label={t("Classes")} className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/plans/support?classId=${c.id}`} className={chip(c.id === klass?.id)}>{String(c.name)}</Link>)}</nav>}
      {!klass && <p className="text-slate-600">{t("You have no classes yet.")}</p>}

      {view && (
        <section className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">{t("Student")}</th><th className="p-3">{t("Support")}</th><th className="p-3">{t("Struggling skills")}</th><th className="p-3"></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="p-4 text-slate-600">🟢 {t("No student in this class needs support right now.")}</td></tr>}
              {rows.map((r) => {
                const lv = SUPPORT_LEVEL[r.tier as 2 | 3];
                const skills = weak.get(r.studentId) ?? [];
                const ids = [...new Set([...(r.focusSkillId ? [r.focusSkillId] : []), ...skills.map((k: { id: string }) => k.id)])].slice(0, 5);
                const names = [...new Set([...(r.focusSkill ? [r.focusSkill] : []), ...skills.map((k: { name: string }) => k.name)])].slice(0, 4);
                const plan = `/teacher/plans?${new URLSearchParams([["tab", "new"], ["program", "RTI"], ["classId", String(klass!.id)], ["who", "student"], ["sid", r.studentId], ...ids.map((id) => ["add", id] as [string, string])])}`;
                return (
                  <tr key={r.studentId} className="border-b last:border-0 align-top">
                    <td className="p-3"><Link href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link></td>
                    <td className="p-3"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${lv.tone}`}>{lv.dot} {t(lv.plain)}</span><span className="mt-0.5 block text-xs text-slate-500">{lv.term} · <Link href={`/teacher/tiers/${r.studentId}`} className="underline">{t("Change")}</Link></span></td>
                    <td className="p-3 text-slate-700">{names.length ? names.join(" · ") : <span className="text-slate-500">{r.reason}</span>}</td>
                    <td className="p-3 text-end">
                      <div className="flex flex-col items-end gap-1">
                        <Link href={plan} prefetch={false} className="inline-flex min-h-9 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white hover:bg-brand-purple">{t("Create Plan")}</Link>
                        {ids.length > 0 && (
                          <form action={quickSendSupportPlanAction}>
                            <input type="hidden" name="classId" value={klass!.id} />
                            <input type="hidden" name="sid" value={r.studentId} />
                            {ids.map((id) => <input key={id} type="hidden" name="add" value={id} />)}
                            <button className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50">{t("Send as-is")}</button>
                            <span className="mt-0.5 block max-w-[10rem] text-end text-[11px] leading-tight text-slate-500">{t("Sends right away, no review")}</span>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <p className="mt-4 text-sm text-slate-600">{t("Weekly support sessions and group planning:")} <Link href={`/teacher/rti-plan${klass ? `?classId=${klass.id}` : ""}`} className="font-semibold text-brand-teal underline">{t("Weekly Support Sessions")}</Link> · {t("Support progress reports are in Reports.")}</p>
    </AppShell>
  );
}
