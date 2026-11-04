import Link from "next/link";
import type { TFn } from "@/i18n";
import { hideLevels } from "@/lib/hide-levels";
import { PrintButton } from "@/components/plans/print-button";
import { LiteriseMark } from "@/components/brand/literise-logo";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { lessonAt } from "@/server/curriculum-map/lesson-details";
import type { StudentPlanSummary, StudentPlanView } from "@/server/curriculum-map/plans";
import { SkillStar, StarLegend } from "@/components/skills/skill-star";
import { absolutePlanPath, planHref } from "@/lib/plan-links";
import { PlanLinksNote, PlanQr } from "@/components/plans/plan-links";

type Place = StudentPlanView["places"][number];

/** one calm line icon per state (no emoji), with its colour */
const STATE: Record<string, { icon: LineIconName; cls: string; label: string }> = {
  COMPLETED: { icon: "check", cls: "text-emerald-600", label: "done" },
  IN_PROGRESS: { icon: "half", cls: "text-amber-600", label: "started" },
  NOT_STARTED: { icon: "circle", cls: "text-slate-500", label: "not started" },
  OVERDUE: { icon: "clock", cls: "text-rose-600", label: "started" },
  LOCKED: { icon: "lock", cls: "text-slate-400", label: "not open yet" },
  EMPTY: { icon: "clock", cls: "text-slate-500", label: "not ready yet" },
};
const stateOf = (x: Place) => (x.locked ? "LOCKED" : x.empty ? "EMPTY" : x.status ?? "NOT_STARTED");

/** The plan switcher's name: the title, plus the date when two plans share a title. */
export function planChoiceLabel(p: StudentPlanSummary, all: StudentPlanSummary[]): string {
  const title = hideLevels(p.title);
  return all.filter((x) => hideLevels(x.title) === title).length > 1 ? `${title} · ${p.createdAt.slice(0, 10)}` : title;
}

/**
 * The student's study plan, laid out like a printed plan: the Literise · Study plan header, my name and class,
 * progress; then Unit → Text Set (lesson name and words) → numbered sections (Concept Vocabulary, Analyze Craft and
 * Structure, Respond to Reading, Review), each a link straight to its questions. "Download PDF / Print" prints the
 * sheet only. Several plans sent → a small switcher at the top. Server component: strings come translated via `t`.
 * `preview`: the teacher's read-only "Preview as student" (plan editor): the same sheet, no links, only a Download button.
 */
export function StudyPlan({ t, p, studentName, plans = [], basePath, msg, preview = false }: { t: TFn; p: StudentPlanView; studentName: string; plans?: StudentPlanSummary[]; basePath: string; msg?: string | null; preview?: boolean }) {
  const units = [...new Set(p.places.map((x) => x.unit))];
  const done = p.places.filter((x) => x.status === "COMPLETED").length;
  const pct = p.places.length ? Math.round((100 * done) / p.places.length) : 0;
  return (
    <div data-testid="study-plan" data-preview={preview ? "1" : undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        {!preview && plans.length > 1 && (
          <div role="group" aria-label={t("Your plans")} data-testid="plan-switcher" className="flex flex-wrap items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200/80">
            {plans.map((x) => {
              const on = x.id === p.id;
              return <Link key={x.id} prefetch={false} href={`${basePath}?plan=${encodeURIComponent(x.id)}`} aria-current={on ? "page" : undefined} className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-brand-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>{planChoiceLabel(x, plans)}</Link>;
            })}
          </div>
        )}
        <span className="flex-1" />
        {!preview && <Link prefetch={false} href="/student/respond" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal/60"><LineIcon name="writing" className="h-4 w-4" />{t("Respond to Reading")}</Link>}
        <PrintButton label={preview ? "Download" : "Download PDF / Print"} />
      </div>
      {msg && <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200 print:hidden"><LineIcon name="lock" className="h-4 w-4" />{msg}</p>}
      {p.note && <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">{p.note}</p>}
      {p.places.some((x) => x.stars?.length) && <div className="mb-3"><StarLegend who="student" t={t} /></div>}

      <article className="plan-sheet rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-7 print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-brand-navy pb-4">
          <div className="min-w-0">
            <p data-testid="plan-brand" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-teal"><LiteriseMark className="h-4 w-4" /><span dir="ltr">Literise</span> · {t("Study plan")}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-navy">{hideLevels(p.title)}</h1>
            <p className="mt-0.5 text-sm text-slate-500"><bdi>{studentName}</bdi> · <bdi>{p.className}</bdi></p>
          </div>
          <div className="w-full min-w-[200px] sm:w-56">
            <div className="flex justify-between text-xs font-medium text-slate-500"><span>{t("Progress")}</span><span dir="ltr" className="tabular-nums">{done}/{p.places.length} · {pct}%</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={p.places.length} aria-valuenow={done} aria-label={t("{done} of {total} done", { done, total: p.places.length })}><div className="h-full rounded-full bg-brand-teal" style={{ width: `${pct}%` }} /></div>
          </div>
        </header>
        <p className="mt-3 text-sm text-slate-600">{p.kind === "CURRICULUM" || p.kind === "PLACES"
          ? t("Tap any part to practise it. Each part finishes when you get {n} correct answers.", { n: p.target })
          // skill plans open adaptive practice: at least 30 questions; done when mastered, or after 50 (completion.ts)
          : t("Tap any part to practise it. You answer at least 30 questions; the part is done when you master the skill, or after 50 questions.")}</p>
        {!preview && <PlanLinksNote t={t} className="mt-2 inline-block" />}
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {(["COMPLETED", "IN_PROGRESS", "NOT_STARTED", "LOCKED", "EMPTY"] as const).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={STATE[k].cls}><LineIcon name={STATE[k].icon} className="h-3.5 w-3.5" strokeWidth={2.25} /></span>{t(STATE[k].label)}</span>)}
        </p>

        <div className="mt-6 space-y-8">
          {units.map((u, ui) => {
            const inUnit = p.places.filter((x) => x.unit === u);
            const locked = inUnit.every((x) => x.locked);
            const uDone = inUnit.filter((x) => x.status === "COMPLETED").length;
            return (
              <section key={u} className="break-inside-avoid-page">
                <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 ${locked ? "bg-slate-100 text-slate-500" : "bg-brand-navy text-white"}`}>
                  <h2 className="flex items-center gap-2 text-base font-semibold">{locked && <LineIcon name="lock" className="h-4 w-4" />}{u}</h2>
                  {!preview && <PlanQr href={absolutePlanPath(inUnit.find((x) => x.href)?.href) ?? planHref({ kind: "curriculum-unit", grade: p.grade, unit: ui + 1 }, "student")} size={44} />}
                  <span className="flex items-center gap-3 text-sm tabular-nums">
                    <span dir="ltr">{uDone}/{inUnit.length}</span>
                    {!preview && uDone === inUnit.length && inUnit.length > 0 && <Link prefetch={false} href={`/student/plans/${p.id}/certificate?unit=${encodeURIComponent(u)}`} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-white/25 print:hidden"><LineIcon name="award" className="h-3.5 w-3.5" />{t("My certificate")}</Link>}
                  </span>
                </div>
                <div className="mt-4 grid gap-x-8 gap-y-6 md:grid-cols-2 print:grid-cols-2">
                  {[...new Set(inUnit.map((x) => x.set))].map((set, si) => {
                    const lesson = lessonAt(p.grade, u, set);
                    return (
                      <div key={set} className="break-inside-avoid">
                        <div className="border-b border-slate-200 pb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{set}</p>
                          {lesson && <p className="text-base font-semibold leading-snug text-brand-navy">{lesson.name}</p>}
                          {lesson && lesson.vocabulary.length > 0 && <p className="mt-1.5 flex flex-wrap gap-1">{lesson.vocabulary.map((w) => <span key={w} className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">{w}</span>)}</p>}
                        </div>
                        <ol className="mt-1.5 space-y-0.5">
                          {inUnit.filter((x) => x.set === set).map((x, i) => <Row key={x.itemId} x={x} n={`${ui + 1}.${si + 1}.${i + 1}`} target={p.target} t={t} preview={preview} />)}
                        </ol>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </article>
    </div>
  );
}

function Row({ x, n, target, t, preview = false }: { x: Place; n: string; target: number; t: TFn; preview?: boolean }) {
  const st = stateOf(x);
  const review = /^review$/i.test(x.label.trim());
  const body = (
    <>
      <span dir="ltr" className="w-11 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-slate-400">{n}</span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 font-medium ${x.locked || x.empty ? "text-slate-400" : "text-slate-800 group-hover:text-brand-navy group-hover:underline"}`}>{review && <LineIcon name="retry" className="h-3.5 w-3.5 shrink-0 text-sky-600" />}{hideLevels(x.label)}</span>
        {x.skills && <span className="block text-xs leading-snug text-slate-500">{x.skills}</span>}
        {x.stars && x.stars.length > 0 && <span data-testid="place-stars" className="mt-0.5 flex flex-wrap items-center gap-1.5">{x.stars.map((k) => <span key={k.name} className="inline-flex items-center gap-1 text-[11px] text-slate-600"><SkillStar info={{ status: k.status }} who="student" t={t} label={k.name} size={14} />{k.name}</span>)}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-slate-500">
        {!x.locked && x.status && x.status !== "NOT_STARTED" && <span dir="ltr">{Math.min(x.correct, target)}/{target}</span>}
        <span className={STATE[st].cls} title={t(STATE[st].label)}><LineIcon name={STATE[st].icon} className="h-4 w-4" strokeWidth={2.25} /></span>
      </span>
    </>
  );
  return (
    <li data-section={review ? "review" : undefined}>
      {/* 🔗 r79: an absolute platform link, so the downloaded PDF opens the same step (sign in first if needed) */}
      {x.href && !preview ? <Link prefetch={false} href={absolutePlanPath(x.href) ?? x.href} data-plan-link="1" className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 print:underline">{body}</Link>
        : <span className="flex items-start gap-2 px-2 py-1.5" title={preview ? undefined : x.locked ? t("Your teacher has not opened this unit yet") : t("Questions are not ready yet")}>{body}</span>}
    </li>
  );
}
