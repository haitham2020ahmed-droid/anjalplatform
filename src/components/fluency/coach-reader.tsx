"use client";
import Link from "next/link";
import { useState } from "react";
import type { CoachResult } from "@/server/fluency/coach";
import type { PhraseMark } from "@/server/fluency/phrasing";
import { say, useCoachRecorder } from "./recorder";
import { ProsodyBars, TrialChart } from "./charts";
import { ComprehensionCheck } from "./comprehension-check";
import { WordLookup } from "../learn/word-lookup";
import { ListenButton } from "../listen-button";
import { MicMeter } from "./mic-meter";
import { CoachStatus } from "./coach-status";
import { ListenAndPractice } from "./listen-practice";
import { MyPlanCard } from "./my-plan";
import { useT } from "@/i18n/client";

type Kind = "MINUTE" | "PASSAGE" | "PHRASED" | "REPEATED";
const LIMIT: Record<Kind, number> = { MINUTE: 60, PASSAGE: 240, PHRASED: 240, REPEATED: 240 };
const KIND_LABEL: Record<Kind, string> = { MINUTE: "⏱ 1-minute check", PASSAGE: "📖 Whole passage", PHRASED: "🎼 Phrased reading", REPEATED: "🔁 Repeated reading" };
const LEVEL_TONE = { BELOW: "bg-rose-500", ON: "bg-sky-600", ABOVE: "bg-emerald-600" } as const;
/** Students never see Below / On / Above about themselves: friendly words instead. */
const LEVEL_NAME = { BELOW: "Keep growing", ON: "On track", ABOVE: "Reading strong" } as const;
const MARK: Record<string, string> = { MISPRONOUNCED: "bg-rose-100 text-rose-900 underline decoration-rose-500 decoration-2", SUBSTITUTED: "bg-amber-100 text-amber-900 underline decoration-amber-500 decoration-2", SKIPPED: "bg-slate-200 text-slate-500 line-through", HESITATION: "bg-violet-100 text-violet-900 underline decoration-dotted decoration-violet-500 decoration-2", NOT_READ: "text-slate-400", OK: "text-emerald-900" };
/** notes that are NOT errors: shown so the student sees their own good work (a self-correction) and habits */
const NOTE: Record<string, { cls: string; sign: string; title: string }> = {
  SELF_CORRECTION: { cls: "bg-emerald-100 ring-1 ring-emerald-300", sign: "✓", title: "You fixed this word yourself — great!" },
  REPETITION: { cls: "bg-sky-50 ring-1 ring-sky-200", sign: "↺", title: "You said this twice. That's OK — it is not an error." },
  INSERTION: { cls: "", sign: "+", title: "You added a word here. It is not an error, but try to read only the words on the page." },
};
const WHY: Record<string, string> = { SUBSTITUTED: "you said another word", MISPRONOUNCED: "said a different way", SKIPPED: "skipped", HESITATION: "a long stop" };
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
          {k !== "MINUTE" && r.stage === "ready" && <ListenButton text={`${title}. ${words.join(" ")}`} label="Listen to the passage" className="mb-3" />}
          {k === "PHRASED" && trial && <p className="mb-3 text-sm text-slate-600">{trial === 1 ? "All the phrase marks are shown." : trial === 2 ? "Now only the long pauses (//) are shown — find the short pauses yourself." : "No marks now — read in phrases on your own!"}</p>}
          <WordLookup>{marks && marks.some(Boolean) ? <PhrasedText words={words} marks={marks} /> : <p data-wordtap className="max-w-3xl text-xl leading-loose text-slate-900 md:text-2xl md:leading-[2.6rem]">{words.join(" ")}</p>}</WordLookup>
        </section>
      )}

      {r.stage !== "done" && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-brand-navy p-4 text-white shadow-lg">
          {r.stage === "ready" && <><p className="text-sm">{HINT[k]}</p><MicMeter mic={r.mic} onCheck={() => void r.check()} /><button onClick={r.start} className="rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 px-8 py-3 text-lg font-extrabold text-brand-navy shadow">🎙 Start reading</button></>}
          {r.stage === "recording" && <><p className="flex items-center gap-3 text-lg font-bold"><span className="h-3 w-3 animate-pulse rounded-full bg-rose-400" aria-hidden="true" />Read now · <span className="tabular-nums">{k === "MINUTE" ? `${left}s left` : `${Math.floor(r.secs / 60)}:${String(r.secs % 60).padStart(2, "0")}`}</span></p><MicMeter mic={r.mic} compact /><button onClick={r.stop} className="rounded-2xl bg-white px-8 py-3 text-lg font-extrabold text-brand-navy">■ Stop</button></>}
          <CoachStatus r={r} />
        </div>
      )}

      {r.stage === "done" && result && <CoachResultView r={result} extra={result.id ? <ListenAndPractice first={result} text={words.join(" ")} limit={LIMIT[k]} /> : null} again={() => { if (k === "REPEATED" || k === "PHRASED") { window.location.reload(); return; } setResult(null); r.reset(); }} />}
    </div>
  );
}

export function CoachResultView({ r, again, extra }: { r: CoachResult; again: () => void; extra?: React.ReactNode }) {
  const t = useT();
  const errors = r.words.filter((w) => w.mark !== "OK" && w.mark !== "NOT_READ");
  const kind = r.kind ?? r.mode;
  const fb = r.feedback;
  // the three words most worth practising (older results: the first three missed words)
  const top = fb?.practise ?? errors.slice(0, 3).map((w) => ({ word: w.text.replace(/[^A-Za-z'-]/g, ""), why: w.mark as string, heard: w.heard }));
  const topSet = new Set(top.map((x) => x.word.toLowerCase()));
  const rest = errors.filter((w) => !topSet.has(w.text.replace(/[^A-Za-z'-]/g, "").toLowerCase()));
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-navy to-indigo-700 p-6 text-white shadow-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">{r.official ? "1-minute check · your fluency level" : `${KIND_LABEL[kind as Kind] ?? "Practice"} · practice`}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase text-white/70">Words correct per minute</p><p className="text-5xl font-extrabold tabular-nums">{r.wcpm}</p>{r.norm?.percentile !== null && r.norm?.percentile !== undefined && <p className="mt-1 text-xs text-white/80">{r.norm.text}</p>}</div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase text-white/70">{r.official ? "Level" : "About"}</p><p className="mt-2"><span className={`rounded-full px-3 py-1 text-lg font-bold ${LEVEL_TONE[r.level]}`}>{LEVEL_NAME[r.level]}</span></p><p className="mt-2 text-xs text-white/70">{r.rubric}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase text-white/70">Accuracy</p><p className="text-4xl font-extrabold tabular-nums">{r.accuracy}%</p><p className="text-xs text-white/70">{r.wordsCorrect} of {r.wordsRead} words · {r.seconds}s{r.hesitations ? ` · ${r.hesitations} long stop${r.hesitations > 1 ? "s" : ""}` : ""}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase text-white/70">Expression</p><p className="text-4xl font-extrabold tabular-nums">{r.expression ?? "—"}<span className="text-lg text-white/60">/4</span></p><p className="text-xs text-white/70">{fb?.naep.kid || (r.expression === 4 ? "Smooth and expressive" : r.expression === 3 ? "Good phrasing" : r.expression === 2 ? "Two words at a time" : r.expression === 1 ? "Word by word" : "Read a bit longer next time")}</p></div>
        </div>
        {fb?.growth && <p className="mt-4 rounded-2xl bg-teal-400/20 px-4 py-2 text-sm">📈 {fb.growth.message} <span className="text-white/70">({t("last time")} {fb.growth.previous.date}: {fb.growth.previous.wcpm} WCPM · {fb.growth.previous.accuracy}%)</span></p>}
        {r.norm && <p className="mt-4 rounded-2xl bg-white/10 px-4 py-2 text-sm">📊 {r.norm.kid}</p>}
        {r.average && <p className="mt-2 rounded-2xl bg-emerald-400/20 px-4 py-2 text-sm">✌️ Two 1-minute checks today ({r.average.reads.join(" and ")}): your official score is the average, <b>{r.average.wcpm} WCPM</b>.</p>}
        <p className="mt-4 text-lg font-semibold">{fb?.headline ?? (r.accuracy >= 97 && r.level !== "BELOW" ? "🌟 Excellent reading!" : r.accuracy >= 90 ? "👏 Good reading — let’s polish a few words." : "💪 Good effort! Practise the words below and read it again.")}</p>
      </section>

      {fb && fb.nextSteps.length > 0 && (
        <section className="rounded-3xl bg-amber-50 p-6 ring-1 ring-amber-200">
          <h2 className="text-lg font-bold text-amber-950">👣 {t("Your next steps")}</h2>
          <ol className="mt-3 space-y-2">{fb.nextSteps.map((st) => <li key={st.code} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-slate-800 ring-1 ring-amber-100"><span aria-hidden="true" className="text-xl">{st.icon}</span><span className="flex-1">{st.text}</span></li>)}</ol>
        </section>
      )}

      {r.prosody && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-lg font-bold text-brand-navy">🎭 How your reading sounded</h2>
          {fb?.naep.level ? <p className="mb-3 text-sm text-slate-600">{t("Overall")}: <b className="text-slate-900">{fb.naep.level}/4</b> — {fb.naep.kid}</p> : null}
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
        <p className="mb-3 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500"><span className={`rounded px-1 ${MARK.OK}`}>{t("correct")}</span> <span className={`rounded px-1 ${MARK.SUBSTITUTED}`}>{t("another word")}</span> <span className={`rounded px-1 ${MARK.MISPRONOUNCED}`}>{t("said differently")}</span> <span className={`rounded px-1 ${MARK.SKIPPED}`}>{t("skipped")}</span> <span className={`rounded px-1 ${MARK.HESITATION}`}>{t("stopped more than 3 seconds")}</span> <span className={`rounded px-1 ${NOTE.SELF_CORRECTION.cls}`}>✓ {t("fixed it yourself")}</span> <span className={`rounded px-1 ${NOTE.REPETITION.cls}`}>↺ {t("said twice")}</span> <span className="rounded px-1 text-fuchsia-700">+ {t("added word")}</span> <span className="text-slate-400">{t("not read")}</span> · {t("tap a word to hear it")}</p>
        {fb && <p className="mb-3 text-sm text-slate-600 tabular-nums">{t("Correct")}: <b>{fb.counts.correct}</b> · {t("another word")}: <b>{fb.counts.substitution}</b> · {t("skipped")}: <b>{fb.counts.omission}</b> · {t("long stops")}: <b>{fb.counts.hesitation}</b>{fb.counts.selfCorrection ? <> · {t("fixed it yourself")}: <b>{fb.counts.selfCorrection}</b></> : null}{fb.counts.repetition ? <> · {t("said twice")}: <b>{fb.counts.repetition}</b></> : null}{fb.counts.insertion ? <> · {t("added word")}: <b>{fb.counts.insertion}</b></> : null}</p>}
        <p className="text-lg leading-loose">{r.words.map((w, i) => {
          const nt = w.note ? NOTE[w.note] : null;
          return (
            <span key={i}>
              {w.note === "INSERTION" && <span className="me-0.5 rounded bg-fuchsia-50 px-1 text-sm text-fuchsia-700" title={NOTE.INSERTION.title}>+{w.inserted || "…"}</span>}
              <button type="button" onClick={() => say(w.text.replace(/[^A-Za-z'-]/g, ""))} title={w.heard ? `You said “${w.heard}”` : w.mark === "HESITATION" ? "You stopped here for more than 3 seconds" : nt && w.note !== "INSERTION" ? nt.title : undefined} className={`rounded px-0.5 hover:bg-teal-50 ${MARK[w.mark]} ${w.mark === "OK" && nt && w.note !== "INSERTION" ? nt.cls : ""}`}>{w.text}{w.mark === "OK" && nt && w.note !== "INSERTION" && <sup className="ms-0.5 text-[10px] font-bold text-emerald-700">{nt.sign}</sup>}</button>{" "}
            </span>
          );
        })}</p>
      </section>

      {extra}

      {top.length > 0 && (
        <section className="rounded-3xl bg-rose-50 p-6 ring-1 ring-rose-200">
          <h2 className="text-lg font-bold text-rose-900">🗣 {top.length === 1 ? t("Your word to practise") : t("Your {n} words to practise", { n: top.length })}</h2>
          <p className="text-sm text-rose-900">{t("Tap to hear it, say it three times, then read its sentence again.")}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {top.map((x) => (
              <li key={x.word}>
                <button type="button" onClick={() => say(x.word)} className="flex w-full items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-start ring-1 ring-rose-200 hover:ring-rose-400" aria-label={`Listen to ${x.word}`}>
                  <span><b className="text-xl text-slate-900">{x.word}</b><span className="block text-xs text-rose-700">{x.heard ? `you said “${x.heard}”` : WHY[x.why] ?? ""}</span></span>
                  <span className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">🔊</span>
                </button>
              </li>
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="mt-3 text-sm text-rose-950">
              <summary className="cursor-pointer font-semibold">{t("Other words to check")} ({rest.length})</summary>
              <p className="mt-2 flex flex-wrap gap-1.5">{rest.slice(0, 20).map((w, i) => { const word = w.text.replace(/[^A-Za-z'-]/g, ""); return <button key={i} type="button" onClick={() => say(word)} className="rounded-lg bg-white px-2 py-1 ring-1 ring-rose-100 hover:ring-rose-300">🔊 {word}</button>; })}</p>
            </details>
          )}
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

      {r.plan.remedial ? <MyPlanCard plan={r.plan.remedial} /> : r.plan.steps.length > 0 && (
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
