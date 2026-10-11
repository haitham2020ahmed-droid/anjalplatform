import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { myStrategySurvey, PHASE_LABEL, PHASES, STRATEGY_ITEMS, STRATEGY_LABEL } from "@/server/surveys/strategy";
import { submitStrategySurveyAction } from "./actions";

export const metadata = { title: "Reading Strategy Survey" };

/** 🧭 The Reading Strategy Survey: 18 short situations — pick what a good reader would do. Once per term, no marks. */
export default async function StrategySurveyPage({ searchParams }: { searchParams: Promise<{ msg?: string; done?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const mine = await myStrategySurvey(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <header className="mb-6 rounded-3xl bg-white p-6 ring-1 ring-slate-200">
        <p className="text-4xl" aria-hidden="true">🧭</p>
        <h1 className="mt-1 text-2xl font-bold text-brand-navy">Reading Strategy Survey</h1>
        <p className="mt-1 text-slate-700">What do good readers do before, during and after reading? Read each question and choose the best answer. There are no marks — this helps your teacher plan reading groups.</p>
        <p className="mt-1 text-sm text-slate-500">{mine.term}{mine.openedByTeacher ? " · Your teacher asked your class to take it." : ""}</p>
      </header>
      {sp.msg && <p role="alert" className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{sp.msg}</p>}
      {mine.taken ? (
        <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-brand-navy">{sp.done ? "Thank you! 🎉" : "You took the survey this term ✅"}</h2>
          <p className="mt-1 text-slate-700">Taken on {mine.taken.date}. You can take it again next term.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {PHASES.map((p) => <li key={p} className="rounded-2xl bg-slate-50 p-4 text-center ring-1 ring-slate-200"><p className="text-sm font-semibold text-slate-600">{PHASE_LABEL[p]}</p><p className="text-3xl font-bold tabular-nums text-brand-navy">{mine.taken![p]}%</p></li>)}
          </ul>
          {mine.taken.weakStrategies.length > 0 && <p className="mt-4 text-slate-700">Strategies to practise: <strong>{mine.taken.weakStrategies.map((k) => STRATEGY_LABEL[k]).join(", ")}</strong>.</p>}
          <Link href="/student" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My Work</Link>
        </section>
      ) : (
        <form action={submitStrategySurveyAction} className="space-y-6">
          {PHASES.map((p) => (
            <fieldset key={p} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <legend className="px-2 text-lg font-bold text-brand-navy">{PHASE_LABEL[p]}</legend>
              <ol className="space-y-5">
                {STRATEGY_ITEMS.filter((it) => it.phase === p).map((it) => (
                  <li key={it.id}>
                    <p className="font-semibold text-slate-800">{STRATEGY_ITEMS.indexOf(it) + 1}. {it.prompt}</p>
                    <div role="radiogroup" className="mt-2 grid gap-2">
                      {it.choices.map((c, i) => (
                        <label key={i} className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 ring-1 ring-slate-200 has-[:checked]:bg-teal-50 has-[:checked]:ring-brand-teal">
                          <input type="radio" name={it.id} value={i} required className="mt-1" />
                          <span>{c}</span>
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </fieldset>
          ))}
          <button className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700">Send my answers</button>
        </form>
      )}
    </AppShell>
  );
}
