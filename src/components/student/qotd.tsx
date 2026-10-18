"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import type { ClientQuestion } from "@/server/practice/items";
import { answerQotdAction } from "@/app/student/qotd-actions";
import { CoinIcon } from "@/components/motivation/avatar";
import { useT } from "@/i18n/client";
import { AnswerFx } from "@/components/feedback-fx/answer-fx";
import { LineIcon } from "@/components/ui/line-icon";
import { RichInline } from "@/components/rich-inline";

export interface QotdResult { correct: boolean; coins: number; correctAnswer: string; why: string }

/**
 * The Question of the Day (Games Part 3): one compact strip on the student home — the skill, "Challenge question",
 * the coins and an Answer button. A tap opens the question in place (one try). Right = a big coin reward; wrong =
 * the correct answer and a short explanation on demand. Once answered it stays one line. The student never sees
 * a level word (Below / On / Above) here: the challenge is only called "Challenge question". The question stays English.
 */
export function QuestionOfTheDay({ q, area, answered, result }: { q: ClientQuestion; area: string; answered: boolean; result?: QotdResult | null }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<AnswerValue>(null);
  const [res, setRes] = useState<QotdResult | null>(result ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // answered just now (not on an earlier visit): sound + a phrase once
  const [fresh, setFresh] = useState(false);
  const done = res ?? (answered ? null : undefined);
  const title = (
    <span className="flex items-center gap-2.5 font-display text-lg text-ink">
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200/70"><LineIcon name="question" className="h-[18px] w-[18px]" /></span>
      {t("Question of the Day")}
    </span>
  );
  if (done !== undefined) {
    // one line: the verdict, the coins, and (when wrong) the answer with its explanation on demand
    return (
      <section data-testid="qotd" data-state="answered" aria-label={t("Question of the Day")} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-[1.25rem] bg-amber-50 px-4 py-2 text-sm ring-1 ring-amber-200/70">
        {title}
        {done ? (
          <>
            <span className={`font-semibold ${done.correct ? "text-emerald-700" : "text-slate-700"}`}>{done.correct ? t("Correct!") : t("Not this time.")}</span>
            {fresh && <AnswerFx scope="qotd" correct={done.correct} answerKey={`qotd|${q.questionId}`} />}
            <span className="inline-flex items-center gap-1 font-semibold text-amber-800"><CoinIcon size={14} /><span dir="ltr">+{done.coins}</span></span>
            {!done.correct && (
              <details className="min-w-0 basis-full sm:basis-auto">
                <summary className="cursor-pointer font-semibold text-brand-teal">{t("See the answer")}</summary>
                <p data-content lang="en" className="mt-1 text-slate-800"><b><RichInline text={done.correctAnswer} /></b>{done.why ? <> — <RichInline text={done.why} /></> : null}</p>
              </details>
            )}
          </>
        ) : <span className="text-slate-600">{t("Done for today ✓")}</span>}
        <span className="ms-auto text-xs text-slate-500">{t("A new question tomorrow")}</span>
      </section>
    );
  }
  return (
    <section data-testid="qotd" data-state={open ? "open" : "closed"} aria-labelledby="qotd-h" className="rounded-[1.25rem] bg-amber-50 ring-1 ring-amber-200/70">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <h2 id="qotd-h">{title}</h2>
        <span className="min-w-0 truncate text-ink-2"><bdi>{area}</bdi> · {t("Challenge question")}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800"><CoinIcon size={14} /> {t("Up to {n} coins · one try", { n: 20 })}</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="qotd-body"
          className="ms-auto min-h-10 rounded-xl bg-brand-navy px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110">{open ? t("Close") : t("Answer")}</button>
      </div>
      {open && (
        <div id="qotd-body" className="rounded-b-[1.25rem] border-t border-amber-200/70 bg-surface px-4 pb-4 pt-3">
          <div data-content lang="en">
            {q.passage && <details className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200/70"><summary className="cursor-pointer font-semibold text-slate-700"><RichInline text={q.passage.title || "Read the text"} /></summary><p className="mt-2 whitespace-pre-line"><RichInline text={q.passage.text} /></p></details>}
            {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="mt-3 text-base font-medium text-slate-900"><RichInline text={q.stem} /></p>}
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
        </div>
      )}
    </section>
  );
}
