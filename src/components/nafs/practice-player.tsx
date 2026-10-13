"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { answerPracticeAction } from "@/app/student/nafs/practice/actions";

interface Q { id: string; skill: string; stem: string; options: string[]; passage: { title: string; paragraphs: string[] } | null }

/**
 * 🇸🇦 One adaptive NAFS practice question (student): the passage (numbered paragraphs) beside the question, A–D,
 * "Check", then right / wrong with the right answer and why, then "Next question" (the server picks it). Light: no
 * timer loop, one small server action per answer.
 */
export function NafsPracticePlayer({ id, n, max, minutesLeft, question }: { id: string; n: number; max: number; minutesLeft: number | null; question: Q }) {
  const t = useT();
  const router = useRouter();
  const [choice, setChoice] = useState<number | null>(null);
  const [fb, setFb] = useState<{ correct: boolean; answer: number; explanation: string; done: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const check = () => start(async () => {
    if (choice === null) return;
    setError(null);
    const r = await answerPracticeAction({ id, questionId: question.id, choice });
    if (r.error) { setError(r.error); return; }
    setFb(r.ok!);
  });
  const next = () => start(() => { router.refresh(); });
  return (
    <div className={`grid gap-4 ${question.passage ? "lg:grid-cols-2" : ""}`}>
      {question.passage && (
        <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-surface p-5 ring-1 ring-line" lang="en" dir="ltr">
          {question.passage.title && <h2 className="text-lg font-semibold text-ink">{question.passage.title}</h2>}
          {question.passage.paragraphs.map((p, i) => <p key={i} className="mt-3 leading-relaxed text-ink-2"><span className="me-2 text-xs font-bold text-muted">{i + 1}</span>{p}</p>)}
        </article>
      )}
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line" aria-live="polite">
        <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>{t("Question {n} of {total}", { n, total: max })}</span>
          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 font-semibold text-teal-900 ring-1 ring-teal-200">{t(question.skill)}</span>
          {minutesLeft !== null && <span>{t("{n} minutes left", { n: minutesLeft })}</span>}
        </p>
        <p className="mt-3 text-lg font-semibold text-ink" lang="en" dir="ltr">{question.stem}</p>
        <div className="mt-3 grid gap-2" role="radiogroup" aria-label={t("Answer")} lang="en" dir="ltr">
          {question.options.map((o, i) => {
            const picked = choice === i;
            const tone = fb ? (i === fb.answer ? "bg-emerald-50 ring-emerald-300 text-emerald-900" : picked ? "bg-rose-50 ring-rose-300 text-rose-900" : "bg-surface ring-line text-ink-2") : picked ? "bg-teal-50 ring-teal-400 text-ink" : "bg-surface ring-line text-ink";
            return (
              <button key={i} type="button" role="radio" aria-checked={picked} disabled={Boolean(fb) || busy} onClick={() => setChoice(i)}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-4 py-2 text-start ring-1 ${tone}`}>
                <b className="w-5 shrink-0">{"ABCD"[i]}</b><span>{o}</span>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
        {fb ? (
          <div className="mt-4 grid gap-3">
            <p className={`rounded-xl px-4 py-3 font-semibold ring-1 ${fb.correct ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
              {fb.correct ? `✓ ${t("Right!")}` : `${t("Not this time. The answer is {letter}.", { letter: "ABCD"[fb.answer] })}`}
              {fb.explanation && <span className="mt-1 block text-sm font-normal" lang="en" dir="ltr">{fb.explanation}</span>}
            </p>
            <button type="button" onClick={next} disabled={busy} className="min-h-12 rounded-xl bg-brand-navy px-6 text-lg font-semibold text-white disabled:opacity-50">{t(fb.done ? "See how you did" : "Next question")}</button>
          </div>
        ) : (
          <button type="button" onClick={check} disabled={choice === null || busy} className="mt-4 min-h-12 w-full rounded-xl bg-brand-navy px-6 text-lg font-semibold text-white disabled:opacity-50">{busy ? t("Checking…") : t("Check")}</button>
        )}
      </section>
    </div>
  );
}
