"use client";
import Link from "next/link";
import { useState } from "react";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import type { ClientQuestion } from "@/server/practice/items";
import type { ArticleResult } from "@/server/readmaster/service";

const LV: Record<string, string> = { BELOW: "Below Level", ON: "On Level", ABOVE: "Above Level" };

/** Reads one ReadMaster version, answers its questions once, shows the score and the Lexile change. */
export function ReadMasterPlayer({ articleId, versionId, questions, submit }: {
  articleId: string; versionId: string; questions: ClientQuestion[];
  submit: (articleId: string, versionId: string, responses: Record<string, unknown>) => Promise<{ ok: true; result: ArticleResult } | { ok: false; error: string }>;
}) {
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [result, setResult] = useState<ArticleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = questions.every((q) => isAnswerReady(q, values[q.questionId] ?? null));
  const send = async () => {
    setBusy(true); setError(null);
    const r = await submit(articleId, versionId, values as Record<string, unknown>);
    setBusy(false);
    if (r.ok) setResult(r.result); else setError(r.error);
  };
  return (
    <div className="space-y-5">
      {questions.map((q, i) => {
        const rv = result?.review.find((x) => x.questionId === q.questionId);
        return (
          <section key={q.questionId} className={`rounded-2xl bg-white p-5 ring-1 ${rv ? (rv.correct ? "animate-pop ring-2 ring-emerald-400" : "animate-shake ring-2 ring-red-300") : "ring-slate-200"}`}>
            <p className="font-semibold text-slate-900">{i + 1}. {q.stem}</p>
            <div className="mt-3"><AnswerInput q={q} value={values[q.questionId] ?? null} onChange={(v) => setValues((s) => ({ ...s, [q.questionId]: v }))} disabled={Boolean(result) || busy} /></div>
            {rv && <p className={`mt-3 text-sm ${rv.correct ? "text-emerald-800" : "text-red-800"}`}>{rv.correct ? "✓ Correct." : `✗ The answer is: ${rv.correctAnswer}.`} {rv.why}</p>}
          </section>
        );
      })}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}
      {!result ? (
        <button onClick={send} disabled={!ready || busy} className="rounded-xl bg-brand-navy px-6 py-3 text-lg font-semibold text-white disabled:opacity-50">{busy ? "Checking…" : "Submit my answers"}</button>
      ) : (
        <section role="status" className="animate-pop rounded-3xl bg-gradient-to-br bg-linear-to-br from-amber-50 to-white p-6 ring-2 ring-amber-300 shadow">
          <p className="text-2xl font-bold text-brand-navy">{result.correct} of {result.total} correct ({result.pct}%)</p>
          <p className="mt-1 text-lg">My reading Lexile: <b>{result.lexileBefore}L → {result.lexileAfter}L</b> {result.lexileAfter > result.lexileBefore ? "⬆" : result.lexileAfter < result.lexileBefore ? "⬇" : ""}</p>
          {result.levelAfter && result.levelAfter !== result.levelBefore && <p className="mt-1 font-semibold text-emerald-800">Next articles: {LV[result.levelAfter]} version.</p>}
          <p className="mt-1 text-sm text-slate-600">75% or more raises your Lexile; under 50% lowers it.</p>
          <Link href="/student/readmaster" className="mt-3 inline-block rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white">More articles</Link>
        </section>
      )}
    </div>
  );
}
