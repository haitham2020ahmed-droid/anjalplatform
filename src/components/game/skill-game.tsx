/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/**
 * 🎯 Skill game player: a round of 10 questions from the student's adaptive practice (their own level, never
 * named), with a countdown, points (correct + speed bonus + streak), instant feedback and a final score.
 * Every answer goes through the normal practice engine, so it counts toward mastery and points.
 */
import { useEffect, useState, useTransition } from "react";
import type { ClientQuestion } from "../../server/practice/items";
import type { Feedback, PracticeView } from "../../server/practice/session";
import { AnswerInput, isAnswerReady, type AnswerValue } from "../practice/answer-input";
import { ListenButton } from "../listen-button";

type Submit = (input: { sessionId: string; questionId: string; response: unknown }) => Promise<{ feedback?: Feedback; view?: PracticeView; error?: string }>;
const ROUND = 10, SECONDS = 30;

export function SkillGame({ initial, submit, backHref }: { initial: PracticeView; submit: Submit; backHref: string }) {
  const [view, setView] = useState(initial);
  const [q, setQ] = useState<ClientQuestion | null>(initial.question);
  const [value, setValue] = useState<AnswerValue>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [n, setN] = useState(0);
  const [right, setRight] = useState(0);
  const [gained, setGained] = useState(0);
  const [left, setLeft] = useState(SECONDS);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const done = n >= ROUND || (!q && !fb);

  useEffect(() => {
    if (fb || done) return;
    const t = setInterval(() => setLeft(Math.max(0, SECONDS - Math.floor((Date.now() - startedAt) / 1000))), 250);
    return () => clearInterval(t);
  }, [fb, done, startedAt]);

  const check = () => start(async () => {
    if (!q) return;
    const response = (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && !Array.isArray(value) ? q.elements : value;
    const r = await submit({ sessionId: view.sessionId, questionId: q.questionId, response });
    if (r.error) return setError(r.error);
    setError(null); setFb(r.feedback!); setView(r.view!); setN((x) => x + 1);
    if (r.feedback!.correct) {
      const speed = Math.max(0, SECONDS - (Date.now() - startedAt) / 1000);
      const pts = 100 + Math.round((speed / SECONDS) * 50) + Math.min(streak, 5) * 20;
      setScore((x) => x + pts); setGained(pts); setRight((x) => x + 1);
      setStreak((x) => { const v = x + 1; setBest((b) => Math.max(b, v)); return v; });
    } else { setGained(0); setStreak(0); }
  });

  const next = () => { setQ(view.question); setValue(null); setFb(null); setStartedAt(Date.now()); setLeft(SECONDS); window.scrollTo({ top: 0 }); };
  const again = () => { setScore(0); setStreak(0); setN(0); setRight(0); next(); };

  if (done) {
    const stars = right >= 9 ? 3 : right >= 6 ? 2 : right >= 3 ? 1 : 0;
    return (
      <section className="animate-pop mx-auto max-w-xl rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-8 text-center text-white shadow-xl">
        <p className="text-6xl" aria-hidden="true">{stars === 3 ? "🏆" : stars === 2 ? "🎉" : stars === 1 ? "👍" : "💪"}</p>
        <h2 className="mt-2 text-3xl font-extrabold">{stars >= 2 ? "Amazing!" : stars === 1 ? "Good job!" : "Keep going!"}</h2>
        <p className="mt-1 text-xl" aria-label={`${stars} stars`}>{"⭐".repeat(stars)}{"☆".repeat(3 - stars)}</p>
        <p className="mt-3 text-5xl font-black tabular-nums">{score.toLocaleString("en")}</p>
        <p className="text-white/80">{right} of {n} correct · best streak {best} 🔥</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {view.question && <button type="button" onClick={again} className="rounded-2xl bg-brand-gold px-6 py-3 text-lg font-extrabold text-brand-navy shadow transition hover:scale-105 active:scale-95">🔁 Play again</button>}
          <a href={backHref} className="rounded-2xl bg-white/15 px-6 py-3 text-lg font-bold ring-1 ring-white/30 hover:bg-white/25">My skills</a>
        </div>
      </section>
    );
  }
  const ready = !!q && isAnswerReady(q, value);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-navy px-5 py-3 text-white shadow">
        <span className="font-bold">🎯 {view.skillName}</span>
        <span className="flex items-center gap-3 text-sm font-bold">
          <span className="rounded-full bg-white/15 px-3 py-1 tabular-nums">Q {Math.min(n + 1, ROUND)}/{ROUND}</span>
          <span className={`rounded-full px-3 py-1 tabular-nums ${streak >= 2 ? "animate-pop bg-orange-500" : "bg-white/15"}`}>🔥 {streak}</span>
          <span className="rounded-full bg-brand-gold px-3 py-1 tabular-nums text-brand-navy">⭐ {score}</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true"><div className={`h-full transition-all duration-300 ${left <= 5 ? "bg-red-500" : "bg-brand-teal"}`} style={{ width: `${(left / SECONDS) * 100}%` }} /></div>
      {q && (
        <article className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-7">
          {q.passage && <details className="mb-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200" open><summary className="cursor-pointer font-bold text-brand-navy">📖 {q.passage.title}</summary><p className="mt-2 whitespace-pre-line text-lg leading-relaxed text-slate-800">{q.passage.text}</p><ListenButton text={`${q.passage.title}. ${q.passage.text}`} label="Read aloud" className="mt-2" /></details>}
          {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-semibold leading-relaxed text-slate-900">{q.stem}</p>}
          <ListenButton text={[q.stem, ...(q.options ?? []).map((o) => `${o.label}. ${o.text}`)].join(". ")} label="Read aloud" className="mt-2" />
          <div className="mt-4"><AnswerInput q={q} value={value} onChange={setValue} disabled={!!fb || pending} /></div>
          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          {fb ? (
            <div role="status" className={`mt-5 rounded-2xl p-4 ${fb.correct ? "animate-pop bg-emerald-50 ring-2 ring-emerald-300" : "animate-shake bg-orange-50 ring-2 ring-orange-300"}`}>
              <p className={`text-2xl font-extrabold ${fb.correct ? "text-emerald-700" : "text-orange-700"}`}>{fb.correct ? `✅ Correct! +${gained}` : "💡 Not quite — try the next one!"}</p>
              {!fb.correct && <p className="mt-1 text-slate-800">Answer: <b>{fb.correctAnswer}</b></p>}
              {fb.whyCorrect && <p className="mt-1 text-sm text-slate-700">{fb.whyCorrect}</p>}
              <button type="button" onClick={next} className="mt-3 w-full rounded-2xl bg-brand-navy py-3 text-lg font-extrabold text-white transition hover:bg-brand-purple active:scale-95">{n >= ROUND || !view.question ? "See my score 🏁" : "Next ▶"}</button>
            </div>
          ) : (
            <button type="button" onClick={check} disabled={!ready || pending} className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 text-xl font-extrabold text-white shadow transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50">{pending ? "…" : "Check ✔"}</button>
          )}
        </article>
      )}
    </div>
  );
}
