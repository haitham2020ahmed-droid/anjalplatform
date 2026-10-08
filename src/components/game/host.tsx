"use client";
import { useCallback, useEffect, useState } from "react";
import type { HostView } from "@/server/game/live";
import { TILES } from "./tiles";

/** The teacher's big screen: join code + QR, players, question with timer, results, leaderboard, podium. */
export function GameHost({ initial, qr, joinUrl, act }: { initial: HostView; qr: { total: number; d: string }; joinUrl: string; act: (id: string, a: "start" | "reveal" | "next" | "end") => Promise<{ error?: string }> }) {
  const [v, setV] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState<string | null>(null);
  const refresh = useCallback(async () => { try { const r = await fetch(`/api/games/${initial.id}/host`, { cache: "no-store" }); if (r.ok) setV(await r.json()); } catch { /* keep the last state */ } }, [initial.id]);
  useEffect(() => { const a = setInterval(refresh, 1500), b = setInterval(() => setNow(Date.now()), 250); return () => { clearInterval(a); clearInterval(b); }; }, [refresh]);
  const run = async (a: "start" | "reveal" | "next" | "end") => { setErr(null); const r = await act(v.id, a); if (r.error) setErr(r.error); await refresh(); };
  const left = v.endsAt ? Math.max(0, Math.ceil((v.endsAt - now) / 1000)) : 0;
  const btn = "rounded-2xl px-8 py-4 text-xl font-extrabold shadow-lg transition active:scale-95";
  return (
    <div className="space-y-6">
      {err && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{err}</p>}
      {v.status === "LOBBY" && (
        <section className="grid items-center gap-8 rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy via-[#2b3f8f] to-brand-purple p-8 text-white shadow-xl lg:grid-cols-[1fr_auto]">
          <div>
            <p className="text-lg text-white/80">Join at <b className="text-white">{joinUrl.replace(/^https?:\/\//, "").replace(/\/play\/.*/, "/play")}</b> or scan the code</p>
            <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-white/70">Game PIN</p>
            <p className="font-mono text-7xl font-black tracking-[0.2em] sm:text-8xl">{v.code}</p>
            <p className="mt-4 text-xl">{v.players.length} player{v.players.length === 1 ? "" : "s"} joined</p>
            <button onClick={() => run("start")} disabled={!v.players.length} className={`${btn} mt-5 bg-brand-gold text-brand-navy disabled:opacity-50`}>▶ Start the game</button>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-lg">
            <svg viewBox={`0 0 ${qr.total} ${qr.total}`} width={260} height={260} shapeRendering="crispEdges" role="img" aria-label="QR code to join the game"><rect width="100%" height="100%" fill="#fff" /><path d={qr.d} fill="#000" /></svg>
          </div>
          <ul className="flex flex-wrap gap-2 lg:col-span-2">{v.players.map((p) => <li key={p.nickname} className="animate-pop rounded-full bg-white/15 px-4 py-1.5 font-semibold ring-1 ring-white/30">{p.nickname}</li>)}</ul>
        </section>
      )}
      {(v.status === "QUESTION" || v.status === "REVEAL") && v.question && (
        <section className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-full bg-white px-4 py-1.5 font-bold text-brand-navy ring-1 ring-slate-200">Question {v.index + 1} / {v.total}</span>
            {v.status === "QUESTION" ? <span className={`grid h-20 w-20 place-items-center rounded-full text-4xl font-black text-white shadow-lg ${left <= 5 ? "animate-pop bg-red-500" : "bg-brand-purple"}`}>{left}</span> : <span className="rounded-full bg-emerald-100 px-4 py-1.5 font-bold text-emerald-900">Answer</span>}
            <span className="rounded-full bg-white px-4 py-1.5 font-bold text-brand-navy ring-1 ring-slate-200">{v.answered} / {v.players.length} answered</span>
          </div>
          <h2 className="rounded-3xl bg-white p-6 text-center text-3xl font-extrabold leading-snug text-slate-900 shadow ring-1 ring-slate-200">{v.question.stem}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {v.question.options.map((o, i) => (
              <div key={o.label} className={`flex items-center gap-4 rounded-2xl p-5 text-2xl font-bold text-white shadow ${TILES[i % 4].bg} ${v.status === "REVEAL" && !o.correct ? "opacity-40" : ""}`}>
                <span aria-hidden="true" className="text-3xl">{TILES[i % 4].shape}</span><span className="flex-1">{o.text}</span>
                {v.status === "REVEAL" && <span className="rounded-xl bg-white/25 px-3 py-1 text-lg">{o.correct ? "✓ " : ""}{o.picks ?? 0}</span>}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            {v.status === "QUESTION" && <button onClick={() => run("reveal")} className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300`}>Show answer</button>}
            {v.status === "REVEAL" && <button onClick={() => run("next")} className={`${btn} bg-brand-navy text-white`}>{v.index + 1 >= v.total ? "🏆 Final results" : "Next question ▶"}</button>}
          </div>
          {v.status === "REVEAL" && (
            <ol className="rounded-3xl bg-white p-5 shadow ring-1 ring-slate-200">
              {v.leaderboard.slice(0, 5).map((p, i) => <li key={p.nickname} className="flex items-center justify-between border-b py-2 text-lg last:border-0"><span className="font-bold">{i + 1}. {p.nickname} {p.streak >= 3 ? <span className="text-orange-500">🔥{p.streak}</span> : null}</span><span className="font-mono font-bold">{p.score}</span></li>)}
            </ol>
          )}
        </section>
      )}
      {v.status === "FINISHED" && (
        <section className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-8 text-center text-white shadow-xl">
          <h2 className="text-4xl font-black">🏆 {v.title}</h2>
          <div className="mt-8 flex items-end justify-center gap-4">
            {[1, 0, 2].map((ix) => v.leaderboard[ix] && (
              <div key={ix} className="animate-pop w-36" style={{ animationDelay: `${ix * 250}ms` }}>
                <p className="text-5xl">{["🥇", "🥈", "🥉"][ix]}</p>
                <p className="mt-1 truncate text-xl font-bold">{v.leaderboard[ix].nickname}</p>
                <div className={`mt-2 rounded-t-2xl bg-white/20 font-mono text-lg font-bold ${ix === 0 ? "h-40" : ix === 1 ? "h-28" : "h-20"} grid place-items-center`}>{v.leaderboard[ix].score}</div>
              </div>
            ))}
          </div>
          <ol className="mx-auto mt-8 max-w-md text-start">{v.leaderboard.slice(3).map((p, i) => <li key={p.nickname} className="flex justify-between border-b border-white/20 py-1.5"><span>{i + 4}. {p.nickname}</span><span className="font-mono">{p.score}</span></li>)}</ol>
        </section>
      )}
      {v.status !== "FINISHED" && <p className="text-end"><button onClick={() => run("end")} className="text-sm font-semibold text-slate-500 underline">End the game</button></p>}
    </div>
  );
}
