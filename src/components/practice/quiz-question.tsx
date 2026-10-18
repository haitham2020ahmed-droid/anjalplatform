"use client";
import type { ReactNode } from "react";
import { AnswerInput, type AnswerValue } from "@/components/practice/answer-input";
import { PassageText, plainPassage } from "@/components/passage-text";
import { ListenButton } from "@/components/listen-button";
import { RichInline } from "@/components/rich-inline";
import type { ClientQuestion } from "@/server/practice/items";

/**
 * One question of the quiz player as the student sees it: the passage beside it (wide screens), the picture, the
 * question, 🔊 Listen and the answer area; `children` follow the answer (feedback, buttons). Used by the quiz player
 * and by the teacher's "Preview as student" (the same component, also printed question by question).
 */
export function QuizQuestion({ q, value, onChange, disabled, children }: { q: ClientQuestion; value: AnswerValue; onChange: (v: AnswerValue) => void; disabled: boolean; children?: ReactNode }) {
  return (
    <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
      {q.passage && (
        <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:sticky lg:top-4 print:max-h-none" aria-label="Reading passage">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold text-brand-navy"><RichInline text={q.passage.title} /></h2><ListenButton text={`${q.passage.title}. ${plainPassage(q.passage.text)}`} label="Listen to the text" /></div>
          <PassageText text={q.passage.text} paraClassName="mt-3 whitespace-pre-line text-lg leading-relaxed text-slate-800" />
        </article>
      )}
      <div>
        {q.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.image.url} alt={q.image.alt} className="mb-4 max-h-[50vh] w-auto max-w-full rounded-xl bg-white ring-1 ring-slate-200" />
        )}
        {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900"><RichInline text={q.stem} /></p>}
        <ListenButton text={[q.stem, ...(q.options ?? []).map((o) => `${o.label}. ${o.text}`)].join(". ")} label="Listen to the question" className="mt-2" />
        <div className="mt-5"><AnswerInput q={q} value={value} onChange={onChange} disabled={disabled} /></div>
        {children}
      </div>
    </div>
  );
}
