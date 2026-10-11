/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/** Interactive wrapper: holds the answer, calls the server actions, swaps in the next question. */
import { useState, useTransition } from "react";
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

  const check = () =>
    start(async () => {
      if (!shown) return;
      const response = (shown.type === "SENTENCE_ORDER" || shown.type === "WORD_ORDER") && !Array.isArray(value) ? shown.elements : value;
      // a weak connection: try again twice (the server accepts each answer once, so a retry is safe)
      let r: Awaited<ReturnType<Submit>> | null = null;
      for (let i = 0; i < 3 && !r; i++) { try { r = await submit({ sessionId: view.sessionId, questionId: shown.questionId, response }); } catch { await new Promise((ok) => setTimeout(ok, 1200)); } }
      if (!r) return setError("No connection. Your answer was not sent: check the internet and press Check again.");
      if (r.error) return setError(r.error);
      setError(null);
      setFeedback(r.feedback!);
      setView(r.view!);
    });

  const next = () => {
    setShown(view.question);
    setValue(null);
    setFeedback(null);
    setHintText(null);
    setHints([]);
    window.scrollTo({ top: 0 });
  };

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
