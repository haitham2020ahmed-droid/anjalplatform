"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import type { ClientQuestion } from "@/server/practice/items";
import type { ArticleResult } from "@/server/readmaster/service";
import { AnswerFx, CelebrateFx } from "@/components/feedback-fx/answer-fx";
import { RichInline } from "@/components/rich-inline";

const RANK: Record<string, number> = { BELOW: 0, ON: 1, ABOVE: 2 };

/** Reads one ReadMaster version, answers its questions once, shows the score and the Lexile change. */
export function ReadMasterPlayer({ articleId, versionId, questions, submit, practice = false, preview = false }: {
  articleId: string; versionId: string; questions: ClientQuestion[];
  /** a version below the student's own level: the result is saved as Practice and does not change their level */
  practice?: boolean;
  /** staff: see the questions as students do, without answering */
  preview?: boolean;
  submit: (articleId: string, versionId: string, responses: Record<string, unknown>, timing?: { elapsedMs: number; perQuestion: Record<string, number> }) => Promise<{ ok: true; result: ArticleResult } | { ok: false; error: string }>;
}) {
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  // ⏱ time per question (Update 39C): from the previous answer (the first from opening the article) to this one's
  // first answer — so a rapid guess on a ReadMaster question is seen like in practice
  const opened = useRef<number>(Date.now());
  const lastAt = useRef<number>(Date.now());
  const perQuestion = useRef<Record<string, number>>({});
  const stamp = (id: string) => { if (perQuestion.current[id] === undefined) { const t = Date.now(); perQuestion.current[id] = t - lastAt.current; lastAt.current = t; } };
  const [result, setResult] = useState<ArticleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = questions.every((q) => isAnswerReady(q, values[q.questionId] ?? null));
  const send = async () => {
    setBusy(true); setError(null);
    const r = await submit(articleId, versionId, values as Record<string, unknown>, { elapsedMs: Date.now() - opened.current, perQuestion: { ...perQuestion.current } });
    setBusy(false);
    if (r.ok) setResult(r.result); else setError(r.error);
  };
  return (
    <div className="space-y-5">
      {questions.map((q, i) => {
        const rv = result?.review.find((x) => x.questionId === q.questionId);
        return (
          <section key={q.questionId} className={`rounded-2xl bg-white p-5 ring-1 ${rv ? (rv.correct ? "animate-pop ring-2 ring-emerald-400" : "animate-shake ring-2 ring-red-300") : "ring-slate-200"}`}>
            <p className="font-semibold text-slate-900">{i + 1}. <RichInline text={q.stem} /></p>
            <div className="mt-3"><AnswerInput q={q} value={values[q.questionId] ?? null} onChange={(v) => { stamp(q.questionId); setValues((s) => ({ ...s, [q.questionId]: v })); }} disabled={Boolean(result) || busy || preview} /></div>
            {rv && <p className={`mt-3 text-sm ${rv.correct ? "text-emerald-800" : "text-red-800"}`}>{rv.correct ? "✓ Correct." : <>✗ The answer is: <RichInline text={rv.correctAnswer} />.</>} <RichInline text={rv.why} /></p>}
          </section>
        );
      })}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}
      {preview ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-slate-700 ring-1 ring-slate-200">Preview: students answer these questions here.</p>
      ) : !result ? (
        <button onClick={send} disabled={!ready || busy} className="rounded-xl bg-brand-navy px-6 py-3 text-lg font-semibold text-white disabled:opacity-50">{busy ? "Checking…" : practice ? "Submit my answers (practice)" : "Submit my answers"}</button>
      ) : (
        <section role="status" className="animate-pop rounded-3xl bg-gradient-to-br bg-linear-to-br from-amber-50 to-white p-6 ring-2 ring-amber-300 shadow">
          {result.total > 0 && result.correct === result.total ? <CelebrateFx className="mb-3" /> : <AnswerFx scope="readmaster" correct={result.correct * 2 >= result.total} answerKey={`${versionId}|${result.correct}|${result.total}`} className="mb-3" />}
          <p className="text-2xl font-bold text-brand-navy">{result.correct} of {result.total} correct ({result.pct}%)</p>
          {result.practice ? (
            <p className="mt-1 text-lg font-semibold text-amber-900">🧪 Practice: your level did not change. Read at your level to move up.</p>
          ) : <p className="mt-1 text-lg">My reading Lexile: <b>{result.lexileBefore}L → {result.lexileAfter}L</b> {result.lexileAfter > result.lexileBefore ? "⬆" : result.lexileAfter < result.lexileBefore ? "⬇" : ""}</p>}
          {!result.practice && result.levelAfter && result.levelAfter !== result.levelBefore && <p className="mt-1 font-semibold text-emerald-800">{RANK[result.levelAfter] > RANK[result.levelBefore ?? "ON"] ? "🚀 Great reading! Your next articles will be more challenging." : "Your next articles will give you a bit more support."}</p>}
          {!result.practice && <p className="mt-1 text-sm text-slate-600">75% or more raises your Lexile; under 50% lowers it.</p>}
          <Link href="/student/readmaster" className="mt-3 inline-block rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white">More articles</Link>
        </section>
      )}
    </div>
  );
}
