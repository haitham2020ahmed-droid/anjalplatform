"use client";
import Link from "next/link";
import { useState } from "react";
import type { CoachResult } from "@/server/fluency/coach";
import type { PhraseMark } from "@/server/fluency/phrasing";
import { say, useCoachRecorder } from "./recorder";
import { ProsodyBars, TrialChart } from "./charts";
import { ComprehensionCheck } from "./comprehension-check";
import { WordLookup } from "../learn/word-lookup";

type Kind = "MINUTE" | "PASSAGE" | "PHRASED" | "REPEATED";
const LIMIT: Record<Kind, number> = { MINUTE: 60, PASSAGE: 240, PHRASED: 240, REPEATED: 240 };
const KIND_LABEL: Record<Kind, string> = { MINUTE: "⏱ 1-minute check", PASSAGE: "📖 Whole passage", PHRASED: "🎼 Phrased reading", REPEATED: "🔁 Repeated reading" };
const LEVEL_TONE = { BELOW: "bg-rose-500", ON: "bg-sky-600", ABOVE: "bg-emerald-600" } as const;
const LEVEL_NAME = { BELOW: "Below Level", ON: "On Level", ABOVE: "Above Level" } as const;
const MARK: Record<string, string> = { MISPRONOUNCED: "bg-rose-100 text-rose-900 underline decoration-rose-500 decoration-2", SUBSTITUTED: "bg-amber-100 text-amber-900 underline decoration-amber-500 decoration-2", SKIPPED: "bg-slate-200 text-slate-500 line-through", HESITATION: "bg-violet-100 text-violet-900 underline decoration-dotted decoration-violet-500 decoration-2", NOT_READ: "text-slate-400", OK: "" };
const HINT: Record<Kind, string> = {
  MINUTE: "Press Start and read aloud from the beginning. The recording stops by itself after one minute.",
  PASSAGE: "Press Start and read the whole passage aloud. Press Stop when you finish.",
  PHRASED: "Read the word groups together. Take a short breath at / and a longer pause at //. Press Stop when you finish.",
  REPEATED: "Read the same passage again — a little smoother and faster than last time. Press Stop when you finish.",
};

/** The passage with phrase marks: / short pause, // long pause. */
function PhrasedText({ words, marks }: { words: string[]; marks: PhraseMark[] }) {
  return (
    <p data-wordtap className="max-w-3xl text-xl leading-loose text-slate-900 md:text-2xl md:leading-[2.8rem]">
      {words.map((w, i) => (
        <span key={i}>{w}{marks[i] === "/" && <span className="mx-1 font-black text-teal-500" aria-label="short pause"> /</span>}{marks[i] === "//" && <span className="mx-1 font-black text-indigo-500" aria-label="long pause"> //</span>} </span>
      ))}
    </p>
  );
}

export function CoachReader({ passageKey, title, words, mode, kind, grade, marks, trial, trials, goal }: { passageKey: string; title: string; words: string[]; mode?: "MINUTE" | "PASSAGE"; kind?: Kind; grade: number; marks?: PhraseMark[] | null; trial?: number | null; trials?: { trial: number; wcpm: number; goal: number | null }[]; goal?: number | null }) {
  const k: Kind = kind ?? mode ?? "MINUTE";
  const [result, setResult] = useState<CoachResult | null>(null);
  const r = useCoachRecorder({ limit: LIMIT[k], fields: () => ({ key: passageKey, mode: k === "MINUTE" ? "MINUTE" : "PASSAGE", kind: k }), onResult: setResult });
  const left = LIMIT[k] - r.secs;
  return (
    <div className="space-y-5">
      {r.stage !== "done" && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-brand-navy">{title}</h2>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-900">{KIND_LABEL[k]}{trial ? ` · reading ${trial}${k === "REPEATED" ? " of 5" : ""}` : ""} · Grade {grade}</span>
          </div>
          {goal ? <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">🎯 Stretch goal for this reading: <b>{goal}</b> words correct per minute{trials?.length ? ` (last time: ${trials[trials.length - 1].wcpm})` : ""}.</p> : null}
          {k === "PHRASED" && trial && <p className="mb-3 text-sm text-slate-600">{trial === 1 ? "All the phrase marks are shown." : trial === 2 ? "Now only the long pauses (//) are shown — find the short pauses yourself." : "No marks now — read in phrases on your own!"}</p>}
          <WordLookup>{marks && marks.some(Boolean) ? <PhrasedText words={words} marks={marks} /> : <p data-wordtap className="max-w-3xl text-xl leading-loose text-slate-900 md:text-2xl md:leading-[2.6rem]">{words.join(" ")}</p>}</WordLookup>
        </section>
      )}

      {r.stage !== "done" && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-brand-navy p-4 text-white shadow-lg">
          {r.stage === "ready" && <><p className="text-sm">{HINT[k]}</p><button onClick={r.start} className="rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 px-8 py-3 text-lg font-extrabold text-brand-navy shadow">🎙 Start reading</button></>}
          {r.stage === "recording" && <><p className="flex items-center gap-3 text-lg font-bold"><span className="h-3 w-3 animate-pulse rounded-full bg-rose-400" aria-hidden="true" />Recording · <span className="tabular-nums">{k === "MINUTE" ? `${left}s left` : `${Math.floor(r.secs / 60)}:${String(r.secs % 60).padStart(2, "0")}`}</span></p><button onClick={r.stop} className="rounded-2xl bg-white px-8 py-3 text-lg font-extrabold text-brand-navy">■ Stop</button></>}
          {r.stage === "sending" && <p className="text-lg font-semibold">🎧 The coach is listening to your reading…</p>}
          {r.stage === "waiting" && <p className="text-lg font-semibold">⏳ Many students are reading right now. Your result comes in about {r.wait}s — keep this page open. <span className="block text-sm font-normal text-white/80">{r.msg}</span></p>}
          {r.stage === "error" && <><p className="text-base font-semibold">⚠️ {r.msg}</p><button onClick={r.reset} className="rounded-2xl bg-white px-6 py-2.5 font-bold text-brand-navy">Try again</button></>}
        </div>
      )}

      {r.stage === "done" && result && <CoachResultView r={result} again={() => { if (k === "REPEATED" || k === "PHRASED") { window.location.reload(); return; } setResult(null); r.reset(); }} />}
    </div>
  );
}

export function CoachResultView({ r, again }: { r: CoachResult; again: () => void }) {
  const errors = r.words.filter((w) => w.mark !== "OK" && w.mark !== "NOT_READ");
  const kind = r.kind ?? r.mode;
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-navy to-indigo-700 p-6 text-white shadow-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">{r.official ? "1-minute check · your fluency level" : `${KIND_LABEL[kind as Kind] ?? "Practice"} · practice`}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase text-white/70">Words correct per minute</p><p className="text-5xl font-extrabold tabular-nums">{r.wcpm}</p>{r.norm?.percentile !== null && r.norm?.percentile !== undefined && <p className="mt-1 text-xs text-white/80">{r.norm.text}</p>}</div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase text-white/70">{r.official ? "Level" : "About"}</p><p className="mt-2"><span className={`rounded-full px-3 py-1 text-lg font-bold ${LEVEL_TONE[r.level]}`}>{LEVEL_NAME[r.level]}</span></p><p className="mt-2 text-xs text-white/70">{r.rubric}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase text-white/70">Accuracy</p><p className="text-4xl font-extrabold tabular-nums">{r.accuracy}%</p><p className="text-xs text-white/70">{r.wordsCorrect} of {r.wordsRead} words · {r.seconds}s{r.hesitations ? ` · ${r.hesitations} long stop${r.hesitations > 1 ? "s" : ""}` : ""}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase text-white/70">Expression</p><p className="text-4xl font-extrabold tabular-nums">{r.expression ?? "—"}<span className="text-lg text-white/60">/4</span></p><p className="text-xs text-white/70">{r.expression === 4 ? "Smooth and expressive" : r.expression === 3 ? "Good phrasing" : r.expression === 2 ? "Two words at a time" : r.expression === 1 ? "Word by word" : "Read a bit longer next time"}</p></div>
        </div>
        {r.norm && <p className="mt-4 rounded-2xl bg-white/10 px-4 py-2 text-sm">📊 {r.norm.kid}</p>}
        {r.average && <p className="mt-2 rounded-2xl bg-emerald-400/20 px-4 py-2 text-sm">✌️ Two 1-minute checks today ({r.average.reads.join(" and ")}): your official score is the average, <b>{r.average.wcpm} WCPM</b>.</p>}
        <p className="mt-4 text-lg font-semibold">{r.accuracy >= 97 && r.level !== "BELOW" ? "🌟 Excellent reading!" : r.accuracy >= 90 ? "👏 Good reading — let’s polish a few words." : "💪 Good effort! Practise the words below and read it again."}</p>
      </section>

      {r.prosody && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 text-lg font-bold text-brand-navy">🎭 How your reading sounded</h2>
          <ProsodyBars scores={Object.fromEntries(Object.entries(r.prosody).map(([k2, v]) => [k2, v?.score ?? null]))} reasons={Object.fromEntries(Object.entries(r.prosody).map(([k2, v]) => [k2, v?.reason ?? ""]))} />
        </section>
      )}

      {r.trial !== null && r.trials.length > 0 && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-lg font-bold text-brand-navy">{kind === "REPEATED" ? "🔁 My repeated readings" : "🎼 My phrased readings"}</h2>
          {r.nextGoal !== null && <p className="mb-3 text-sm text-slate-600">Next time, aim for <b>{r.nextGoal}</b> words correct per minute.</p>}
          <TrialChart trials={r.trials} nextGoal={r.nextGoal} />
        </section>
      )}

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">Your reading</h2>
        <p className="mb-3 text-xs text-slate-500"><span className={`rounded px-1 ${MARK.MISPRONOUNCED}`}>said differently</span> <span className={`rounded px-1 ${MARK.SUBSTITUTED}`}>another word</span> <span className={`rounded px-1 ${MARK.SKIPPED}`}>skipped</span> <span className={`rounded px-1 ${MARK.HESITATION}`}>stopped more than 3 seconds</span> <span className="text-slate-400">not read</span> · tap a word to hear it</p>
        <p className="text-lg leading-loose">{r.words.map((w, i) => <span key={i}><button type="button" onClick={() => say(w.text.replace(/[^A-Za-z'-]/g, ""))} title={w.heard ? `You said “${w.heard}”` : w.mark === "HESITATION" ? "You stopped here for more than 3 seconds" : undefined} className={`rounded px-0.5 hover:bg-teal-50 ${MARK[w.mark]}`}>{w.text}</button> </span>)}</p>
      </section>

      {errors.length > 0 && (
        <section className="rounded-3xl bg-rose-50 p-6 ring-1 ring-rose-200">
          <h2 className="text-lg font-bold text-rose-900">🗣 Words to practise</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {errors.slice(0, 15).map((w, i) => { const word = w.text.replace(/[^A-Za-z'-]/g, ""); return (
              <li key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-4 py-2.5 ring-1 ring-rose-100">
                <span><b className="text-lg text-slate-900">{word}</b>{w.heard && <span className="block text-xs text-rose-700">you said “{w.heard}”</span>}{w.mark === "SKIPPED" && <span className="block text-xs text-slate-500">skipped</span>}{w.mark === "HESITATION" && <span className="block text-xs text-violet-700">a long stop — say it in 3 seconds</span>}</span>
                <button type="button" onClick={() => say(word)} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700" aria-label={`Listen to ${word}`}>🔊 Listen</button>
              </li>); })}
          </ul>
          {r.patterns.length > 0 && <p className="mt-3 text-sm text-rose-900">Sound patterns to watch: <b>{r.patterns.join(" · ")}</b> — <Link href="/student/fluency-coach?mode=DRILL" className="font-bold underline">do a 1-minute word drill</Link></p>}
        </section>
      )}

      {r.tips?.length > 0 && (
        <section className="rounded-3xl bg-sky-50 p-6 ring-1 ring-sky-200">
          <h2 className="text-lg font-bold text-sky-900">💡 Tips for these sounds</h2>
          <p className="text-xs text-sky-800">Your accent is fine — only wrong words count. These tips help with sounds that are new in English.</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">{r.tips.map((t) => <li key={t.code} className="rounded-2xl bg-white p-4 ring-1 ring-sky-100"><p className="font-bold text-slate-900">{t.title}</p><p className="mt-1 text-sm text-slate-700">{t.tip}</p><p className="mt-2 text-xs text-slate-500">Your words: {t.words.join(", ")} · Try: {t.practice.join(" · ")}</p></li>)}</ul>
        </section>
      )}

      {kind !== "ECHO" && kind !== "DRILL" && <ComprehensionCheck practiceId={r.id} />}

      {r.plan.steps.length > 0 && (
        <section className="rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
          <h2 className="text-lg font-bold text-emerald-900">🗓 My plan for this week</h2>
          <p className="text-sm text-emerald-900">{r.plan.growth && !r.plan.growth.reached ? <>Next goal: <b>{r.plan.growth.nextGoal} words correct per minute</b> — grow about {r.plan.growth.perWeek} a week to reach {r.plan.growth.target} ({r.plan.growth.season.toLowerCase()} middle) · {r.plan.growth.weeks} weeks left</> : <>Goal: <b>{r.plan.goal} words correct per minute</b></>} · next 1-minute check on <b>{r.plan.nextCheck}</b> · read {r.plan.perWeek} times this week.</p>
          <ol className="mt-3 space-y-2">{r.plan.steps.map((st, i) => <li key={i} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-emerald-100"><span aria-hidden="true" className="text-xl">{st.icon}</span><span className="flex-1 text-slate-800">{st.text}</span>{st.href && <Link href={st.href} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700">Go</Link>}</li>)}</ol>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <button onClick={again} className="rounded-2xl bg-brand-navy px-6 py-3 font-bold text-white hover:bg-brand-purple">🔁 Read it again</button>
        <Link href="/student/fluency-coach" className="rounded-2xl bg-white px-6 py-3 font-bold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Back to the Fluency Coach</Link>
      </div>
    </div>
  );
}
