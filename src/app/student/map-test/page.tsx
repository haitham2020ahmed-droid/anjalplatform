import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { myTests } from "@/server/map/sim";

export const metadata = { title: "MAP practice test" };

/** 🗺️ The MAP practice test: open tests, a warm-up, my results. */
export default async function MapTestHome() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const t = await myTests(repo, actor);
  const btn = "rounded-xl px-5 py-2.5 font-semibold";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/map", label: "My MAP" }} icon="🧭" title="MAP practice test" subtitle="Just like MAP Growth: the questions adapt to you, one at a time. No time limit, and you can pause and come back. Do your best!" />
      <section className="mb-6 rounded-3xl bg-gradient-to-br bg-linear-to-br from-sky-50 to-white p-5 ring-1 ring-sky-200">
        <h2 className="text-lg font-bold text-brand-navy">🧪 Warm-up {t.warmupDone && <span className="text-sm font-normal text-emerald-700">· done ✓</span>}</h2>
        <p className="text-slate-700">5 questions to see how the test screen works. It does not count.</p>
        <div className="mt-3 flex gap-2"><Link href="/student/map-test/run?warmup=1&subject=READING" className={`${btn} bg-sky-700 text-white`}>📖 Reading warm-up</Link><Link href="/student/map-test/run?warmup=1&subject=LANGUAGE" className={`${btn} bg-white text-sky-800 ring-1 ring-sky-300`}>✏️ Language warm-up</Link></div>
      </section>
      {!t.windows.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No practice test is open now. Your teacher will tell you when it opens.</p> : t.windows.map((w) => (
        <section key={w.id} className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-brand-navy">{w.title}</h2>
          <p className="text-sm text-slate-500">{w.open ? `Open until ${w.closesAt.slice(0, 10)}` : "Closed"} · {w.items} questions per subject</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">{w.sessions.map((x) => (
            <li key={x.subject} className="rounded-2xl bg-slate-50 p-4">
              <p className="font-bold text-brand-navy">{x.subject === "READING" ? "📖 Reading" : "✏️ Language Usage"}</p>
              {x.status === "DONE" ? <p className="mt-1 text-slate-700">✅ Finished · my practice score about <b className="text-2xl text-brand-navy">{x.resultRit}</b> <span className="text-sm">({x.resultLow}–{x.resultHigh})</span></p>
                : w.open ? <Link href={`/student/map-test/run?windowId=${w.id}&subject=${x.subject}`} className={`${btn} mt-2 inline-block bg-brand-navy text-white`}>{x.status === "IN_PROGRESS" ? `Continue (${x.answered}/${x.total}) ▶` : "Start ▶"}</Link>
                : <p className="mt-1 text-slate-500">Not taken.</p>}
            </li>
          ))}</ul>
        </section>
      ))}
    </AppShell>
  );
}
