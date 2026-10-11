"use client";
import Link from "next/link";
import { useState } from "react";
import type { CoachResult } from "@/server/fluency/coach";
import { say, useCoachRecorder } from "./recorder";
import { MicMeter } from "./mic-meter";
import { ProsodyBars } from "./charts";

/**
 * 🦜 Echo reading: the browser's voice reads one sentence, the student says the same sentence back, and the coach
 * compares the phrasing and the expression with the model. Sentence by sentence.
 */
export function EchoReader({ passageKey, title, sentences }: { passageKey: string; title: string; sentences: { text: string }[] }) {
  const [idx, setIdx] = useState(0);
  const [heard, setHeard] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [results, setResults] = useState<Record<number, CoachResult>>({});
  const r = useCoachRecorder({ limit: 30, fields: () => ({ key: passageKey, mode: "PASSAGE", kind: "ECHO", sentence: String(idx) }), onResult: (x) => setResults((m) => ({ ...m, [idx]: x })) });
  const cur = sentences[idx];
  const res = results[idx];
  const listen = () => { setSpeaking(true); say(cur.text, 0.85, () => { setSpeaking(false); setHeard(true); }); window.setTimeout(() => { setSpeaking(false); setHeard(true); }, Math.max(2500, cur.text.length * 90)); };
  const next = () => { setIdx((i) => Math.min(sentences.length - 1, i + 1)); setHeard(false); r.reset(); };
  const done = Object.keys(results).length;
  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-brand-navy">🦜 Echo reading · {title}</h2>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-900">Sentence {idx + 1} of {sentences.length}</span>
        </div>
        <p className="mb-3 text-sm text-slate-600">1. Press <b>Listen</b> and follow the words. 2. Press <b>Record</b> and say the same sentence the same way — same pauses, same voice going up and down.</p>
        <div className="flex gap-1" aria-hidden="true">{sentences.map((_, i) => <span key={i} className={`h-2 flex-1 rounded-full ${results[i] ? "bg-emerald-400" : i === idx ? "bg-indigo-400" : "bg-slate-200"}`} />)}</div>
        <p className={`mt-5 rounded-2xl p-5 text-2xl leading-relaxed text-slate-900 md:text-3xl ${speaking ? "bg-amber-50 ring-2 ring-amber-300" : "bg-slate-50"}`}>{cur.text}</p>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-brand-navy p-4 text-white shadow-lg">
        {(r.stage === "ready" || r.stage === "done") && (
          <>
            <button onClick={listen} disabled={speaking} className="rounded-2xl bg-white px-6 py-3 text-lg font-extrabold text-brand-navy disabled:opacity-60">🔊 {speaking ? "Listening…" : heard ? "Listen again" : "Listen"}</button>
            {r.stage === "ready" && <MicMeter mic={r.mic} onCheck={() => void r.check()} />}
            <button onClick={r.start} disabled={!heard || speaking} className="rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 px-6 py-3 text-lg font-extrabold text-brand-navy shadow disabled:opacity-50">🎙 Record</button>
            {res && idx < sentences.length - 1 && <button onClick={next} className="rounded-2xl bg-indigo-400 px-6 py-3 text-lg font-extrabold text-white">Next sentence →</button>}
          </>
        )}
        {r.stage === "recording" && <><p className="flex items-center gap-3 text-lg font-bold"><span className="h-3 w-3 animate-pulse rounded-full bg-rose-400" aria-hidden="true" />Say the sentence…</p><button onClick={r.stop} className="rounded-2xl bg-white px-8 py-3 text-lg font-extrabold text-brand-navy">■ Stop</button></>}
        {r.stage === "sending" && <p className="text-lg font-semibold">🎧 The coach is comparing your sentence…</p>}
        {r.stage === "waiting" && <p className="text-lg font-semibold">⏳ Your result comes in about {r.wait}s — keep this page open.</p>}
        {r.stage === "error" && <><p className="text-base font-semibold">⚠️ {r.msg}</p><button onClick={r.reset} className="rounded-2xl bg-white px-6 py-2.5 font-bold text-brand-navy">Try again</button></>}
      </div>

      {res && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-2 text-lg font-bold text-brand-navy">How close was your echo?</h2>
          <p className="mb-3 text-lg leading-loose">{res.words.map((w, i) => <span key={i} className={w.mark === "OK" ? "" : w.mark === "NOT_READ" ? "text-slate-400" : "rounded bg-rose-100 px-0.5 text-rose-900 underline decoration-rose-500"}>{w.text} </span>)}</p>
          {res.prosody ? <ProsodyBars scores={Object.fromEntries(Object.entries(res.prosody).map(([k, v]) => [k, v?.score ?? null]))} reasons={Object.fromEntries(Object.entries(res.prosody).map(([k, v]) => [k, v?.reason ?? ""]))} /> : <p className="text-sm text-slate-600">Say the whole sentence so the coach can hear your phrasing.</p>}
          {idx === sentences.length - 1 && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-900">🎉 You echoed all {done} sentences! Now read the whole passage on your own: <Link className="underline" href={`/student/fluency-coach?key=${encodeURIComponent(passageKey)}&mode=PASSAGE`}>read it →</Link></p>}
        </section>
      )}
    </div>
  );
}
