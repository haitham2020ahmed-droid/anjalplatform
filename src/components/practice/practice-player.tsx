/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/** Interactive wrapper: holds the answer, calls the server actions, swaps in the next question. */
import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { ClientQuestion } from "../../server/practice/items";
import type { Feedback, PracticeView } from "../../server/practice/session";
import { isAnswerReady, type AnswerValue } from "./answer-input";
import { CELEBRATE, PracticeFrame, endText } from "./practice-frame";
import { CelebrateFx, peekBestStreak } from "../feedback-fx/answer-fx";
import { WordLookup } from "../learn/word-lookup";
import { FlagButton } from "../learn/flag-button";
import { BUSY_MESSAGE, sendAnswer } from "../../lib/answer-send";
import { RichInline } from "@/components/rich-inline";

type Hint = (sessionId: string, questionId: string) => Promise<{ hint?: string; level?: number; maxLevel?: number; error?: string }>;
type Submit = (input: { sessionId: string; questionId: string; response: unknown }) => Promise<{ feedback?: Feedback; view?: PracticeView; error?: string }>;

export function PracticePlayer({ initial, unitHref, submit, hint }: { initial: PracticeView; unitHref: string; submit: Submit; hint?: Hint }) {
  const [hintText, setHintText] = useState<string | null>(null);
  // 💡 the hint ladder: each request shows one more step (question type → paragraph → clue sentence)
  const [hints, setHints] = useState<{ text: string; level: number; max: number }[]>([]);
  const [view, setView] = useState(initial);
  const [shown, setShown] = useState<ClientQuestion | null>(initial.question);
  const [value, setValue] = useState<AnswerValue>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useT();
  // r68: "Trying again…" while an answer is being sent again; `canRetry` = every try went wrong (a "Try again" shows)
  const [retrying, setRetrying] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [ended, setEnded] = useState(false);
  // ✅ finished (the last answer saved, or nothing left in this skill): "Great job! ✓", then back to My Work
  const [done, setDone] = useState<string | null>(initial.ended && initial.endReason && CELEBRATE.has(initial.endReason) ? initial.endReason : null);
  const sending = useRef(false); // one answer at a time (double clicks), before React shows "Checking…"
  // r67 guessing: after "take your time" the next question's answer buttons enable after a few seconds
  const [locked, setLocked] = useState(false);
  const lockMs = useRef(0);
  useEffect(() => {
    if (!locked) return;
    const id = window.setTimeout(() => setLocked(false), lockMs.current);
    return () => window.clearTimeout(id);
  }, [locked]);

  const check = () => {
    if (sending.current || pending) return;
    sending.current = true;
    start(async () => {
      try { await send(); } catch { setCanRetry(true); setError(t(BUSY_MESSAGE)); } finally { sending.current = false; }
    });
  };
  const send = async () => {
      if (!shown) return;
      const response = (shown.type === "SENTENCE_ORDER" || shown.type === "WORD_ORDER") && !Array.isArray(value) ? shown.elements : value;
      // r68: a plain fetch with a time limit, sent again by itself on a weak connection or a busy server (the server
      // accepts each answer once, so a retry is safe); never throws — on failure the answer stays and "Try again" shows
      setRetrying(false);
      const input = { sessionId: view.sessionId, questionId: shown.questionId, response };
      const sent = await sendAnswer<Awaited<ReturnType<Submit>>>({ kind: "practice", ...input }, () => submit(input), { onRetry: () => setRetrying(true) });
      setRetrying(false);
      if (!sent.ok) { setCanRetry(true); return setError(t(sent.message)); }
      const r = sent.data;
      setCanRetry(false);
      if (r.error) return setError(r.error);
      setError(null);
      // the practice had already finished (another tab or a second click): a friendly card, nothing changed
      if (r.feedback?.alreadyEnded) { setEnded(true); if (r.view) setView(r.view); return; }
      if (!r.feedback || !r.view) { setCanRetry(true); return setError(t(BUSY_MESSAGE)); }
      setFeedback(r.feedback);
      setView(r.view);
      // the work is saved as Done with this answer: a right last answer goes straight to "Great job! ✓"; after a
      // wrong one the student reads the feedback first, then presses Finish
      const reason = r.feedback.next.endReason;
      if (!r.feedback.next.hasQuestion && reason && CELEBRATE.has(reason) && r.feedback.correct) setDone(reason);
  };

  const next = () => {
    if (feedback?.guess?.action === "SLOW_DOWN") { lockMs.current = feedback.guess.waitMs; setLocked(true); }
    setShown(view.question);
    setValue(null);
    setFeedback(null);
    setHintText(null);
    setHints([]);
    window.scrollTo({ top: 0 });
  };

  if (ended) return <PracticeFinished />;
  if (done) return <PracticeDone reason={done} href={unitHref} skillName={view.skillName} answered={view.answered} correct={view.correct} />;
  return (
    <WordLookup>
      <PracticeFrame view={view} shownQuestion={shown} value={value} onChange={setValue} feedback={feedback}
        ready={!!shown && isAnswerReady(shown, value)} pending={pending} error={error} onCheck={check} retrying={retrying} canRetry={canRetry} t={t} onNext={next} unitHref={unitHref} locked={locked}
        onFinish={() => setDone(feedback?.next.hasQuestion ? "COMPLETED" : feedback?.next.endReason ?? "COMPLETED")} />
      {shown && hint && !feedback && (
        <div className="mx-auto mt-3 max-w-5xl">
          {hints.map((h) => <p key={h.level} className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">💡 <span className="font-semibold">Hint {h.level}:</span> <RichInline text={h.text} /></p>)}
          {hintText && !hints.length && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">💡 {hintText}</p>}
          {(!hints.length || hints[hints.length - 1].level < hints[hints.length - 1].max) && !(hintText && !hints.length) && (
            <button type="button" className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-50"
              onClick={async () => { const r = await hint(view.sessionId, shown.questionId).catch(() => ({ error: t(BUSY_MESSAGE) }) as Awaited<ReturnType<Hint>>); if (r.hint) { if (r.level) setHints((x) => [...x.filter((h) => h.level !== r.level), { text: r.hint!, level: r.level!, max: r.maxLevel ?? 3 }]); else setHintText(r.hint); } else if (r.error) setError(r.error); }}>
              💡 {hints.length ? "Another hint" : "Show a hint"} <span className="text-xs text-amber-700">(this answer will count half)</span>
            </button>
          )}
        </div>
      )}
      {shown && <div className="mx-auto max-w-5xl"><FlagButton key={shown.questionId} questionId={shown.questionId} /></div>}
    </WordLookup>
  );
}

/** How long "Great job! ✓" shows before the page goes back to My Work. */
export const DONE_REDIRECT_MS = 2000;

/**
 * "Great job! ✓" after a finished practice (the work is already saved as Done on the server): about 2 seconds, then
 * back to My Work (or the page the practice was opened from). "Back to My Work" goes at once.
 *
 * A small end-of-session summary of what the student just did — the skill, accuracy, and the best run of right
 * answers in a row this session (only shown when it is worth celebrating, ≥ 3) — plus the confetti every finish earns
 * (not only a mastered one): a positive note to end on whatever the result.
 */
export function PracticeDone({ reason, href, skillName, answered = 0, correct = 0 }: { reason: string; href: string; skillName?: string; answered?: number; correct?: number }) {
  const t = useT();
  const streak = peekBestStreak();
  const accuracy = answered > 0 ? Math.round((100 * correct) / answered) : null;
  useEffect(() => {
    const id = window.setTimeout(() => window.location.assign(href), DONE_REDIRECT_MS);
    return () => window.clearTimeout(id);
  }, [href]);
  return (
    <div data-testid="practice-done" role="status" aria-live="polite" className="mx-auto mt-10 max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-emerald-200">
      <p className="text-5xl text-emerald-600" aria-hidden="true">✓</p>
      <h2 className="mt-2 text-3xl font-bold text-brand-navy">{t("Great job! ✓")}</h2>
      <p className="mt-2 text-lg text-slate-700">{reason === "SKILL_FINISHED" ? t("You finished this skill! 🎉") : reason === "WORK_MASTERED" ? t("You mastered this skill — your work is Done! 🎉") : endText(reason)}</p>
      <div className="mt-4"><CelebrateFx /></div>
      {(answered > 0 || skillName) && (
        <dl data-testid="practice-done-stats" className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-3 text-start">
          {skillName && <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Skill practised")}</dt><dd className="truncate text-sm font-bold text-brand-navy"><bdi>{skillName}</bdi></dd></div>}
          {answered > 0 && <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Questions")}</dt><dd className="text-xl font-extrabold text-brand-navy" dir="ltr">{answered}</dd></div>}
          {accuracy !== null && <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Accuracy")}</dt><dd className="text-xl font-extrabold text-brand-navy" dir="ltr">{accuracy}%</dd></div>}
          {streak >= 3 && <div className="col-span-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200"><dt className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t("Best streak")}</dt><dd className="text-xl font-extrabold text-amber-900">🔥 {t("{n} in a row", { n: streak })}</dd></div>}
        </dl>
      )}
      <p className="mt-4 text-sm text-slate-500">{t("Going back to My Work…")}</p>
      <a href={href} className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-brand-navy px-6 py-3 text-lg font-semibold text-white hover:bg-brand-purple">{t("Back to My Work")}</a>
    </div>
  );
}

/** "Nice work! This practice is finished." — shown when the practice already ended (two tabs, a double click). */
export function PracticeFinished() {
  const t = useT();
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <p className="text-4xl" aria-hidden="true">🎉</p>
      <h2 className="mt-2 text-2xl font-bold text-brand-navy">{t("Nice work! This practice is finished.")}</h2>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className="min-h-[44px] rounded-xl bg-brand-navy px-6 py-3 text-lg font-semibold text-white hover:bg-brand-purple">{t("New practice")}</button>
        <a href="/student" className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-slate-300 px-6 py-3 text-lg font-semibold text-brand-navy">{t("Back to My Work")}</a>
      </div>
    </div>
  );
}
