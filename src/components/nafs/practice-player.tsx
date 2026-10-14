"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { answerPracticeAction } from "@/app/student/nafs/practice/actions";
import { callAction, refreshOrReload } from "@/lib/answer-send";

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
  // r68: the answer is sent again by itself when the server is busy (it is saved once; a repeat gets its saved result),
  // and an error never escapes to the full-page error: a small "Try again" shows here instead
  const [failed, setFailed] = useState(false);
  const check = () => start(async () => {
    if (choice === null) return;
    setError(null); setFailed(false);
    const sent = await callAction(() => answerPracticeAction({ id, questionId: question.id, choice }));
    if (!sent.ok) { setFailed(true); setError(t(sent.message)); return; }
    const r = sent.data;
    if (r.error) { setError(r.error); return; }
    if (r.ok) setFb(r.ok);
  });
  // r68 (the faded "Next question"): the next question used to wait on a page refresh INSIDE a transition, so on a busy
  // server the button stayed disabled. Now the button answers at once; if the new question has not come within a few
  // seconds the page loads again in full (the server keeps the student's place).
  const [moving, setMoving] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const next = () => { if (moving) return; setMoving(true); cancel.current = refreshOrReload(() => router.refresh()); };
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
        {error && (
          <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
            <span>{error}</span>
            {failed && !fb && <button type="button" data-testid="answer-try-again" onClick={check} disabled={busy} className="rounded-lg bg-white px-3 py-1 font-semibold ring-1 ring-rose-300 disabled:opacity-50">{t("Try again")}</button>}
          </div>
        )}
        {fb ? (
          <div className="mt-4 grid gap-3">
            <p className={`rounded-xl px-4 py-3 font-semibold ring-1 ${fb.correct ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
              {fb.correct ? `✓ ${t("Right!")}` : `${t("Not this time. The answer is {letter}.", { letter: "ABCD"[fb.answer] })}`}
              {fb.explanation && <span className="mt-1 block text-sm font-normal" lang="en" dir="ltr">{fb.explanation}</span>}
            </p>
            <button type="button" onClick={next} disabled={moving} className="min-h-12 rounded-xl bg-brand-navy px-6 text-lg font-semibold text-white disabled:opacity-50">{t(fb.done ? "See how you did" : "Next question")}</button>
          </div>
        ) : (
          <button type="button" onClick={check} disabled={choice === null || busy} className="mt-4 min-h-12 w-full rounded-xl bg-brand-navy px-6 text-lg font-semibold text-white disabled:opacity-50">{busy ? t("Checking…") : t("Check")}</button>
        )}
      </section>
    </div>
  );
}
