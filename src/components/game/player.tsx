"use client";
import { useCallback, useEffect, useState } from "react";
import type { PlayerView } from "@/server/game/live";
import { TILES } from "./tiles";

/** A student's phone / laptop during a live game: big tiles, instant feedback, rank, podium. */
export function GamePlayer({ initial, answer }: { initial: PlayerView; answer: (id: string, ix: number, choice: string) => Promise<{ correct?: boolean; points?: number; error?: string }> }) {
  const [v, setV] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = useCallback(async () => { try { const r = await fetch(`/api/games/${initial.id}/player`, { cache: "no-store" }); if (r.ok) setV(await r.json()); } catch { /* keep the last state */ } }, [initial.id]);
  useEffect(() => { const a = setInterval(refresh, 1500), b = setInterval(() => setNow(Date.now()), 250); return () => { clearInterval(a); clearInterval(b); }; }, [refresh]);
  useEffect(() => { setMsg(null); }, [v.index, v.status]);
  const pick = async (choice: string) => {
    if (busy || v.myAnswer) return;
    setBusy(true);
    const r = await answer(v.id, v.index, choice);
    setBusy(false);
    if (r.error) setMsg(r.error);
    await refresh();
  };
  const left = v.endsAt ? Math.max(0, Math.ceil((v.endsAt - now) / 1000)) : 0;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
        <span className="font-bold text-brand-navy">{v.title}</span>
        <span className="flex items-center gap-2 font-bold"><span className="rounded-full bg-brand-gold px-3 py-0.5 text-brand-navy">⭐ {v.score}</span>{v.streak >= 2 && <span className="text-orange-500">🔥{v.streak}</span>}</span>
      </div>
      {v.status === "LOBBY" && (
        <div className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-10 text-center text-white shadow-xl">
          <p className="animate-float text-6xl" aria-hidden="true">🎮</p>
          <h1 className="mt-3 text-3xl font-black">You’re in!</h1>
          <p className="mt-2 text-white/85">Wait for your teacher to start. {v.players} player{v.players === 1 ? "" : "s"} joined.</p>
        </div>
      )}
      {v.status === "QUESTION" && v.question && (
        v.myAnswer ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow ring-1 ring-slate-200">
            <p className="text-5xl" aria-hidden="true">⏳</p>
            <p className="mt-3 text-2xl font-bold text-brand-navy">Answer locked in!</p>
            <p className="text-slate-600">Waiting for the others…</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><span className="font-semibold text-slate-600">Question {v.index + 1} / {v.total}</span><span className={`grid h-14 w-14 place-items-center rounded-full text-2xl font-black text-white ${left <= 5 ? "animate-pop bg-red-500" : "bg-brand-purple"}`}>{left}</span></div>
            <h2 className="rounded-3xl bg-white p-5 text-center text-xl font-bold text-slate-900 shadow-sm ring-1 ring-slate-200">{v.question.stem}</h2>
            <div className="grid grid-cols-2 gap-3">
              {v.question.options.map((o, i) => (
                <button key={o.label} onClick={() => pick(o.label)} disabled={busy} className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl p-4 text-lg font-bold text-white shadow-lg transition hover:brightness-110 active:scale-95 disabled:opacity-70 ${TILES[i % 4].bg}`}>
                  <span aria-hidden="true" className="text-3xl">{TILES[i % 4].shape}</span><span>{o.text}</span>
                </button>
              ))}
            </div>
            {msg && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-center text-red-800">{msg}</p>}
          </div>
        )
      )}
      {v.status === "REVEAL" && (
        <div className={`animate-pop rounded-3xl p-10 text-center text-white shadow-xl ${v.myAnswer?.correct ? "bg-emerald-500" : "bg-red-500"}`}>
          <p className="text-6xl" aria-hidden="true">{v.myAnswer ? (v.myAnswer.correct ? "✓" : "✗") : "⌛"}</p>
          <p className="mt-2 text-3xl font-black">{v.myAnswer ? (v.myAnswer.correct ? "Correct!" : "Not this time") : "Time’s up"}</p>
          {v.myAnswer?.correct && <p className="mt-1 text-xl font-bold">+{v.myAnswer.points} points{v.streak >= 2 ? ` · 🔥 ${v.streak} in a row` : ""}</p>}
          {!v.myAnswer?.correct && <p className="mt-1 text-white/90">Keep going — the next one is yours!</p>}
          <p className="mt-4 rounded-full bg-white/20 px-4 py-1.5 font-bold">You are #{v.rank} of {v.players}</p>
        </div>
      )}
      {v.status === "FINISHED" && (
        <div className="animate-pop rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-8 text-center text-white shadow-xl">
          <p className="text-6xl" aria-hidden="true">{v.rank === 1 ? "🥇" : v.rank === 2 ? "🥈" : v.rank === 3 ? "🥉" : "🎉"}</p>
          <h1 className="mt-2 text-3xl font-black">You finished #{v.rank} of {v.players}</h1>
          <p className="mt-1 text-xl">⭐ {v.score} points</p>
          <ol className="mx-auto mt-6 max-w-xs space-y-1 text-start">{v.podium.map((p, i) => <li key={p.nickname} className="flex justify-between rounded-xl bg-white/15 px-3 py-1.5"><span>{["🥇", "🥈", "🥉"][i]} {p.nickname}</span><span className="font-mono">{p.score}</span></li>)}</ol>
          <a href="/student" className="mt-6 inline-block rounded-xl bg-brand-gold px-6 py-2.5 font-bold text-brand-navy">Back to my page</a>
        </div>
      )}
    </div>
  );
}
