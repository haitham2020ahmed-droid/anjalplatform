/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Practice screen layout (pure): skill + progress + mastery on top, the question in the
 * centre, the answer area below, the action button at the bottom. No other distractions.
 */
import type { ClientQuestion } from "../../server/practice/items";
import type { Feedback, PracticeView } from "../../server/practice/session";
import type { MasteryBandName } from "../../types/domain";
import { BandMeter } from "../curriculum/band-meter";
import { AnswerInput, type AnswerValue } from "./answer-input";
import { FeedbackPanel } from "./feedback-panel";

const END_TEXT: Record<string, string> = {
  COMPLETED: "Great work. You finished this practice set.",
  ALL_QUESTIONS_ANSWERED: "You have answered every question for this skill. More questions are on the way.",
  POOL_EXHAUSTED: "You have answered every question available right now. More questions are on the way.",
  PREREQ_ROUTE: "Let's build a skill that will make this one easier.",
  STUDENT_EXIT: "Practice saved. You can continue any time.",
};

export function PracticeFrame(props: {
  view: PracticeView;
  shownQuestion: ClientQuestion | null; // stays visible while feedback shows
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  feedback: Feedback | null;
  ready: boolean;
  pending: boolean;
  error: string | null;
  onCheck: () => void;
  onNext: () => void;
  unitHref: string;
}) {
  const { view, shownQuestion: q, feedback: fb } = props;
  const finished = view.ended && (!fb || !fb.next.hasQuestion);
  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          <a href={props.unitHref} className="text-sm font-medium text-brand-teal hover:underline">Leave practice</a>
          <h1 className="truncate text-2xl font-bold text-brand-navy">{view.skillName}</h1>
          <p className="text-sm text-slate-500">{view.answered} answered, {view.correct} correct</p>
        </div>
        <div className="w-64"><BandMeter band={view.band as MasteryBandName} score={view.mastery} started={view.answered > 0 || view.mastery > 0} /></div>
      </header>

      {q && (
        <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
          {q.passage && (
            <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:sticky lg:top-4" aria-label="Reading passage">
              <h2 className="text-xl font-bold text-brand-navy">{q.passage.title}</h2>
              {q.passage.text.split("\n\n").map((para, i) => (
                <p key={i} className="mt-3 whitespace-pre-line text-lg leading-relaxed text-slate-800">{para}</p>
              ))}
            </article>
          )}
          <div>
            {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900">{q.stem}</p>}
            <div className="mt-5"><AnswerInput q={q} value={props.value} onChange={props.onChange} disabled={!!fb || props.pending} /></div>
            {props.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{props.error}</p>}
            <div className="mt-6">{fb && <FeedbackPanel fb={fb} />}</div>
            <div className="mt-6 flex flex-wrap gap-3">
              {!fb && (
                <button type="button" onClick={props.onCheck} disabled={!props.ready || props.pending}
                  className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white hover:bg-brand-purple disabled:cursor-not-allowed disabled:opacity-40">
                  {props.pending ? "Checking…" : "Check answer"}
                </button>
              )}
              {fb && fb.next.hasQuestion && (
                <button type="button" onClick={props.onNext} autoFocus className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white hover:bg-brand-purple">Next question</button>
              )}
              {fb && !fb.next.hasQuestion && fb.next.routeToSkillId && (
                <a href={`/practice/${fb.next.routeToSkillId}`} className="rounded-xl bg-brand-purple px-6 py-3 text-lg font-semibold text-white">Practise {fb.next.routeToSkillName}</a>
              )}
              {fb && !fb.next.hasQuestion && (
                <a href={props.unitHref} className="rounded-xl border-2 border-slate-300 px-6 py-3 text-lg font-semibold text-brand-navy">Back to my skills</a>
              )}
            </div>
            {fb && !fb.next.hasQuestion && fb.next.endReason && <p className="mt-4 text-lg text-slate-700">{END_TEXT[fb.next.endReason]}</p>}
          </div>
        </div>
      )}
      {!q && finished && (
        <div className="mt-10 rounded-2xl bg-white p-8 ring-1 ring-slate-200">
          <p className="text-xl text-slate-800">{END_TEXT[view.endReason ?? "STUDENT_EXIT"]}</p>
          <a href={props.unitHref} className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">Back to my skills</a>
        </div>
      )}
    </div>
  );
}
