/** @jsxRuntime automatic */
/** @jsxImportSource react */
/** One placement question at a time. No right/wrong marks during the check. */
import type { ClientQuestion } from "../../server/practice/items";
import { AnswerInput, type AnswerValue } from "../practice/answer-input";
import { PassageText, plainPassage } from "@/components/passage-text";

export function PlacementFrame(props: {
  q: ClientQuestion;
  answered: number;
  max: number;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  ready: boolean;
  pending: boolean;
  error: string | null;
  onNext: () => void;
}) {
  const { q } = props;
  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-brand-navy">Placement check</h1>
        <p className="text-slate-600">Question {props.answered + 1}. Most students finish in about 20 questions. Do your best; there are no marks.</p>
        <div className="mt-3 h-2 w-full max-w-md rounded-full bg-slate-200" aria-hidden="true">
          <div className="h-2 rounded-full bg-brand-teal" style={{ width: `${Math.min(100, Math.round(((props.answered) / props.max) * 100))}%` }} />
        </div>
      </header>
      <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
        {q.passage && (
          <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200" aria-label="Reading passage">
            <h2 className="text-xl font-bold text-brand-navy">{q.passage.title}</h2>
            <PassageText text={q.passage.text} paraClassName="mt-3 whitespace-pre-line text-lg leading-relaxed text-slate-800" />
          </article>
        )}
        <div>
          {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900">{q.stem}</p>}
          <div className="mt-5"><AnswerInput q={q} value={props.value} onChange={props.onChange} disabled={props.pending} /></div>
          {props.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{props.error}</p>}
          <button type="button" onClick={props.onNext} disabled={!props.ready || props.pending}
            className="mt-6 rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white hover:bg-brand-purple disabled:cursor-not-allowed disabled:opacity-40">
            {props.pending ? "Saving…" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
