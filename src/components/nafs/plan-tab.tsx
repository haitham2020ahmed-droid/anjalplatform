import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsClasses } from "@/server/nafs/tests";
import { nafsDashboardCached } from "@/server/nafs/dashboard";
import { suggestedPlan, type PlanItem } from "@/server/nafs/suggested-plan";
import { centerHref } from "@/server/nafs/center";
import { codeName } from "@/server/nafs/framework";
import { createPracticeAction } from "@/app/teacher/nafs/actions";
import { Combo } from "@/components/ui/combo";
import { PrintButton } from "@/components/plans/print-button";
import { Pc } from "./dashboard-tab";
import { PendingButton } from "./pending-button";
import { absolutePlanPath } from "@/lib/plan-links";
import { PlanA, PlanLinksNote, PlanQr } from "@/components/plans/plan-links";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:break-inside-avoid print:shadow-none";

/**
 * 🇸🇦 NAFS center → 5. SUGGESTED PLAN: built from the reports — the weakest standards of each class, of each group of
 * students who share a weak standard, and of each student — with ONE-CLICK assign (adaptive practice on exactly those
 * standards for exactly those students; it starts at Medium and adapts) and "Make a test on these standards".
 */
export async function PlanTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const classes = await nafsClasses(repo, actor);
  if (!classes.length) return <p className={`${CARD} text-sm text-muted`}>{t("You have no Grade 6 class yet.")}</p>;
  const classId = classes.find((c) => c.id === sp.class)?.id ?? null;
  const d = await nafsDashboardCached(repo, actor, { classId, from: sp.from, to: sp.to });
  const plan = suggestedPlan(d);
  const here = centerHref("plan", { class: classId, from: d.scope.range.from, to: d.scope.range.to });
  return (
    <div className="grid gap-4">
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
        <input type="hidden" name="tab" value="plan" />
        <div className="grid min-w-52 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" label={t("Class")} defaultValue={classId ?? ""} options={[{ value: "", label: t("All my Grade 6 classes") }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        <PrintButton label={t("Print")} />
      </form>
      {!plan.noData && <PlanLinksNote t={t} className="justify-self-start" />}
      <p className="text-sm text-ink-2">{t("Built from the NAFS reports: the weakest Ministry standards per class, per group and per student. One click gives adaptive practice on exactly those standards (each student starts at Medium and the questions adapt).")}</p>
      {plan.noData ? <p className={`${CARD} text-sm text-muted`}>{t("No NAFS results in these dates yet. Give a NAFS test or adaptive practice first.")}</p> : plan.classes.filter((c) => c.withData > 0).map((c) => (
        <section key={c.classId} className={CARD} aria-labelledby={`pl-${c.classId}`}>
          <h2 id={`pl-${c.classId}`} className="flex items-center justify-between gap-3 text-lg font-semibold text-ink"><span>{c.className} <span className="text-sm font-normal text-muted">· {t("{n} students", { n: c.students })}</span></span><PlanQr href={absolutePlanPath(centerHref("plan", { class: c.classId }))} size={46} /></h2>
          {c.strengths.length > 0 && <p className="mt-1 text-sm text-emerald-800">{t("Strengths")}: {c.strengths.map((x) => `${codeName(x.code, t)} (${x.pct}%)`).join(" · ")}</p>}
          <h3 className="mt-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("The whole class")}</h3>
          {c.classItem ? <Item item={c.classItem} t={t} back={here} /> : <p className="mt-1 text-sm text-muted">{t("No class-wide weak standard: work with the groups and students below.")}</p>}
          {c.groups.length > 0 && <>
            <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-muted">{t("Groups")}</h3>
            <ul className="mt-1 grid gap-2 md:grid-cols-2">{c.groups.map((g) => <li key={g.key}><Item item={g} t={t} back={here} /></li>)}</ul>
          </>}
          {c.perStudent.length > 0 && (
            <details className="mt-4 rounded-xl bg-surface-2 p-3 ring-1 ring-line" open={c.perStudent.length <= 6}>
              <summary className="cursor-pointer text-sm font-semibold text-ink">{t("Each student")} ({c.perStudent.length})</summary>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">{c.perStudent.map((x) => <li key={x.key}><Item item={x} t={t} back={here} /></li>)}</ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

function Item({ item, t, back }: { item: PlanItem; t: TFn; back: string }) {
  const who = item.scope === "CLASS" ? t("The whole class") : item.students.map((x) => x.name).join(", ");
  return (
    <div className="mt-1 rounded-xl bg-surface p-3 ring-1 ring-line">
      <p className="text-sm text-ink">{item.scope === "STUDENT" ? <b>{who} <Pc v={item.students[0]?.pct} /></b> : item.scope === "GROUP" ? <b>{who}</b> : null}</p>
      <ul className="mt-1 grid gap-0.5 text-sm text-ink-2">
        {/* 🔗 r79: each standard opens the NAFS practice builder on exactly these standards and students */}
        {item.evidence.map((e) => <li key={e.code}><PlanA href={absolutePlanPath(item.practiceHref)}>{codeName(e.code, t)}</PlanA>{e.pct !== null ? <> · <Pc v={e.pct} /> <span className="text-xs text-muted">({t("{n} items", { n: e.n })})</span></> : null}</li>)}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
        <form action={createPracticeAction}>
          <input type="hidden" name="title" value={item.title} /><input type="hidden" name="classId" value={item.classId} /><input type="hidden" name="back" value={back} />
          {item.codes.map((c) => <input key={c} type="hidden" name="target" value={c} />)}
          {item.scope !== "CLASS" && item.students.map((x) => <input key={x.id} type="hidden" name="sid" value={x.id} />)}
          <PendingButton icon="🎯" label="Assign adaptive practice now" pendingLabel="Assigning…" className="inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white" />
        </form>
        <Link href={item.practiceHref} className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line">{t("Change first")}</Link>
        <Link href={item.testHref} className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line">📝 {t("Make a test on these standards")}</Link>
      </div>
    </div>
  );
}
