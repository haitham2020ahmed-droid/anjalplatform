/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/** Interactive wrapper: holds the answer, calls the server actions, swaps in the next question. */
import { useState, useTransition } from "react";
import type { ClientQuestion } from "../../server/practice/items";
import type { Feedback, PracticeView } from "../../server/practice/session";
import { isAnswerReady, type AnswerValue } from "./answer-input";
import { PracticeFrame } from "./practice-frame";

type Submit = (input: { sessionId: string; questionId: string; response: unknown }) => Promise<{ feedback?: Feedback; view?: PracticeView; error?: string }>;

export function PracticePlayer({ initial, unitHref, submit }: { initial: PracticeView; unitHref: string; submit: Submit }) {
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
      const r = await submit({ sessionId: view.sessionId, questionId: shown.questionId, response });
      if (r.error) return setError(r.error);
      setError(null);
      setFeedback(r.feedback!);
      setView(r.view!);
    });

  const next = () => {
    setShown(view.question);
    setValue(null);
    setFeedback(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <PracticeFrame view={view} shownQuestion={shown} value={value} onChange={setValue} feedback={feedback}
      ready={!!shown && isAnswerReady(shown, value)} pending={pending} error={error} onCheck={check} onNext={next} unitHref={unitHref} />
  );
}
