"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import type { ClientQuestion } from "@/server/practice/items";
import { answerQotdAction } from "@/app/student/qotd-actions";
import { CoinIcon } from "@/components/motivation/avatar";
import { useT } from "@/i18n/client";
import { AnswerFx } from "@/components/feedback-fx/answer-fx";

export interface QotdResult { correct: boolean; coins: number; correctAnswer: string; why: string }
const LEVEL_LABEL = { ON: "On Level", ABOVE: "Above Level", HARDEST: "Hardest" } as const;

/**
 * ☀️ The Question of the Day (Games Part 3): one small card under the welcome line. One level above the student's
 * level, one try. Right = a big coin reward; wrong = the correct answer and a short explanation. Once answered the
 * card shrinks to one line (the explanation folds open on demand). The question itself stays English.
 */
export function QuestionOfTheDay({ q, area, answered, level, result }: { q: ClientQuestion; area: string; answered: boolean; level?: "ON" | "ABOVE" | "HARDEST" | null; result?: QotdResult | null }) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState<AnswerValue>(null);
  const [res, setRes] = useState<QotdResult | null>(result ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // answered just now (not on an earlier visit): sound + a phrase once
  const [fresh, setFresh] = useState(false);
  const done = res ?? (answered ? null : undefined);
  if (done !== undefined) {
    // one line: the verdict, the coins, and (when wrong) the answer with its explanation on demand
    return (
      <section data-testid="qotd" data-state="answered" aria-label={t("Question of the Day")} className="mt-3 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-amber-50/70 px-4 py-2 text-sm ring-1 ring-amber-200">
        <span className="font-semibold text-brand-navy"><span aria-hidden="true">☀️ </span>{t("Question of the Day")}</span>
        {done ? (
          <>
            <span className={`font-semibold ${done.correct ? "text-emerald-700" : "text-amber-900"}`}>{done.correct ? t("Correct!") : t("Not this time.")}</span>
            {fresh && <AnswerFx scope="qotd" correct={done.correct} answerKey={`qotd|${q.questionId}`} />}
            <span className="inline-flex items-center gap-1 font-semibold text-amber-900"><CoinIcon size={16} /><span dir="ltr">+{done.coins}</span></span>
            {!done.correct && (
              <details className="min-w-0 basis-full sm:basis-auto">
                <summary className="cursor-pointer font-semibold text-brand-teal">{t("See the answer")}</summary>
                <p data-content lang="en" className="mt-1 text-slate-800"><b>{done.correctAnswer}</b>{done.why ? <> — {done.why}</> : null}</p>
              </details>
            )}
          </>
        ) : <span className="text-slate-700">{t("Done for today ✓")}</span>}
        <span className="ms-auto text-slate-500">{t("A new question tomorrow")}</span>
      </section>
    );
  }
  return (
    <section data-testid="qotd" data-state="open" aria-labelledby="qotd-h" className="mt-3 rounded-2xl bg-gradient-to-br bg-linear-to-br from-amber-50 to-white p-4 ring-1 ring-amber-200 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="qotd-h" className="font-semibold text-brand-navy"><span aria-hidden="true">☀️ </span>{t("Question of the Day")}</h2>
        <span className="text-sm text-slate-600"><bdi>{area}</bdi>{level ? <> · {t("Challenge: {level}", { level: t(LEVEL_LABEL[level]) })}</> : null}</span>
        <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"><CoinIcon size={16} /> {t("Up to {n} coins · one try", { n: 20 })}</span>
      </div>
      <div data-content lang="en">
        {q.passage && <details className="mt-2 rounded-xl bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">📖 {q.passage.title || "Read the text"}</summary><p className="mt-2 whitespace-pre-line">{q.passage.text}</p></details>}
        {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="mt-2 text-lg font-medium text-slate-900">{q.stem}</p>}
        <div className="mt-3"><AnswerInput q={q} value={v} onChange={setV} disabled={busy} /></div>
      </div>
      <button type="button" disabled={busy || !isAnswerReady(q, v)}
        onClick={async () => {
          setBusy(true); setErr(null);
          const r = await answerQotdAction(q.questionId, (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && !Array.isArray(v) ? q.elements : v);
          setBusy(false);
          if (r.ok) { setFresh(true); setRes({ correct: r.value.correct, coins: r.coins, correctAnswer: r.value.correctAnswer, why: r.value.why }); router.refresh(); } else setErr(r.error);
        }}
        className="mt-3 min-h-11 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white disabled:opacity-50">{busy ? t("Checking…") : t("Check")}</button>
      {err && <p role="alert" className="mt-2 text-red-700">{err}</p>}
    </section>
  );
}
