"use client";
/**
 * ⚡ Quiz Race (speed): answer each question before its timer ends. Multiple choice and True/False from the skill's
 * bank questions at the student's level. Faster right answers score more; power-ups, sounds and confetti come from
 * the shared kit. Correct / incorrect is all the result row keeps.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps, PowerEffect, PowerUpId } from "../types";
import { AnswerTiles } from "../kit/answer-tiles";
import { PowerBar } from "../kit/power-bar";

export const QUESTION_SECONDS = 15;

export default function QuizRace({ questions, round }: GameProps) {
  const t = useT();
  const [ix, setIx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; points: number; shielded: boolean; doubled: boolean } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [limit, setLimit] = useState(QUESTION_SECONDS);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const q = questions[ix] ?? null;
  const cardRef = useRef<HTMLDivElement>(null);
  const left = Math.max(0, limit - (now - startedAt) / 1000);

  useEffect(() => {
    if (done || round.over || !q) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [done, round.over, q]);

  // time up on this question: it counts as not answered correctly
  useEffect(() => {
    if (!q || done || round.over || left > 0) return;
    const out = round.answer(q, false);
    setPicked(null); setDone({ ok: false, points: out.points, shielded: out.shielded, doubled: false });
  }, [left, q, done, round]);

  // last-3-seconds tick
  const lastTick = useRef(-1);
  useEffect(() => {
    const s = Math.ceil(left);
    if (!done && s <= 3 && s > 0 && s !== lastTick.current) { lastTick.current = s; round.sound("tick"); }
  }, [left, done, round]);

  const next = () => {
    if (ix + 1 >= questions.length) { round.finish(); return; }
    setIx(ix + 1); setPicked(null); setDone(null); setHidden([]); setHint(null); setLimit(QUESTION_SECONDS);
    setStartedAt(Date.now()); setNow(Date.now()); lastTick.current = -1;
  };

  // a right answer moves on by itself; a wrong one waits so the student can read the right answer
  useEffect(() => {
    if (!done?.ok) return;
    const id = setTimeout(next, 1100);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const pick = (label: string) => {
    if (!q || done || round.over) return;
    const ok = !!q.options?.find((o) => o.label === label)?.correct;
    const speed = Math.max(0, Math.min(1, left / limit));
    const out = round.answer(q, ok, { speed });
    setPicked(label); setDone({ ok, points: out.points, shielded: out.shielded, doubled: out.doubled });
    if (ok) round.celebrate();
  };

  const onEffect = (_id: PowerUpId, e: PowerEffect) => {
    if (e.hide) setHidden(e.hide);
    if (e.hint) setHint(e.hint);
    if (e.extraSeconds) setLimit((l) => l + e.extraSeconds!);
  };

  if (!q) return null;
  const right = q.options?.find((o) => o.correct)?.label ?? null;
  return (
    <div ref={cardRef} className="space-y-4" data-testid="quiz-race">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-navy ring-1 ring-slate-200">{t("Question {n} of {total}", { n: ix + 1, total: questions.length })}</span>
        <span role="timer" aria-label={t("{n} seconds left", { n: Math.ceil(left) })} className={`grid h-14 w-14 place-items-center rounded-full text-2xl font-bold text-white shadow ${left <= 3 && !done ? "animate-pop bg-red-500" : "bg-brand-purple"}`}>{Math.ceil(left)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className={`h-full transition-[width] duration-200 ${left <= 3 ? "bg-red-500" : "bg-brand-teal"}`} style={{ width: `${(left / limit) * 100}%` }} />
      </div>
      <article className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        {q.passage && (
          <details className="mb-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <summary className="cursor-pointer font-semibold text-brand-navy">📖 <span dir="ltr" lang="en">{q.passage.title}</span></summary>
            <p dir="ltr" lang="en" className="mt-2 whitespace-pre-line leading-relaxed text-slate-800">{q.passage.text}</p>
          </details>
        )}
        <p dir="ltr" lang="en" className="text-xl font-semibold leading-relaxed text-slate-900">{q.stem}</p>
        {hint && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}
      </article>
      <AnswerTiles options={q.options ?? []} hidden={hidden} disabled={!!done || round.over} onPick={pick} reveal={done ? { right, picked } : null} />
      {done && (
        <div role="status" className={`rounded-2xl p-4 ${done.ok ? "animate-pop bg-emerald-50 ring-2 ring-emerald-300" : "animate-shake bg-orange-50 ring-2 ring-orange-300"}`}>
          <p className={`text-xl font-semibold ${done.ok ? "text-emerald-800" : "text-orange-800"}`}>
            {done.ok ? t("Correct! +{n}", { n: done.points }) : picked ? t("Not quite") : t("Time's up")}
            {done.doubled && <span className="ms-2 text-base">({t("Double Points")})</span>}
            {done.shielded && <span className="ms-2 text-base">🛡 {t("Shield saved your points")}</span>}
          </p>
          {!done.ok && q.explain && <p dir="ltr" lang="en" className="mt-1 text-slate-700">{q.explain}</p>}
          {!done.ok && <button type="button" onClick={next} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{ix + 1 >= questions.length ? t("See my score") : t("Next")}</button>}
        </div>
      )}
      <PowerBar round={round} q={done ? null : q} onEffect={onEffect} />
    </div>
  );
}
