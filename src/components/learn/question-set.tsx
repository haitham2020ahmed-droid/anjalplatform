"use client";
import Link from "next/link";
import { useState } from "react";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import { PassageText } from "@/components/passage-text";
import { ListenButton } from "@/components/listen-button";
import type { ClientQuestion } from "@/server/practice/items";
import type { Graded } from "@/server/teacher/worksheet";
import { FlagButton } from "./flag-button";
import { WordLookup } from "./word-lookup";

type Result = { correct: number; total: number; review: Graded[] };

/** A short set of questions answered together (exit ticket, review of mistakes): submit once, see what was right. */
export function QuestionSet({ id, questions, submit, doneHref, doneLabel = "Back to my work", resultNote }: {
  id: string; questions: ClientQuestion[]; doneHref: string; doneLabel?: string; resultNote?: string;
  submit: (id: string, responses: Record<string, unknown>) => Promise<{ ok: true; value: Result } | { ok: false; error: string }>;
}) {
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = questions.every((q) => isAnswerReady(q, values[q.questionId] ?? null));
  const send = async () => {
    setBusy(true); setError(null);
    const responses: Record<string, unknown> = {};
    for (const q of questions) { const v = values[q.questionId] ?? null; responses[q.questionId] = (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && !Array.isArray(v) ? q.elements : v; }
    const r = await submit(id, responses);
    setBusy(false);
    if (r.ok) setResult(r.value); else setError(r.error);
  };
  const passages = new Set<string>();
  return (
    <WordLookup>
      <div className="space-y-5">
        {questions.map((q, i) => {
          const rv = result?.review.find((x) => x.questionId === q.questionId);
          const showPassage = q.passage && !passages.has(q.passage.text);
          if (q.passage) passages.add(q.passage.text);
          return (
            <section key={q.questionId} className={`rounded-2xl bg-white p-5 ring-1 ${rv ? (rv.correct ? "ring-2 ring-emerald-400" : "ring-2 ring-red-300") : "ring-slate-200"}`}>
              {showPassage && q.passage && <details open className="mb-3 rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer font-bold text-brand-navy">📖 {q.passage.title || "Read the text"}</summary><PassageText text={q.passage.text} /></details>}
              {q.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.image.url} alt={q.image.alt} className="mb-3 max-h-80 w-auto max-w-full rounded-xl ring-1 ring-slate-200" />
              )}
              <p className="font-semibold text-slate-900">{i + 1}. {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" ? q.stem : ""}</p>
              <ListenButton text={[q.stem, ...(q.options ?? []).map((o) => `${o.label}. ${o.text}`)].join(". ")} label="Listen" className="mt-1" />
              <div className="mt-3"><AnswerInput q={q} value={values[q.questionId] ?? null} onChange={(v) => setValues((s) => ({ ...s, [q.questionId]: v }))} disabled={Boolean(result) || busy} /></div>
              {rv && <p className={`mt-3 text-sm ${rv.correct ? "text-emerald-800" : "text-red-800"}`}>{rv.correct ? "✓ Correct." : `✗ The answer is: ${rv.correctAnswer}.`} {rv.why}</p>}
              {!result && <FlagButton questionId={q.questionId} />}
            </section>
          );
        })}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}
        {!result ? (
          <button onClick={() => void send()} disabled={!ready || busy} className="rounded-xl bg-brand-navy px-6 py-3 text-lg font-semibold text-white disabled:opacity-50">{busy ? "Checking…" : "Submit my answers"}</button>
        ) : (
          <section role="status" className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-emerald-50 to-white p-6 ring-2 ring-emerald-300">
            <p className="text-2xl font-bold text-brand-navy">{result.correct} of {result.total} correct {result.correct === result.total ? "🎉" : ""}</p>
            {resultNote && <p className="mt-1 text-slate-700">{resultNote}</p>}
            <Link href={doneHref} className="mt-3 inline-block rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white">{doneLabel}</Link>
          </section>
        )}
      </div>
    </WordLookup>
  );
}
