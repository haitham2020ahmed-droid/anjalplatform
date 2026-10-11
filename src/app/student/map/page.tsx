import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { myMap, type MyMap } from "@/server/map/map-more";
import { studentMapCards } from "@/server/student/map-dashboard";
import { programWork } from "@/server/student/program-work";
import { Callout, ReportHeader } from "@/components/report-kit";
import { MapDashboard } from "@/components/student/map-dashboard";
import { ProgramWorkList } from "@/components/student/program-work-list";
import { BTN_SECONDARY } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "My MAP" };

/**
 * 🗺️ My MAP — a dashboard, no questions on it: a Reading card and a Language Usage card (latest RIT, goal areas with
 * bars, my goal and the points still needed, strengths and things to grow — numbers and friendly words only), then
 * "Your MAP practice" (the MAP rows of My Work, programWork) and my MAP plan from my teacher (PDF).
 */
export default async function StudentMapPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sid = actor.studentId!;
  const [{ t }, m, work] = await Promise.all([
    getT(), myMap(repo, actor).catch((): MyMap => ({ subjects: [], plans: [] })), programWork(repo, sid, "MAP"),
  ]);
  const cards = studentMapCards(m);
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/student", label: "My Work" }} icon="🗺️" title="My MAP" subtitle={t("Your MAP scores, your goal and your MAP practice.")} who={String(me.displayName)}>
        <Link prefetch={false} href={`/map-report/study-plan/${sid}`} className={BTN_SECONDARY}>📑 {t("My Study Plan")}</Link>
      </ReportHeader>

      <MapDashboard cards={cards} />

      <Callout kind="meaning" className="mt-4" items={[
        t("RIT is my MAP score. It grows as I learn — like a height chart for reading."),
        t("My goal is the score my teacher hopes I reach by Spring."),
      ]} />

      <ProgramWorkList id="map-practice" items={work} title="Your MAP practice" program="MAP" />

      {m.plans.length > 0 && (
        <section aria-labelledby="map-plan-h" className="mt-6 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
          <h2 id="map-plan-h" className="text-xl font-semibold text-brand-navy">📋 {t("My MAP plan from my teacher")}</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {m.plans.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-green-50/60 p-4 ring-1 ring-green-100">
                <span className="min-w-0"><span className="block font-semibold text-brand-navy">{t(d.subject === "READING" ? "Reading" : "Language Usage")} · {d.term}</span>
                  <span className="block text-sm text-slate-600">{d.items.map((it) => it.name).join(" · ")}</span>
                  {d.note && <span className="block text-sm text-amber-900">💬 {d.note}</span>}</span>
                <Link prefetch={false} href={`/map-plan/${d.id}?print=1`} className={BTN_SECONDARY}>⬇ {t("Download (PDF)")}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
