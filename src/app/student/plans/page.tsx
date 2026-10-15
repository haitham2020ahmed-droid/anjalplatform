import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PreviewFrame } from "@/components/student/preview-frame";
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState } from "@/components/ui-kit";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { studentPlans, type StudentPlanCard } from "@/server/student/my-plans";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";

export const metadata = { title: "My Plans" };

/**
 * 📋 My Plans (owner r82: "any plan the teacher makes and sends to the student goes there, organised by type"). It had
 * become a redirect to Home in the student pages redesign (every plan's work was only in My Work / the program pages),
 * so it vanished from the menu. Now: every live plan sent to me — Curriculum Map, MAP plan, Custom plan, Extra
 * practice plan, NAFS plan, Other — each card with its teacher, dates, "x of y done", Continue and its PDF.
 * Server: src/server/student/my-plans.ts (only my plans; withdrawn, cancelled and draft plans never show).
 */
export default async function MyPlans({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  const { t, lang } = await getT();
  const groups = await studentPlans(repo, actor, { lang });
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="📋" title="My Plans" subtitle={t("Every plan your teacher sent you, by type. Tap Continue for your next step.")} />
      {groups.length === 0 ? <EmptyState icon="📋" title="No plans yet" text="When your teacher sends you a plan, it will be here." action={{ href: "/student/work", label: "My Work" }} /> : (
        <div className="space-y-6" data-testid="my-plans">
          <nav aria-label={t("My Plans")} className="flex flex-wrap gap-2 print:hidden">
            {groups.map((g) => <a key={g.type} href={`#${g.type.toLowerCase()}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"><span aria-hidden="true">{g.icon}</span>{t(g.label)}<span className="rounded-full bg-slate-100 px-2 text-xs tabular-nums">{g.plans.length}</span></a>)}
          </nav>
          {groups.map((g) => (
            <section key={g.type} id={g.type.toLowerCase()} aria-labelledby={`h-${g.type}`} data-plan-type={g.type} className="scroll-mt-20">
              <h2 id={`h-${g.type}`} className="mb-3 flex items-center gap-2 text-xl font-semibold text-brand-navy"><span aria-hidden="true">{g.icon}</span>{t(g.label)}</h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {g.plans.map((p) => <li key={p.key}><PlanCard t={t} p={p} /></li>)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PreviewFrame></AppShell>
  );
}

function PlanCard({ t, p }: { t: TFn; p: StudentPlanCard }) {
  const pct = p.total ? Math.round((100 * p.done) / p.total) : 0;
  const title = p.tr ? t(p.title, p.vars) : p.title;
  return (
    <article className="flex h-full flex-col gap-3 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80" data-plan-card={p.key}>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-brand-navy"><Link prefetch={false} href={p.href} className="hover:underline"><bdi>{title}</bdi>{p.suffix ? <> · <bdi>{p.suffix}</bdi></> : null}</Link></h3>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          {p.teacher && <span>{t("From {name}", { name: p.teacher })}</span>}
          {p.date && <span>{t("Sent {date}", { date: p.date })}</span>}
          {p.dueAt && <span className="font-semibold text-amber-800">{t("Due {date}", { date: p.dueAt })}</span>}
        </p>
      </div>
      {p.total > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label={t("{done} of {total} done", { done: p.done, total: p.total })}>
            <div className="h-full rounded-full bg-brand-teal" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums text-slate-700">{t("{done} of {total} done", { done: p.done, total: p.total })}</span>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        {p.continueHref ? <Link prefetch={false} href={p.continueHref} className={`${BTN_PRIMARY} flex-1 rounded-2xl`} data-testid="plan-continue">{t("Continue")} ▶</Link>
          : <Link prefetch={false} href={p.href} className={`${BTN_SECONDARY} flex-1 rounded-2xl`}>{t("Open the plan")}</Link>}
        {p.pdfHref && <a href={p.pdfHref} className={`${BTN_SECONDARY} rounded-2xl`} data-testid="plan-pdf">⬇ {t("Download PDF")}</a>}
      </div>
    </article>
  );
}
