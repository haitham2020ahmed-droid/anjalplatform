"use client";
import Link from "next/link";
import { useState } from "react";
import type { CoachResult } from "@/server/fluency/coach";
import type { DrillGrid } from "@/server/fluency/drill";
import { say, useCoachRecorder } from "./recorder";
import { MicMeter } from "./mic-meter";

/** ⚡ The 60-second speed drill: read the rows of pattern words aloud, as many as you can in one minute. */
export function DrillReader({ grid }: { grid: DrillGrid }) {
  const [result, setResult] = useState<CoachResult | null>(null);
  const r = useCoachRecorder({ limit: 60, fields: () => ({ key: "DRILL", mode: "PASSAGE", kind: "DRILL", grid: JSON.stringify(grid) }), onResult: setResult });
  const missed = new Set<number>(result ? result.words.map((w, i) => (w.mark !== "OK" && w.mark !== "NOT_READ" ? i : -1)).filter((i) => i >= 0) : []);
  let at = 0;
  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-brand-navy">⚡ 1-minute word drill</h2>
          {r.stage === "recording" && <span className="rounded-full bg-rose-100 px-3 py-1 text-lg font-bold tabular-nums text-rose-900">{60 - r.secs}s</span>}
        </div>
        <p className="mb-4 text-sm text-slate-600">Each row is one sound pattern — some are your own words from your readings. Read across each row, left to right. Tap 🔊 to hear a word before you start.</p>
        <div className="space-y-3">
          {grid.rows.map((row, ri) => { const start = at; at += row.words.length; const res = result?.drill?.rows[ri]; return (
            <div key={ri} className={`rounded-2xl p-3 ring-1 ${res?.reteach ? "bg-rose-50 ring-rose-200" : "bg-slate-50 ring-slate-200"}`}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{row.label}{res && <span className={`ms-2 rounded-full px-2 py-0.5 normal-case ${res.reteach ? "bg-rose-600 text-white" : "bg-emerald-100 text-emerald-900"}`}>{res.reteach ? `${res.misses} misses — practise this pattern again` : res.misses ? "1 miss" : res.reached ? "all correct" : "not reached"}</span>}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {row.words.map((w, k) => <button key={k} type="button" onClick={() => r.stage !== "recording" && say(w)} className={`rounded-xl bg-white px-2 py-3 text-center text-xl font-bold ring-1 ${missed.has(start + k) ? "text-rose-700 ring-rose-300 underline decoration-rose-500" : "text-slate-900 ring-slate-200"}`}>{w}</button>)}
              </div>
              {res?.reteach && <p className="mt-2 text-sm text-rose-900">💡 {row.tip}</p>}
            </div>); })}
        </div>
      </section>

      {r.stage !== "done" && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-brand-navy p-4 text-white shadow-lg">
          {r.stage === "ready" && <><p className="text-sm">Press Start and read the words aloud, row by row. It stops by itself after 60 seconds.</p><MicMeter mic={r.mic} onCheck={() => void r.check()} /><button onClick={r.start} className="rounded-2xl bg-gradient-to-r from-amber-300 to-orange-400 px-8 py-3 text-lg font-extrabold text-brand-navy shadow">⚡ Start</button></>}
          {r.stage === "recording" && <><p className="flex items-center gap-3 text-lg font-bold"><span className="h-3 w-3 animate-pulse rounded-full bg-rose-400" aria-hidden="true" />Go! {60 - r.secs}s left</p><button onClick={r.stop} className="rounded-2xl bg-white px-8 py-3 text-lg font-extrabold text-brand-navy">■ Stop</button></>}
          {r.stage === "sending" && <p className="text-lg font-semibold">🎧 The coach is checking your words…</p>}
          {r.stage === "waiting" && <p className="text-lg font-semibold">⏳ Your result comes in about {r.wait}s — keep this page open.</p>}
          {r.stage === "error" && <><p className="text-base font-semibold">⚠️ {r.msg}</p><button onClick={r.reset} className="rounded-2xl bg-white px-6 py-2.5 font-bold text-brand-navy">Try again</button></>}
        </div>
      )}

      {result?.drill && (
        <section className="rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-white shadow-md">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">Words correct per minute</p>
          <p className="text-6xl font-extrabold tabular-nums">{result.drill.wcpm}</p>
          <p className="mt-1">{result.drill.wordsCorrect} of {result.drill.wordsRead} words correct.</p>
          <p className="mt-3 font-semibold">{result.drill.reteach.length ? `Practise again: ${result.drill.rows.filter((x) => x.reteach).map((x) => x.label).join(" · ")}. Read the tip, listen to the words, then try the drill tomorrow.` : "🌟 Great — no pattern needs reteaching! Try to beat your score tomorrow."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => window.location.reload()} className="rounded-2xl bg-white px-6 py-3 font-bold text-orange-700">⚡ Drill again</button>
            <Link href="/student/fluency-coach" className="rounded-2xl bg-white/20 px-6 py-3 font-bold text-white ring-1 ring-white/50">Back to the Fluency Coach</Link>
          </div>
        </section>
      )}
    </div>
  );
}
