import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { safeIfBehind } from "@/server/db/schema-errors";
import { myTests, type MyTests } from "@/server/map/sim";

export const metadata = { title: "MAP Test" };

/** 🧭 My MAP Tests: the tests my teacher opened for me, a warm-up, my results (my RIT — never a level word). */
export default async function MapTestHome() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, tests] = await Promise.all([getT(), safeIfBehind("student.map-test", myTests(repo, actor), { windows: [], warmupDone: false } as MyTests)]);
  const btn = "rounded-xl px-5 py-2.5 font-semibold";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/map", label: "My MAP" }} icon="🧭" title="MAP Test" subtitle="Just like MAP Growth: the questions adapt to you, one at a time. No time limit, and you can pause and come back. Do your best!" />
      <section className="mb-6 rounded-3xl bg-gradient-to-br bg-linear-to-br from-sky-50 to-white p-5 ring-1 ring-sky-200">
        <h2 className="text-lg font-bold text-brand-navy">🧪 {t("Warm-up")} {tests.warmupDone && <span className="text-sm font-normal text-emerald-700">· {t("done")} ✓</span>}</h2>
        <p className="text-slate-700">{t("5 questions to see how the test screen works. It does not count.")}</p>
        <div className="mt-3 flex gap-2"><Link href="/student/map-test/run?warmup=1&subject=READING" className={`${btn} bg-sky-700 text-white`}>📖 {t("Reading warm-up")}</Link><Link href="/student/map-test/run?warmup=1&subject=LANGUAGE" className={`${btn} bg-white text-sky-800 ring-1 ring-sky-300`}>✏️ {t("Language warm-up")}</Link></div>
      </section>
      {!tests.windows.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("No MAP Test is open now. Your teacher will tell you when it opens.")}</p> : tests.windows.map((w) => (
        <section key={w.id} className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-brand-navy"><bdi>{w.title}</bdi></h2>
          <p className="text-sm text-slate-500">{w.open ? t("Open until {date}", { date: w.closesAt.slice(0, 10) }) : t("Closed")} · {t("{n} questions", { n: w.items })}</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">{w.sessions.map((x) => (
            <li key={x.subject} className="rounded-2xl bg-slate-50 p-4">
              <p className="font-bold text-brand-navy">{x.subject === "READING" ? `📖 ${t("Reading")}` : `✏️ ${t("Language Usage")}`}</p>
              {x.status === "DONE" ? <p className="mt-1 text-slate-700">✅ {t("Finished · my RIT about")} <b className="text-2xl text-brand-navy">{x.resultRit}</b> <span className="text-sm" dir="ltr">({x.resultLow}–{x.resultHigh})</span>{x.practise.length > 0 && <span className="mt-1 block text-sm">🎯 {t("Goal areas to practise")}: {x.practise.map((a) => t(a)).join(" · ")}</span>}</p>
                : w.open ? <Link href={`/student/map-test/run?windowId=${w.id}&subject=${x.subject}`} className={`${btn} mt-2 inline-block bg-brand-navy text-white`}>{x.status === "IN_PROGRESS" ? `${t("Continue")} (${x.answered}/${x.total}) ▶` : `${t("Start")} ▶`}</Link>
                : <p className="mt-1 text-slate-500">{t("Not taken.")}</p>}
            </li>
          ))}</ul>
        </section>
      ))}
    </AppShell>
  );
}
