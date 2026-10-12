"use client";
/**
 * ▶ The solo play frame shared by every game: loads the game's code only now (lazy), gives it the round (clock,
 * points, power-ups, sounds), and shows the end screen — score, a small celebration, 1–5 star rating and Play again.
 * The result row (correct / incorrect) is sent once per round.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { GAME_LOADERS, type GameModule } from "../loaders";
import { gameMeta } from "../registry";
import type { GameId, PlayLevel, PlayQuestion } from "../types";
import { useRound, type RoundResult } from "./round";
import { useMute, playSound } from "./sound";
import { confetti } from "./confetti";
import { CoinIcon } from "@/components/motivation/avatar";

export interface RunnerRound { roundId: string; gameId: string; skillId: string; skillName: string; level: PlayLevel; questions: PlayQuestion[]; roundSeconds: number }

export function PlayRunner({ initial, rating: initialRating, backHref, module: preloaded = null }: { initial: RunnerRound; rating: number | null; backHref: string; module?: GameModule | null }) {
  const t = useT();
  const meta = gameMeta(initial.gameId)!;
  const [round, setRound] = useState(initial);
  const [mod, setMod] = useState<GameModule | null>(preloaded);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState<number | null>(initialRating);
  const [thanks, setThanks] = useState(false);
  const [gen, setGen] = useState(0);
  const [coins, setCoins] = useState(0);
  const { muted, toggle } = useMute();
  const sent = useRef<string | null>(null);

  useEffect(() => { if (preloaded) return; let on = true; GAME_LOADERS[initial.gameId as GameId]().then((m) => { if (on) setMod(m); }).catch(() => setError(t("Could not load the game. Check the connection and try again."))); return () => { on = false; }; }, [initial.gameId, t, preloaded]);

  const onOver = useCallback((r: RoundResult) => {
    setResult(r);
    playSound("win");
    if (r.correct > 0) confetti({ pieces: 50 });
    if (sent.current === round.roundId) return;
    sent.current = round.roundId;
    setCoins(0);
    void fetch("/api/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "result", roundId: round.roundId, correct: r.correct, incorrect: r.incorrect, points: r.points, missed: r.missed }) })
      .then((x) => (x.ok ? x.json() : null)).then((j: { coins?: number } | null) => { if (j && Number(j.coins) > 0) setCoins(Number(j.coins)); }).catch(() => {});
  }, [round.roundId]);
  const api = useRound(round.roundSeconds, onOver);
  // the round clock starts when the game's code has arrived
  const resetRef = useRef(api.reset); resetRef.current = api.reset;
  useEffect(() => { if (mod) { resetRef.current(); playSound("start"); } }, [mod]);

  const again = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/play?game=${encodeURIComponent(round.gameId)}&skill=${encodeURIComponent(round.skillId)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? t("Something went wrong. Try again.")); return; }
      setRound(j as RunnerRound); setResult(null); api.reset(); setGen((g) => g + 1); playSound("start");
    } catch { setError(t("Something went wrong. Try again.")); } finally { setBusy(false); }
  };

  const rate = async (n: number) => {
    setStars(n); setThanks(true);
    await fetch("/api/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rate", gameId: round.gameId, stars: n }) }).catch(() => {});
  };

  const Game = mod?.default;
  const total = round.questions.length;
  return (
    <div className="mx-auto max-w-3xl">
      {/* the shared top bar: game, skill, round clock, points, streak, mute */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-navy px-4 py-3 text-white shadow">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${meta.color}`}>{meta.icon}</span>
          <span className="truncate">{t(meta.name)} · <bdi dir="ltr">{round.skillName}</bdi></span>
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {!result && <span role="timer" aria-label={t("Time left")} className={`rounded-full px-3 py-1 tabular-nums ${api.secondsLeft <= 15 ? "bg-red-500" : "bg-white/15"}`} dir="ltr">⏱ {Math.floor(api.secondsLeft / 60)}:{String(api.secondsLeft % 60).padStart(2, "0")}</span>}
          {api.streak >= 2 && !result && <span className="animate-pop rounded-full bg-orange-500 px-3 py-1" dir="ltr">🔥 {api.streak}</span>}
          <span className="rounded-full bg-brand-gold px-3 py-1 tabular-nums text-brand-navy" aria-label={t("{n} points", { n: api.points })} dir="ltr">⭐ {api.points}</span>
          <button type="button" onClick={toggle} aria-pressed={muted} aria-label={muted ? t("Sound off") : t("Sound on")} title={muted ? t("Sound off") : t("Sound on")} className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-lg hover:bg-white/25">{muted ? "🔇" : "🔊"}</button>
        </span>
      </div>

      <div className="mt-4">
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{error}</p>}
        {result ? (
          <RoundEnd result={result} coins={coins} stars={stars} thanks={thanks} busy={busy} onRate={rate} onAgain={again} backHref={backHref} />
        ) : Game ? (
          <Game key={`${round.roundId}-${gen}`} questions={round.questions} skillName={round.skillName} level={round.level} round={api} />
        ) : (
          <p className="rounded-3xl bg-white p-10 text-center text-slate-600 ring-1 ring-slate-200" role="status">{t("Loading the game…")} <span className="sr-only">{total}</span></p>
        )}
      </div>
    </div>
  );
}

/** The end of a round: points, right / not right, 1–5 stars, Play again. */
export function RoundEnd({ result, coins = 0, stars, thanks, busy, onRate, onAgain, backHref }: { result: RoundResult; coins?: number; stars: number | null; thanks: boolean; busy: boolean; onRate: (n: number) => void; onAgain: () => void; backHref: string }) {
  const t = useT();
  const pct = result.correct + result.incorrect ? result.correct / (result.correct + result.incorrect) : 0;
  const medal = pct >= 0.9 ? "🏆" : pct >= 0.7 ? "🎉" : pct >= 0.4 ? "👍" : "💪";
  return (
          <section aria-labelledby="end-h" className="animate-pop rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-6xl" aria-hidden="true">{medal}</p>
      <h2 id="end-h" className="mt-2 text-3xl font-semibold text-brand-navy">{pct >= 0.7 ? t("Great job!") : pct >= 0.4 ? t("Good work!") : t("Keep going!")}</h2>
      <p className="mt-3 text-5xl font-bold tabular-nums text-brand-navy" dir="ltr">{result.points.toLocaleString("en")}</p>
      <p className="text-slate-600">{t("{c} correct · {i} not correct", { c: result.correct, i: result.incorrect })}{result.bestStreak >= 2 ? ` · ${t("best streak {n}", { n: result.bestStreak })}` : ""}</p>
      {coins > 0 && <p role="status" className="animate-pop mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-900 ring-1 ring-amber-200" data-testid="game-coins"><CoinIcon size={18} /> {t("+{n} coins for playing", { n: coins })}</p>}
      <div className="mt-5">
        <p className="font-semibold text-brand-navy">{t("Rate this game")}</p>
        <div role="radiogroup" aria-label={t("Rate this game")} className="mt-1 flex justify-center gap-1" dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={t("{n} stars", { n })} onClick={() => onRate(n)}
              className={`grid h-11 w-11 place-items-center rounded-full text-2xl transition hover:scale-110 ${stars !== null && n <= stars ? "text-amber-500" : "text-slate-300"}`}>★</button>
          ))}
        </div>
        {thanks && <p role="status" className="mt-1 text-sm text-emerald-700">{t("Thanks for rating!")}</p>}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onAgain} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-navy px-6 text-lg font-semibold text-white hover:bg-brand-purple disabled:opacity-60" data-testid="play-again">🔁 {t("Play again")}</button>
        <Link prefetch={false} href={backHref} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 text-lg font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50">{t("Back to My Work")}</Link>
      </div>
    </section>
  );
}
