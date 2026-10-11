import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { coachHome, coachSession, drillFor, PRACTICE_KINDS, type PracticeKind } from "@/server/fluency/coach";
import { SEASON_NAME } from "@/server/fluency/norms";
import { FluencyCoachIcon } from "@/components/fluency/coach-icon";
import { CoachReader } from "@/components/fluency/coach-reader";
import { EchoReader } from "@/components/fluency/echo-reader";
import { DrillReader } from "@/components/fluency/drill-reader";
import { ProsodyBars, TrialChart, WcpmChart } from "@/components/fluency/charts";
import { aiEnv } from "@/server/ai/env";

export const metadata = { title: "Fluency Coach" };
const TONE = { BELOW: "bg-rose-100 text-rose-900", ON: "bg-sky-100 text-sky-900", ABOVE: "bg-emerald-100 text-emerald-900" } as const;
const NAME = { BELOW: "Below", ON: "On", ABOVE: "Above" } as const;
const KIND_NAME: Record<PracticeKind, string> = { MINUTE: "⏱ 1 minute", PASSAGE: "📖 Whole", ECHO: "🦜 Echo", PHRASED: "🎼 Phrased", DRILL: "⚡ Drill", REPEATED: "🔁 Repeated" };

/** 🎙 Fluency Coach hub: the 1-minute check, practice modes, progress on the norms, prosody, goal and tips. */
export default async function FluencyCoachPage({ searchParams }: { searchParams: Promise<{ key?: string; mode?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const home = await coachHome(repo, actor, aiEnv());
  const kind: PracticeKind | null = PRACTICE_KINDS.includes(sp.mode as PracticeKind) ? (sp.mode as PracticeKind) : sp.key ? "MINUTE" : null;
  const link = (key: string | null, m: PracticeKind) => `/student/fluency-coach?${key ? `key=${encodeURIComponent(key)}&` : ""}mode=${m}`;
  const live = home.enabled && home.ready;
  const key = sp.key ? String(sp.key) : home.recommended;
  const session = live && kind && kind !== "DRILL" && key ? await coachSession(repo, actor, key, kind).catch(() => null) : null;
  const drill = live && kind === "DRILL" ? await drillFor(repo, actor) : null;
  const rec = home.passages.find((p) => p.key === home.recommended);
  const reading = Boolean(session || drill);
  const g = home.goal;

  return (
    <AppShell name={String(me.displayName)}>
      <header className="mb-6 flex flex-wrap items-center gap-4 rounded-3xl bg-gradient-to-r from-teal-50 via-white to-indigo-50 p-5 ring-1 ring-slate-200">
        <FluencyCoachIcon size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-extrabold text-brand-navy">Fluency Coach</h1>
          <p className="text-slate-600">Read aloud, record your voice, and the coach shows the words to fix, how smoothly you read, and your plan for the week.</p>
        </div>
        {reading && <Link href="/student/fluency-coach" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">← Fluency Coach</Link>}
      </header>

      {!home.enabled ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">The Fluency Coach is switched off by your school.</p>
        : !home.ready ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">The Fluency Coach is not ready yet: your school needs to connect its AI key. Ask your teacher.</p>
        : drill ? <DrillReader grid={drill} />
        : session && !session.offered ? (
          <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-slate-200">
            <p className="text-lg font-semibold text-brand-navy">🚀 {session.reason}</p>
            {session.trials.length > 0 && <TrialChart trials={session.trials} nextGoal={null} />}
            <div className="flex flex-wrap gap-2"><Link href="/student/fluency-coach" className="rounded-xl bg-brand-navy px-4 py-2 font-bold text-white">Choose a passage</Link><Link href="/student/readmaster" className="rounded-xl px-4 py-2 font-bold text-brand-navy ring-1 ring-slate-300">ReadMaster articles</Link></div>
          </section>
        )
        : session && kind === "ECHO" ? <EchoReader passageKey={session.key} title={session.title} sentences={session.sentences!.map((x) => ({ text: x.text }))} />
        : session ? <CoachReader passageKey={session.key} title={session.title} words={session.words} kind={kind === "ECHO" || kind === "DRILL" || !kind ? "MINUTE" : kind} grade={home.grade} marks={session.marks} trial={session.trial} trials={session.trials} goal={session.goal} />
        : (
          <div className="space-y-6">
            {/* my fluency · my goal · how I sound */}
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="font-bold text-brand-navy">My fluency</h2>
                {home.norm ? (
                  <>
                    <p className="mt-2"><span className="text-5xl font-extrabold tabular-nums text-brand-navy">{home.norm.wcpm}</span> <span className="text-sm text-slate-500">words correct per minute</span></p>
                    {home.officialLevel && <p className="mt-1"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONE[home.officialLevel]}`}>{NAME[home.officialLevel]} Level</span> <span className="text-xs text-slate-500">{home.norm.text}</span></p>}
                    <p className="mt-2 text-sm text-slate-700">{home.norm.kid}</p>
                  </>
                ) : <p className="mt-2 text-slate-600">No 1-minute check yet. Start with one!</p>}
                <p className="mt-2 text-xs text-slate-500">{home.rubric} ({SEASON_NAME[home.season]})</p>
              </section>
              <section className="rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
                <h2 className="font-bold text-amber-950">🎯 My goal</h2>
                {g && home.norm ? (g.reached
                  ? <p className="mt-2 text-sm text-amber-950">You already reach the middle of Grade {home.grade} readers for the {SEASON_NAME[g.season]} (<b>{g.target}</b>). Keep reading new, harder passages — aim for <b>{g.nextGoal}</b> next time.</p>
                  : <>
                      <p className="mt-2"><span className="text-4xl font-extrabold tabular-nums text-amber-950">{g.nextGoal}</span> <span className="text-sm text-amber-900">words correct per minute next week</span></p>
                      <p className="mt-1 text-sm text-amber-950">Grow about <b>{g.perWeek}</b> words each week to reach <b>{g.target}</b> by the {SEASON_NAME[g.season]} — <b>{g.weeks} weeks</b> left.</p>
                    </>)
                  : <p className="mt-2 text-sm text-amber-950">Your goal appears after your first 1-minute check.</p>}
              </section>
              <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="mb-2 font-bold text-brand-navy">🎭 How I sound</h2>
                {home.prosody ? <><ProsodyBars scores={{ phrasing: home.prosody.phrasing, smoothness: home.prosody.smoothness, pace: home.prosody.pace, intonation: home.prosody.intonation }} /><p className="mt-2 text-xs text-slate-500">From your reading on {home.prosody.date}. 4 is the top.</p></> : <p className="text-sm text-slate-600">Read a passage and the coach shows your phrasing, smoothness, pace and expression.</p>}
              </section>
            </div>

            {home.fastNotUnderstanding && <p className="rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-950 ring-1 ring-violet-200">🧠 You read fast — great! But your last questions were hard. Slow down a little and think about what you read: try <b>phrased reading</b> and answer the questions after each reading.</p>}

            {/* the ways to practise */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-brand-navy">Choose how to practise{rec ? <span className="text-sm font-normal text-slate-500"> · passage for you: <b>{rec.title}</b></span> : null}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Mode href={link(home.recommended, "MINUTE")} tone="from-brand-navy to-indigo-700" title="⏱ 1-minute check" text="Your official words correct per minute. Do two today with different passages and the coach uses the average." />
                <Mode href={link(home.recommended, "PASSAGE")} tone="from-teal-500 to-emerald-500" title="📖 Whole passage" text="Read it all and get feedback on every word, then answer quick questions." />
                <Mode href={link(home.recommended, "ECHO")} tone="from-sky-500 to-cyan-500" title="🦜 Echo reading" text="Listen to one sentence, then say it the same way. The coach compares your phrasing and voice." />
                <Mode href={link(home.recommended, "PHRASED")} tone="from-violet-500 to-fuchsia-500" title="🎼 Phrased reading" text="Read in word groups with / and // marks. The marks fade as you get better." />
                <Mode href={link(null, "DRILL")} tone="from-amber-400 to-orange-500" title="⚡ 1-minute word drill" text="Rows of words with your sound patterns. Beat your score!" />
                {home.repeatedOffered
                  ? <Mode href={link(home.recommended, "REPEATED")} tone="from-rose-500 to-pink-500" title="🔁 Repeated reading" text="Read the same passage up to 5 times, with a new goal each time." />
                  : <Mode href={home.passages.find((p) => p.level === "ABOVE")?.key ? link(home.passages.find((p) => p.level === "ABOVE")!.key, "PASSAGE") : "/student/readmaster"} tone="from-emerald-500 to-lime-500" title="🚀 Wider reading" text="You read above level! Read new, harder passages and articles." />}
              </div>
            </section>

            {home.progress.length > 0 && (
              <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="mb-2 font-bold text-brand-navy">📈 My progress</h2>
                <WcpmChart title="My 1-minute checks and the 50th percentile" points={home.progress.map((p) => ({ label: p.date.slice(5), wcpm: p.wcpm, p50: p.p50 }))} />
              </section>
            )}

            <div className="grid items-start gap-4 lg:grid-cols-3">
              <section className="rounded-3xl bg-emerald-50 p-5 ring-1 ring-emerald-200 lg:col-span-2">
                <h2 className="font-bold text-emerald-900">🗓 My plan</h2>
                {home.plan ? (
                  <>
                    <p className="text-sm text-emerald-900">Next check <b>{home.plan.nextCheck}</b> · read {home.plan.perWeek}× this week</p>
                    <ol className="mt-2 space-y-1.5 text-sm">{home.plan.steps.map((st, i) => <li key={i} className="flex items-start gap-2 rounded-xl bg-white px-3 py-2"><span aria-hidden="true">{st.icon}</span><span className="flex-1">{st.text}</span>{st.href && <Link href={st.href} className="shrink-0 font-bold text-emerald-700 hover:underline">Go →</Link>}</li>)}</ol>
                  </>
                ) : <p className="mt-1 text-sm text-emerald-900">Your plan appears after your first reading.</p>}
              </section>
              <section className="rounded-3xl bg-sky-50 p-5 ring-1 ring-sky-200">
                <h2 className="font-bold text-sky-900">💡 Tips for me</h2>
                {home.tips.length ? (
                  <ul className="mt-2 space-y-2 text-sm">{home.tips.map((t) => <li key={t.code} className="rounded-xl bg-white px-3 py-2"><b>{t.title}</b> <span className="text-xs text-slate-500">({t.words.slice(0, 3).join(", ")})</span><span className="block text-slate-700">{t.tip}</span></li>)}</ul>
                ) : <p className="mt-2 text-sm text-sky-900">Pause at full stops, read in word groups, and let your voice show the meaning. Tips for your own words appear after a reading.</p>}
                <p className="mt-2 text-xs text-sky-800">Your accent is fine — only wrong words count.</p>
              </section>
            </div>

            <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="mb-2 font-bold text-brand-navy">Choose a passage</h2>
              {!home.passages.length ? <p className="text-slate-600">No passage for your grade yet. Ask your teacher.</p> : (
                <ul className="divide-y divide-slate-100">
                  {home.passages.slice(0, 40).map((p) => (
                    <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0"><b className="text-slate-900">{p.title}</b> {p.key === home.recommended && <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">⭐ For you</span>}<span className="block text-xs text-slate-500">Grade {p.grade} · {p.words} words{p.lexile ? ` · ${p.lexile}L` : ""}</span></span>
                      <span className="flex flex-wrap gap-1.5">
                        <Link href={link(p.key, "MINUTE")} className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-purple">⏱ 1 minute</Link>
                        {(["PASSAGE", "ECHO", "PHRASED", ...(home.repeatedOffered ? ["REPEATED"] : [])] as PracticeKind[]).map((m) => <Link key={m} href={link(p.key, m)} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{KIND_NAME[m]}</Link>)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {home.history.length > 0 && (
              <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="mb-2 font-bold text-brand-navy">My readings</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-1.5">Date</th><th>Passage</th><th>Way</th><th className="text-center">WCPM</th><th className="text-center">Accuracy</th><th className="text-center">Questions</th><th>Level</th></tr></thead>
                    <tbody>{home.history.map((h) => <tr key={h.id} className="border-b border-slate-100"><td className="py-1.5 tabular-nums">{h.date}</td><td>{h.title}</td><td>{KIND_NAME[h.kind]}</td><td className="text-center font-bold tabular-nums">{h.wcpm}</td><td className="text-center tabular-nums">{h.accuracy}%</td><td className="text-center tabular-nums">{h.comprehension === null ? "—" : `${h.comprehension}%`}</td><td>{h.level ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONE[h.level]}`}>{NAME[h.level]}</span> : <span className="text-xs text-slate-400">practice</span>}</td></tr>)}</tbody></table>
                </div>
              </section>
            )}
            <p className="text-center text-xs text-slate-500">🔒 Your recording is only used to check your reading and is deleted right after. Your name is never sent.</p>
          </div>
        )}
    </AppShell>
  );
}

function Mode({ href, tone, title, text }: { href: string; tone: string; title: string; text: string }) {
  return (
    <Link href={href} className={`lift block rounded-3xl bg-gradient-to-br ${tone} p-5 text-white shadow-md`}>
      <p className="text-xl font-extrabold">{title}</p>
      <p className="mt-1 text-sm text-white/90">{text}</p>
    </Link>
  );
}
