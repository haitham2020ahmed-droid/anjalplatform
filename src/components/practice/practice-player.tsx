/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/** Interactive wrapper: holds the answer, calls the server actions, swaps in the next question. */
import { useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { ClientQuestion } from "../../server/practice/items";
import type { Feedback, PracticeView } from "../../server/practice/session";
import { isAnswerReady, type AnswerValue } from "./answer-input";
import { PracticeFrame } from "./practice-frame";
import { WordLookup } from "../learn/word-lookup";
import { FlagButton } from "../learn/flag-button";

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
  const [ended, setEnded] = useState(false);
  const sending = useRef(false); // one answer at a time (double clicks), before React shows "Checking…"

  const check = () => {
    if (sending.current || pending) return;
    sending.current = true;
    start(async () => {
      try { await send(); } finally { sending.current = false; }
    });
  };
  const send = async () => {
      if (!shown) return;
      const response = (shown.type === "SENTENCE_ORDER" || shown.type === "WORD_ORDER") && !Array.isArray(value) ? shown.elements : value;
      // a weak connection: try again twice (the server accepts each answer once, so a retry is safe)
      let r: Awaited<ReturnType<Submit>> | null = null;
      for (let i = 0; i < 3 && !r; i++) { try { r = await submit({ sessionId: view.sessionId, questionId: shown.questionId, response }); } catch { await new Promise((ok) => setTimeout(ok, 1200)); } }
      if (!r) return setError("No connection. Your answer was not sent: check the internet and press Check again.");
      if (r.error) return setError(r.error);
      setError(null);
      // the practice had already finished (another tab or a second click): a friendly card, nothing changed
      if (r.feedback?.alreadyEnded) { setEnded(true); if (r.view) setView(r.view); return; }
      setFeedback(r.feedback!);
      setView(r.view!);
  };

  const next = () => {
    setShown(view.question);
    setValue(null);
    setFeedback(null);
    setHintText(null);
    setHints([]);
    window.scrollTo({ top: 0 });
  };

  if (ended) return <PracticeFinished />;
  return (
    <WordLookup>
      <PracticeFrame view={view} shownQuestion={shown} value={value} onChange={setValue} feedback={feedback}
        ready={!!shown && isAnswerReady(shown, value)} pending={pending} error={error} onCheck={check} onNext={next} unitHref={unitHref} />
      {shown && hint && !feedback && (
        <div className="mx-auto mt-3 max-w-5xl">
          {hints.map((h) => <p key={h.level} className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">💡 <span className="font-semibold">Hint {h.level}:</span> {h.text}</p>)}
          {hintText && !hints.length && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">💡 {hintText}</p>}
          {(!hints.length || hints[hints.length - 1].level < hints[hints.length - 1].max) && !(hintText && !hints.length) && (
            <button type="button" className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-50"
              onClick={async () => { const r = await hint(view.sessionId, shown.questionId); if (r.hint) { if (r.level) setHints((x) => [...x.filter((h) => h.level !== r.level), { text: r.hint!, level: r.level!, max: r.maxLevel ?? 3 }]); else setHintText(r.hint); } else if (r.error) setError(r.error); }}>
              💡 {hints.length ? "Another hint" : "Show a hint"} <span className="text-xs text-amber-700">(this answer will count half)</span>
            </button>
          )}
        </div>
      )}
      {shown && <div className="mx-auto max-w-5xl"><FlagButton key={shown.questionId} questionId={shown.questionId} /></div>}
    </WordLookup>
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
