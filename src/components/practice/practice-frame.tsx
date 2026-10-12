import Link from "next/link";
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
import { CelebrateFx } from "../feedback-fx/answer-fx";
import { ListenButton } from "@/components/listen-button";
import { PassageText, plainPassage } from "@/components/passage-text";

const END_TEXT: Record<string, string> = {
  COMPLETED: "Great work. You finished this practice set.",
  ALL_QUESTIONS_ANSWERED: "You have answered every question for this skill. More questions are on the way.",
  POOL_EXHAUSTED: "You have answered every question available right now. More questions are on the way.",
  PREREQ_ROUTE: "Let's build a skill that will make this one easier.",
  STUDENT_EXIT: "Practice saved. You can continue any time.",
  LEVEL_CONFIRMED: "Great work. The platform is now sure of your level on this skill. Try your next step!",
  SKILL_FINISHED: "You finished this skill! 🎉",
  RETRY_LATER: "You tried again every question you missed. They come back next time.",
};
export const endText = (reason: string | null | undefined): string => END_TEXT[reason ?? "STUDENT_EXIT"] ?? END_TEXT.COMPLETED;
/** a finished practice that earns the small celebration (not a pause or a detour) — the same list as the server's FINISH_REASONS */
export const CELEBRATE: ReadonlySet<string> = new Set(["COMPLETED", "ALL_QUESTIONS_ANSWERED", "POOL_EXHAUSTED", "LEVEL_CONFIRMED", "SKILL_FINISHED", "RETRY_LATER"]);

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
  /** a finished practice after a wrong last answer: "Finish" (the student reads the feedback first) */
  onFinish?: () => void;
}) {
  const { view, shownQuestion: q, feedback: fb } = props;
  const finished = view.ended && (!fb || !fb.next.hasQuestion);
  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          <a href={props.unitHref} className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-brand-teal hover:underline">Leave practice</a>
          <h1 className="truncate text-2xl font-bold text-brand-navy">{view.skillName}</h1>
          <p className="text-sm text-slate-500">{view.answered} answered, {view.correct} correct</p>
        </div>
        <div className="w-64"><BandMeter band={view.band as MasteryBandName} score={view.mastery} started={view.answered > 0 || view.mastery > 0} /></div>
      </header>

      {q && (
        <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
          {q.passage && (
            <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:sticky lg:top-4" aria-label="Reading passage">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold text-brand-navy">{q.passage.title}</h2><ListenButton text={`${q.passage.title}. ${plainPassage(q.passage.text)}`} label="Listen to the text" /></div>
              <PassageText text={q.passage.text} />
            </article>
          )}
          <div>
            {q.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.image.url} alt={q.image.alt} className="mb-4 max-h-[50vh] w-auto max-w-full rounded-xl bg-white ring-1 ring-slate-200" />
            )}
            {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900">{q.stem}</p>}
            <ListenButton text={[q.stem, ...(q.options ?? []).map((o) => `${o.label}. ${o.text}`)].join(". ")} label="Listen to the question" className="mt-2" />
            <div className="mt-5"><AnswerInput q={q} value={props.value} onChange={props.onChange} disabled={!!fb || props.pending} /></div>
            {props.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{props.error}</p>}
            {fb && view.answered > 0 && view.answered % 15 === 0 && <p role="status" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-center text-lg font-semibold text-amber-900 ring-1 ring-amber-200">Great work! {view.answered} questions done. Take a deep breath 💪</p>}
            <div className="mt-6">{fb && <FeedbackPanel fb={fb} questionId={q.questionId} fxKey={`${view.sessionId}|${q.questionId}|${view.answered}`} />}</div>
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
                <Link href={`/practice/${fb.next.routeToSkillId}`} className="rounded-xl bg-brand-purple px-6 py-3 text-lg font-semibold text-white">Practise {fb.next.routeToSkillName}</Link>
              )}
              {fb && !fb.next.hasQuestion && props.onFinish && fb.next.endReason && CELEBRATE.has(fb.next.endReason) && (
                <button type="button" onClick={props.onFinish} autoFocus className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white hover:bg-brand-purple">Finish</button>
              )}
              {fb && !fb.next.hasQuestion && (
                <a href={props.unitHref} className="rounded-xl border-2 border-slate-300 px-6 py-3 text-lg font-semibold text-brand-navy">{props.unitHref === "/student" ? "Back to My Work" : "Back to my skills"}</a>
              )}
            </div>
            {fb && !fb.next.hasQuestion && fb.next.endReason && CELEBRATE.has(fb.next.endReason) && <div className="mt-4"><CelebrateFx /></div>}
            {fb && !fb.next.hasQuestion && fb.next.endReason && <p className="mt-4 text-lg text-slate-700">{endText(fb.next.endReason)}</p>}
          </div>
        </div>
      )}
      {!q && finished && (
        <div className="mt-10 rounded-2xl bg-white p-8 ring-1 ring-slate-200">
          <p className="text-xl text-slate-800">{endText(view.endReason)}</p>
          <a href={props.unitHref} className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">{props.unitHref === "/student" ? "Back to My Work" : "Back to my skills"}</a>
        </div>
      )}
    </div>
  );
}
