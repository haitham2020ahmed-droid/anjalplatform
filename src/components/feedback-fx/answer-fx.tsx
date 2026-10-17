"use client";
/**
 * 🎉 Answer feedback with sound and encouragement (presentation only — never changes a score or a level).
 *
 *   <AnswerFx correct answerKey={questionId} />   after an answer in practice / ReadMaster / ReadRise / Question of the Day
 *   <CelebrateFx />                              at the end of a skill / practice
 *   <MuteToggle />                               🔇 / 🔊, remembered on this device (default: sound on)
 *   answerSavedFx()                              tests: a neutral tick only, nothing revealed
 *
 * The pop and the confetti are CSS only and switched off for prefers-reduced-motion.
 */
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { useMute } from "@/games/kit/sound";
import { CORRECT_PHRASES, END_PHRASES, WRONG_PHRASES, answerReveal, createStreak, makePicker, type FxReveal } from "./phrases";
import { playFx } from "./sound";

export { answerSavedFx } from "./sound";

// one streak and one phrase picker per kind of screen (practice, readmaster, readrise, qotd), for the page's life
const scopes = new Map<string, { streak: ReturnType<typeof createStreak>; best: number; correct: () => string; wrong: () => string; last: { key: string; fx: FxReveal } | null }>();
function scopeOf(name: string) {
  let s = scopes.get(name);
  if (!s) scopes.set(name, (s = { streak: createStreak(), best: 0, correct: makePicker(CORRECT_PHRASES), wrong: makePicker(WRONG_PHRASES), last: null }));
  return s;
}
/** Record one answer once (a re-render or a strict-mode double effect gives the same result back). */
export function recordAnswer(scope: string, key: string, correct: boolean): FxReveal {
  const s = scopeOf(scope);
  if (s.last && s.last.key === key) return s.last.fx;
  const n = s.streak.record(correct);
  if (n > s.best) s.best = n;
  const fx = answerReveal("practice", correct, n, s);
  s.last = { key, fx };
  return fx;
}

/** The best run of right answers in a row this screen has seen so far (for the end-of-session summary). 0 if none. */
export const peekBestStreak = (scope = "practice"): number => scopes.get(scope)?.best ?? 0;
/** Forgets a scope's streak (tests, and a fresh practice session on the same page). */
export const resetStreak = (scope = "practice"): void => { scopes.delete(scope); };

const CONFETTI = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#14b8a6", "#facc15", "#ef4444", "#3b82f6", "#ec4899", "#84cc16"];
const FX_CSS = `
@keyframes fxburst { 0% { transform: translate(0,0) rotate(0); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) rotate(260deg); opacity: 0; } }
.fx-bit { position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; border-radius: 2px; animation: fxburst .8s ease-out forwards; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .fx-bit { display: none; } }
`;

function Confetti() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      <style>{FX_CSS}</style>
      {CONFETTI.map((c, i) => {
        const a = (i / CONFETTI.length) * Math.PI * 2;
        return <span key={c} className="fx-bit" style={{ background: c, ["--dx" as string]: `${Math.round(Math.cos(a) * 70)}px`, ["--dy" as string]: `${Math.round(Math.sin(a) * 40 - 12)}px` }} />;
      })}
    </span>
  );
}

/** 🔇 / 🔊 — one switch for games and answer sounds (remembered on this device). */
export function MuteToggle({ className = "" }: { className?: string }) {
  const t = useT();
  const { muted, toggle } = useMute();
  return (
    <button type="button" onClick={toggle} aria-pressed={muted} aria-label={muted ? t("Sound off") : t("Sound on")} title={muted ? t("Sound off") : t("Sound on")}
      className={`inline-grid h-11 min-w-11 place-items-center rounded-full bg-white text-lg ring-1 ring-slate-200 hover:bg-slate-50 ${className}`}>
      <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}

/** After an answer: a chime + an encouraging phrase (+ a small pop), or a soft tone + a kind phrase. */
export function AnswerFx({ correct, answerKey, scope = "practice", className = "" }: { correct: boolean; answerKey: string; scope?: string; className?: string }) {
  const t = useT();
  const [fx, setFx] = useState<FxReveal | null>(null);
  useEffect(() => {
    const r = recordAnswer(scope, answerKey, correct);
    setFx(r);
    playFx(r.sound);
  }, [scope, answerKey, correct]);
  if (!fx?.phrase) return null;
  return (
    <div data-testid="answer-fx" className={`flex flex-wrap items-center gap-2 ${className}`}>
      <p role="status" className={`relative inline-flex min-h-11 items-center rounded-full px-4 py-1.5 text-lg font-bold motion-safe:animate-pop ${correct ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-sky-50 text-sky-900 ring-1 ring-sky-200"}`}>
        {fx.confetti && <Confetti />}
        <span className="relative">{t(fx.phrase)}</span>
      </p>
      <MuteToggle />
    </div>
  );
}

/** The end of a skill / practice: a little tune, confetti and a cheer. */
export function CelebrateFx({ className = "" }: { className?: string }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(makePicker(END_PHRASES)());
    playFx("celebrate");
  }, []);
  if (!text) return null;
  return (
    <p role="status" data-testid="celebrate-fx" className={`relative inline-flex min-h-11 items-center rounded-full bg-amber-50 px-5 py-2 text-xl font-bold text-amber-900 ring-1 ring-amber-200 motion-safe:animate-pop ${className}`}>
      <Confetti />
      <span className="relative">{t(text)}</span>
    </p>
  );
}
