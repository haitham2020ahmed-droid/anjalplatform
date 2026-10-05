/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState, useTransition } from "react";
import type { DiagnosticView } from "../../server/assessment/diagnostic";
import { isAnswerReady, type AnswerValue } from "../practice/answer-input";
import { PlacementFrame } from "./placement-frame";
import { PlacementResult } from "./placement-result";

type Submit = (input: { sessionId: string; questionId: string; response: unknown }) => Promise<{ view?: DiagnosticView; error?: string }>;

export function PlacementPlayer({ initial, firstName, submit }: { initial: DiagnosticView; firstName: string; submit: Submit }) {
  const [view, setView] = useState(initial);
  const [value, setValue] = useState<AnswerValue>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (view.result) return <PlacementResult r={view.result} firstName={firstName} />;
  if (!view.question) return <p className="text-lg">This placement check is finished.</p>;
  const q = view.question;
  const next = () =>
    start(async () => {
      const response = (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && !Array.isArray(value) ? q.elements : value;
      const r = await submit({ sessionId: view.sessionId, questionId: q.questionId, response });
      if (r.error) return setError(r.error);
      setError(null);
      setValue(null);
      setView(r.view!);
      window.scrollTo({ top: 0 });
    });
  return <PlacementFrame q={q} answered={view.answered} max={view.maxQuestions} value={value} onChange={setValue} ready={isAnswerReady(q, value)} pending={pending} error={error} onNext={next} />;
}
