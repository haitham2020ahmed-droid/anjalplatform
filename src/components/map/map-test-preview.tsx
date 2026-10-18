"use client";
import { useState } from "react";
import { AnswerInput, type AnswerValue } from "@/components/practice/answer-input";
import { PassageText } from "@/components/passage-text";
import { useT } from "@/i18n/client";
import type { ClientQuestion } from "@/server/practice/items";
import { RichInline } from "@/components/rich-inline";

/**
 * The teacher's preview of a manual MAP test: the same screen as the students' test player (one question per screen,
 * the passage beside it, no right / wrong, no hints). The teacher can step back and forth; nothing is saved.
 */
export function MapTestPreview({ title, subject, questions }: { title: string; subject: string; questions: ClientQuestion[] }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [value, setValue] = useState<AnswerValue>(null);
  const q = questions[i];
  const go = (n: number) => { setI(Math.max(0, Math.min(questions.length - 1, n))); setValue(null); };
  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">👁 {t("Preview: this is what students see. Nothing is saved.")}</p>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">{t("MAP Test")} · {t(subject === "LANGUAGE" ? "Language Usage" : "Reading")} · <bdi>{title}</bdi></p>
          <h1 className="text-2xl font-bold text-brand-navy">{t("Question {n} of {total}", { n: i + 1, total: questions.length })}</h1>
        </div>
        <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200" aria-hidden="true"><div className="h-full bg-brand-teal" style={{ width: `${Math.round((100 * i) / questions.length)}%` }} /></div>
      </header>
      <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
        {q.passage && (
          <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200" aria-label={t("Reading passage")}>
            <h2 className="text-xl font-bold text-brand-navy"><RichInline text={q.passage.title} /></h2>
            <PassageText text={q.passage.text} />
          </article>
        )}
        <div>
          {q.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.image.url} alt={q.image.alt} className="mb-4 max-h-[50vh] w-auto max-w-full rounded-xl bg-white ring-1 ring-slate-200" />
          )}
          {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900"><RichInline text={q.stem} /></p>}
          <div className="mt-5"><AnswerInput key={q.questionId} q={q} value={value} onChange={setValue} disabled={false} /></div>
          <div className="mt-6 flex gap-2">
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className="rounded-xl px-5 py-3 font-semibold text-slate-700 ring-1 ring-slate-300 disabled:opacity-40">◀ {t("Back")}</button>
            <button type="button" onClick={() => go(i + 1)} disabled={i === questions.length - 1} className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white disabled:opacity-50">{t("Next")} ▶</button>
          </div>
          <p className="mt-3 text-sm text-slate-500">{t("Students cannot go back to a question. There is no time limit.")}</p>
        </div>
      </div>
    </div>
  );
}
