import Link from "next/link";
import { planProgress, type PlanDoc } from "@/server/map/map-more";
import { BTN_SECONDARY } from "@/components/ui-kit";

/**
 * 🆕 Nov 2026: "📋 My MAP plan from my teacher" — one card per subject (Reading / Language Usage), each with its
 * own Start/Continue button (planProgress().next) and a Download (PDF) link. Pulled out of the My MAP page
 * (src/app/student/map/page.tsx) so the exact same section can also be shown inside the "MAP" tab of My Work
 * (src/app/student/work/page.tsx) — same data (myMap().plans), same look, one place to keep it correct.
 * Renders nothing when there is no plan yet (a student with no MAP plan sent to them).
 */
export function MapPlanSection({ plans, t }: { plans: PlanDoc[]; t: (s: string, vars?: Record<string, string | number>) => string }) {
  if (!plans.length) return null;
  return (
    <section aria-labelledby="map-plan-h" className="mt-6 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
      <h2 id="map-plan-h" className="text-xl font-semibold text-brand-navy">📋 {t("My MAP plan from my teacher")}</h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {plans.map((d) => {
          const prog = planProgress(d);
          return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-green-50/60 p-4 ring-1 ring-green-100">
              <span className="min-w-0"><span className="block font-semibold text-brand-navy">{t(d.subject === "READING" ? "Reading" : "Language Usage")} · {d.term}</span>
                <span className="block text-sm text-slate-600">{d.items.map((it) => it.name).join(" · ")}</span>
                {prog.total > 0 && <span className="mt-1 block text-sm font-semibold text-emerald-800">{prog.allDone ? `✅ ${t("All done")}` : t("{done} of {total} done", { done: prog.done, total: prog.total })}</span>}
                {d.note && <span className="block text-sm text-amber-900">💬 {d.note}</span>}</span>
              <span className="flex flex-wrap items-center gap-2">
                {prog.next && (
                  <Link prefetch={false} href={prog.next.href} className="inline-flex min-h-11 items-center rounded-xl bg-brand-teal px-4 font-semibold text-white">{prog.done > 0 ? `▶ ${t("Continue")}` : `▶ ${t("Start")}`}</Link>
                )}
                <Link prefetch={false} href={`/map-plan/${d.id}?print=1`} className={BTN_SECONDARY}>⬇ {t("Download (PDF)")}</Link>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
