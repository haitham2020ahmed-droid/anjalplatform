"use client";
/**
 * One question with answer tiles, power-ups and feedback — shared by Rocket Race, Team Tug and Castle Guard
 * (multiple choice and True/False from the skill's bank questions). It calls round.answer() once; the game reacts
 * through onAnswered (move the rocket, pull the rope, earn castle coins) and onNext (the next question).
 * A right answer moves on by itself; a wrong one waits so the student can read the right answer.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { AnswerOutcome, PlayQuestion, PowerEffect, PowerUpId, RoundApi } from "../types";
import { AnswerTiles } from "../kit/answer-tiles";
import { PowerBar } from "../kit/power-bar";
import { RichInline } from "../../components/rich-inline";

/** Nominal seconds per question for the speed bonus (the race / castle sets the real pace). */
export const ASK_SECONDS = 20;

export function Ask({ q, n, total, round, onAnswered, onNext, paused, hold, extra, nextLabel }: {
  q: PlayQuestion; n: number; total: number; round: RoundApi;
  onAnswered: (ok: boolean, out: AnswerOutcome) => void;
  onNext: () => void;
  /** the game stopped the question (race over, wave coming) */
  paused?: boolean;
  /** wait for the Next button after a right answer too (e.g. to build before a wave) */
  hold?: boolean;
  /** a line under the feedback (e.g. "+3 castle coins") */
  extra?: string | null;
  nextLabel?: string;
}) {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState<(AnswerOutcome & { ok: boolean }) | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const bonus = useRef(0);
  useEffect(() => { shownAt.current = Date.now(); bonus.current = 0; }, [q.id]);

  // a right answer moves on by itself
  const nextRef = useRef(onNext); nextRef.current = onNext;
  useEffect(() => {
    if (!done?.ok || paused || hold) return;
    const id = setTimeout(() => nextRef.current(), 1000);
    return () => clearTimeout(id);
  }, [done, paused, hold]);

  const pick = (label: string) => {
    if (done || round.over || paused) return;
    const ok = !!q.options?.find((o) => o.label === label)?.correct;
    const secs = (Date.now() - shownAt.current) / 1000;
    const speed = Math.max(0, Math.min(1, 1 - secs / (ASK_SECONDS + bonus.current)));
    const out = round.answer(q, ok, { speed });
    setPicked(label); setDone({ ...out, ok });
    if (ok) round.celebrate();
    onAnswered(ok, out);
  };
  const onEffect = (_id: PowerUpId, e: PowerEffect) => {
    if (e.hide) setHidden(e.hide);
    if (e.hint) setHint(e.hint);
    if (e.extraSeconds) bonus.current += e.extraSeconds;
  };

  const right = q.options?.find((o) => o.correct)?.label ?? null;
  return (
    <div className="space-y-3">
      <article className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <p className="mb-1 text-sm font-semibold text-slate-500">{t("Question {n} of {total}", { n, total })}</p>
        {q.passage && (
          <details className="mb-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">📖 <span dir="ltr" lang="en" className="ms-1"><RichInline text={q.passage.title} /></span></summary>
            <p dir="ltr" lang="en" className="mt-2 whitespace-pre-line leading-relaxed text-slate-800"><RichInline text={q.passage.text} /></p>
          </details>
        )}
        <p dir="ltr" lang="en" className="text-lg font-semibold leading-relaxed text-slate-900 sm:text-xl"><RichInline text={q.stem} /></p>
        {hint && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}
      </article>
      <AnswerTiles options={q.options ?? []} hidden={hidden} disabled={!!done || round.over || paused} onPick={pick} reveal={done ? { right, picked } : null} />
      {done && (
        <div role="status" className={`rounded-2xl p-4 ${done.ok ? "animate-pop bg-emerald-50 ring-2 ring-emerald-300" : "animate-shake bg-orange-50 ring-2 ring-orange-300"}`}>
          <p className={`text-lg font-semibold ${done.ok ? "text-emerald-800" : "text-orange-800"}`}>
            {done.ok ? t("Correct! +{n}", { n: done.points }) : t("Not quite")}
            {done.doubled && <span className="ms-2 text-base">({t("Double Points")})</span>}
            {done.shielded && <span className="ms-2 text-base">🛡 {t("Shield saved your points")}</span>}
          </p>
          {extra && <p className="mt-1 font-semibold text-brand-navy">{extra}</p>}
          {!done.ok && q.explain && <p dir="ltr" lang="en" className="mt-1 text-slate-700">{q.explain}</p>}
          {(!done.ok || hold) && !paused && <button type="button" onClick={onNext} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{nextLabel ?? t("Next")}</button>}
        </div>
      )}
      <PowerBar round={round} q={done || paused ? null : q} onEffect={onEffect} />
    </div>
  );
}

/** The end-of-race banner (win / second place / draw) shown before the score screen. */
export function FinishBanner({ tone, title, line, onDone }: { tone: "win" | "lose" | "draw"; title: string; line?: string; onDone: () => void }) {
  const t = useT();
  const doneRef = useRef(onDone); doneRef.current = onDone;
  useEffect(() => { const id = setTimeout(() => doneRef.current(), 4500); return () => clearTimeout(id); }, []);
  const cls = tone === "win" ? "from-amber-300 to-yellow-100 text-amber-950" : tone === "draw" ? "from-sky-200 to-white text-sky-950" : "from-slate-200 to-white text-slate-800";
  return (
    <div role="status" className={`animate-pop rounded-3xl bg-gradient-to-br bg-linear-to-br p-6 text-center shadow ring-1 ring-black/5 ${cls}`} data-testid="finish-banner">
      <p className="text-5xl" aria-hidden="true">{tone === "win" ? "🏆" : tone === "draw" ? "🤝" : "💪"}</p>
      <p className="mt-2 text-2xl font-semibold">{title}</p>
      {line && <p className="mt-1">{line}</p>}
      <button type="button" onClick={onDone} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-navy px-6 text-lg font-semibold text-white">{t("See my score")}</button>
    </div>
  );
}
