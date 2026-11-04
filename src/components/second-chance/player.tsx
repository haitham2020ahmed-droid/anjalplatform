"use client";
import { OFFLINE_MESSAGE } from "@/lib/answer-send";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import { AnswerFx, CelebrateFx } from "@/components/feedback-fx/answer-fx";
import { EmptyState } from "@/components/ui-kit";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { useT } from "@/i18n/client";
import { answerSecondChanceAction } from "@/app/student/second-chance/actions";
import type { ChanceQuestion, ChanceResult, ChanceSource } from "@/server/second-chance/service";
import { RichInline } from "@/components/rich-inline";

const SOURCE: Record<ChanceSource, string> = { PRACTICE: "From practice", TEST: "From a test", READMASTER: "From ReadMaster", READRISE: "From ReadRise", QOTD: "From the Question of the Day", EXIT: "From an exit ticket", GAME: "From a game" };

/**
 * ⭐ One question at a time: answer → sound + encouragement (AnswerFx). Right = it leaves the list
 * ("Great! You fixed 3 mistakes 🌟"); not yet = try again or go to the next one (it stays on the list).
 */
export function SecondChancePlayer({ questions, total }: { questions: ChanceQuestion[]; total: number }) {
  const t = useT();
  const router = useRouter();
  const [list, setList] = useState(questions);
  const [i, setI] = useState(0);
  const [v, setV] = useState<AnswerValue>(null);
  const [res, setRes] = useState<ChanceResult | null>(null);
  const [tries, setTries] = useState(0);
  const [fixed, setFixed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fixedMsg = fixed === 1 ? t("Great! You fixed 1 mistake 🌟") : t("Great! You fixed {n} mistakes 🌟", { n: fixed });
  if (!list.length) {
    return (
      <div className="space-y-4">
        {fixed > 0 && <CelebrateFx />}
        <EmptyState icon="🌟" title={fixed > 0 ? fixedMsg : "No mistakes waiting — great job!"}
          text={total - fixed > 0 ? "More questions are waiting. Load the next ones!" : "When you get a question wrong, it comes here so you can try it again."}>
          {total - fixed > 0 && <button type="button" onClick={() => router.refresh()} className={`${BTN_PRIMARY} mt-3`}>{t("More questions")}</button>}
        </EmptyState>
      </div>
    );
  }
  const cur = list[Math.min(i, list.length - 1)];
  const q = cur.q;
  const next = (removeCurrent: boolean) => {
    setRes(null); setV(null); setErr(null); setTries(0);
    if (removeCurrent) { const rest = list.filter((x) => x.key !== cur.key); setList(rest); setI((n) => (rest.length ? n % rest.length : 0)); }
    else setI((n) => (n + 1) % list.length);
  };
  const check = async () => {
    setBusy(true); setErr(null);
    const sent = (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && !Array.isArray(v) ? q.elements ?? null : v;
    // r68: the button is always released, and a failed request shows a message here (never the full-page error)
    let r: Awaited<ReturnType<typeof answerSecondChanceAction>>;
    try { r = await answerSecondChanceAction(cur.key, sent); }
    catch { setErr(t(OFFLINE_MESSAGE)); return; }
    finally { setBusy(false); }
    if (!r.ok) { setErr(r.error); return; }
    setRes(r.value); setTries((n) => n + 1);
    if (r.value.correct) setFixed((n) => n + 1);
  };

  return (
    <section aria-label={t("Second Chance")} data-testid="second-chance" className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-900 ring-1 ring-sky-200"><bdi lang="en">{cur.skill}</bdi></span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{t(SOURCE[cur.source])}</span>
        <span className="ms-auto text-slate-500" dir="ltr">{Math.min(i, list.length - 1) + 1} / {list.length}</span>
      </div>
      {fixed > 0 && !res && <p role="status" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-amber-50 px-4 font-bold text-amber-900 ring-1 ring-amber-200">{fixedMsg}</p>}
      <div data-content lang="en" className="mt-3">
        {q.passage && (
          <details className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <summary className="min-h-11 cursor-pointer content-center font-semibold text-brand-navy">📖 <RichInline text={q.passage.title || "Read the text"} /></summary>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-800"><RichInline text={q.passage.text} /></p>
          </details>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {q.image && <img src={q.image.url} alt={q.image.alt} className="mt-3 max-h-64 rounded-xl" />}
        {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <h2 className="mt-3 text-xl font-medium text-slate-900"><RichInline text={q.stem} /></h2>}
        <div className="mt-4"><AnswerInput key={`${cur.key}:${tries}`} q={q} value={v} onChange={setV} disabled={busy || Boolean(res)} /></div>
      </div>
      {res && (
        <div className="mt-4 space-y-2">
          <AnswerFx scope="second-chance" correct={res.correct} answerKey={`chance|${cur.key}|${tries}`} />
          {res.correct ? <p role="status" className="text-lg font-bold text-emerald-700">{fixedMsg}</p> : (
            <details className="rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-brand-teal">{t("See the answer")}</summary>
              <p data-content lang="en" className="mt-1 text-slate-800"><b><RichInline text={res.correctAnswer} /></b>{res.why ? <> — <RichInline text={res.why} /></> : null}</p>
            </details>
          )}
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-red-700">{err}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!res ? (
          <>
            <button type="button" disabled={busy || !isAnswerReady(q, v)} onClick={check} className={`${BTN_PRIMARY} disabled:opacity-50`}>{busy ? t("Checking…") : t("Check")}</button>
            {list.length > 1 && <button type="button" onClick={() => next(false)} className={BTN_SECONDARY}>{t("Skip for now")}</button>}
          </>
        ) : res.correct ? (
          <button type="button" onClick={() => next(true)} className={BTN_PRIMARY}>{list.length > 1 ? t("Next question") : t("Finish")}</button>
        ) : (
          <>
            <button type="button" onClick={() => { setRes(null); setV(null); }} className={BTN_PRIMARY}>{t("Try again")}</button>
            {list.length > 1 && <button type="button" onClick={() => next(false)} className={BTN_SECONDARY}>{t("Next question")}</button>}
          </>
        )}
      </div>
    </section>
  );
}
