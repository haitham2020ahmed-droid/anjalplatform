import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { PreviewFrame } from "@/components/student/preview-frame";
import { myMap, type MyMap } from "@/server/map/map-more";
import { studentMapCards } from "@/server/student/map-dashboard";
import { programWork } from "@/server/student/program-work";
import { Callout, ReportHeader } from "@/components/report-kit";
import { MapDashboard } from "@/components/student/map-dashboard";
import { ProgramWorkList } from "@/components/student/program-work-list";
import { BTN_SECONDARY } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { safeIfBehind } from "@/server/db/schema-errors";
import { myTests, type MyTests } from "@/server/map/sim";

export const metadata = { title: "My MAP" };

/**
 * 🗺️ My MAP — a dashboard, no questions on it: a Reading card and a Language Usage card (latest RIT, goal areas with
 * bars, my goal and the points still needed, strengths and things to grow — numbers and friendly words only), then
 * "Your MAP practice" (the MAP rows of My Work, programWork) and my MAP plan from my teacher (PDF).
 */
export default async function StudentMapPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  const sid = actor.studentId!;
  const [{ t }, m, work, tests] = await Promise.all([
    getT(), myMap(repo, actor).catch((): MyMap => ({ subjects: [], plans: [] })), programWork(repo, sid, "MAP"),
    safeIfBehind("student.map.tests", myTests(repo, actor), { windows: [], warmupDone: false } as MyTests),
  ]);
  // 🧭 the MAP Test card: a test open for me (Start / Continue), or my latest result (my RIT)
  const openTests = tests.windows.filter((w) => w.open).flatMap((w) => w.sessions.filter((x) => x.status !== "DONE").map((x) => ({ w, x })));
  const results = tests.windows.flatMap((w) => w.sessions.filter((x) => x.status === "DONE").map((x) => ({ w, x }))).slice(0, 2);
  const cards = studentMapCards(m);
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <ReportHeader back={{ href: "/student", label: "My Work" }} icon="🗺️" title="My MAP" subtitle={t("Your MAP scores, your goal and your MAP practice.")} who={String(me.displayName)}>
        <Link prefetch={false} href={`/map-report/study-plan/${sid}`} className={BTN_SECONDARY}>📑 {t("My Study Plan")}</Link>
      </ReportHeader>

      {(openTests.length > 0 || results.length > 0) && (
        <section aria-labelledby="map-test-h" data-testid="map-test-card" className="mb-5 rounded-3xl bg-gradient-to-r bg-linear-to-r from-sky-50 to-white p-5 ring-1 ring-sky-200">
          <h2 id="map-test-h" className="text-xl font-semibold text-brand-navy">🧭 {t("MAP Test")}</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {openTests.map(({ w, x }) => (
              <li key={`${w.id}${x.subject}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <span className="min-w-0"><span className="block font-semibold text-brand-navy"><bdi>{w.title}</bdi> · {t(x.subject === "LANGUAGE" ? "Language Usage" : "Reading")}</span><span className="block text-sm text-slate-600">{t("Open until {date}", { date: w.closesAt.slice(0, 10) })}</span></span>
                <Link prefetch={false} href={`/student/map-test/run?windowId=${w.id}&subject=${x.subject}`} className={BTN_SECONDARY}>{x.status === "IN_PROGRESS" ? `${t("Continue")} (${x.answered}/${x.total})` : t("Start")} ▶</Link>
              </li>
            ))}
            {results.map(({ w, x }) => (
              <li key={`r${w.id}${x.subject}`} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <span className="block font-semibold text-brand-navy"><bdi>{w.title}</bdi> · {t(x.subject === "LANGUAGE" ? "Language Usage" : "Reading")}</span>
                <span className="block text-slate-700">{t("My RIT (about)")}: <b className="text-2xl text-brand-navy">{x.resultRit}</b> <span className="text-sm" dir="ltr">({x.resultLow}–{x.resultHigh})</span></span>
                {x.practise.length > 0 && <span className="block text-sm text-slate-600">🎯 {t("Goal areas to practise")}: {x.practise.map((a) => t(a)).join(" · ")}</span>}
              </li>
            ))}
          </ul>
          <Link prefetch={false} href="/student/map-test" className="mt-3 inline-block text-sm font-semibold text-brand-teal underline">{t("All my MAP Tests")}</Link>
        </section>
      )}

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
    </PreviewFrame></AppShell>
  );
}
