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
import { RichInline } from "@/components/rich-inline";

const END_TEXT: Record<string, string> = {
  COMPLETED: "Great work. You finished this practice set.",
  ALL_QUESTIONS_ANSWERED: "You have answered every question for this skill. More questions are on the way.",
  POOL_EXHAUSTED: "You have answered every question available right now. More questions are on the way.",
  PREREQ_ROUTE: "Let's build a skill that will make this one easier.",
  STUDENT_EXIT: "Practice saved. You can continue any time.",
  LEVEL_CONFIRMED: "Great work. The platform is now sure of your level on this skill. Try your next step!",
  SKILL_FINISHED: "You finished this skill! 🎉",
  WORK_MASTERED: "You mastered this skill — your work is Done! 🎉",
  RETRY_LATER: "You tried again every question you missed. They come back next time.",
};
export const endText = (reason: string | null | undefined): string => END_TEXT[reason ?? "STUDENT_EXIT"] ?? END_TEXT.COMPLETED;
/** a finished practice that earns the small celebration (not a pause or a detour) — the same list as the server's FINISH_REASONS */
export const CELEBRATE: ReadonlySet<string> = new Set(["WORK_MASTERED", "COMPLETED", "ALL_QUESTIONS_ANSWERED", "POOL_EXHAUSTED", "LEVEL_CONFIRMED", "SKILL_FINISHED", "RETRY_LATER"]);

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
  /** r67: after "take your time" the answer buttons wait a few seconds */
  locked?: boolean;
  /** r68: the answer is being sent again by itself (weak connection, busy server) */
  retrying?: boolean;
  /** r68: every try failed: a small "Try again" inside the player (never a full-page error); the answer stays */
  canRetry?: boolean;
  /** the interface language's translate function (the frame itself is shared with server-drawn previews) */
  t?: (text: string) => string;
}) {
  const { view, shownQuestion: q, feedback: fb } = props;
  const finished = view.ended && (!fb || !fb.next.hasQuestion);
  // the 30–50 rule closed the work (assigned work) or this practice (MAP plan, Skills): Done
  const justDone = Boolean(fb?.work?.justDone || fb?.goalDone);
  const doneBy = fb?.work?.justDone ? fb.work.doneBy : fb?.goalDone ?? null;
  // r67 guessing: a calm pause (progress saved) — never a failure
  const paused = fb?.guess?.action === "PAUSE";
  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          <a href={props.unitHref} className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-brand-teal hover:underline">Leave practice</a>
          <h1 className="truncate text-2xl font-bold text-brand-navy">{view.skillName}</h1>
          {/* the student always sees how many are right and wrong so far */}
          <p data-testid="score-line" className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-900">✓ {view.correct} correct</span>
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-semibold text-rose-900">✗ {Math.max(0, view.answered - view.correct)} wrong</span>
            <span className="text-slate-500">{view.answered} answered</span>
          </p>
          {/* r## (owner: "53 answered and it never stopped"): answered fast ones count for nothing toward the 30/50
              rule, accuracy or mastery — only explained here when it actually happens, so the number above never
              looks stuck for no reason */}
          {view.guessCount > 0 && (
            <p data-testid="guess-note" className="mt-1 text-xs text-slate-400">
              {view.guessCount === 1 ? "1 answer was too fast to count." : `${view.guessCount} answers were too fast to count.`}
            </p>
          )}
          {/* assigned work: Done once it is Done (r67, no pressure: no "question 23 of 50" — the bar beside shows how
              close the student is to mastery) */}
          {view.work?.completion === "DONE" && (
            <p data-testid="work-progress" className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-900">✓ Done</span>
            </p>
          )}
        </div>
        <div className="w-64"><BandMeter band={view.band as MasteryBandName} score={view.mastery} started={view.answered > 0 || view.mastery > 0} /></div>
      </header>

      {q && (
        <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
          {q.passage && (
            <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:sticky lg:top-4" aria-label="Reading passage">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold text-brand-navy"><RichInline text={q.passage.title} /></h2><ListenButton text={`${q.passage.title}. ${plainPassage(q.passage.text)}`} label="Listen to the text" /></div>
              <PassageText text={q.passage.text} />
            </article>
          )}
          <div>
            {q.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.image.url} alt={q.image.alt} className="mb-4 max-h-[50vh] w-auto max-w-full rounded-xl bg-white ring-1 ring-slate-200" />
            )}
            {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-lg font-medium leading-relaxed text-slate-900"><RichInline text={q.stem} /></p>}
            <ListenButton text={[q.stem, ...(q.options ?? []).map((o) => `${o.label}. ${o.text}`)].join(". ")} label="Listen to the question" className="mt-2" />
            <div className="mt-5"><AnswerInput q={q} value={props.value} onChange={props.onChange} disabled={!!fb || props.pending || Boolean(props.locked)} /></div>
            {props.retrying && <p role="status" data-testid="answer-retrying" className="mt-4 rounded-lg bg-sky-50 px-3 py-2 text-sky-800">{props.t ? props.t("Trying again…") : "Trying again…"}</p>}
            {props.error && (
              <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-3 py-2 text-red-700">
                <span>{props.error}</span>
                {props.canRetry && !fb && <button type="button" data-testid="answer-try-again" onClick={props.onCheck} disabled={props.pending} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-red-800 ring-1 ring-red-300 disabled:opacity-50">{props.t ? props.t("Try again") : "Try again"}</button>}
              </div>
            )}
            {/* the 30–50 rule: mastered at 30+ → Done and the practice ends; 50 answers without mastery → Done, and the
                student chooses "Stop for now" or "Keep practising" */}
            {justDone && (doneBy === "MASTERED"
              ? <p role="status" data-testid="work-done" className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-lg font-semibold text-emerald-900 ring-1 ring-emerald-200">🎉 You mastered this skill — this work is Done!</p>
              : <p role="status" data-testid="work-done" className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-lg font-semibold text-emerald-900 ring-1 ring-emerald-200">💪 You worked hard — this work is Done! You can stop for now, or keep practising to grow your mastery.</p>)}
            {fb?.guess?.action === "SLOW_DOWN" && <p role="status" data-testid="slow-down" className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-center text-lg font-semibold text-sky-900 ring-1 ring-sky-200">Take your time 😊 there&apos;s no rush — read the question carefully</p>}
            {paused && <p role="status" data-testid="guess-pause" className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-center text-lg font-semibold text-sky-900 ring-1 ring-sky-200">Looks like you need a break — your progress is saved</p>}
            {fb && !justDone && !paused && view.answered > 0 && view.answered % 15 === 0 && <p role="status" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-center text-lg font-semibold text-amber-900 ring-1 ring-amber-200">Great work! Take a deep breath 💪</p>}
            <div className="mt-6">{fb && <FeedbackPanel fb={fb} questionId={q.questionId} fxKey={`${view.sessionId}|${q.questionId}|${view.answered}`} />}</div>
            <div className="mt-6 flex flex-wrap gap-3">
              {!fb && (
                <button type="button" onClick={props.onCheck} disabled={!props.ready || props.pending || Boolean(props.locked)}
                  className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white hover:bg-brand-purple disabled:cursor-not-allowed disabled:opacity-40">
                  {props.pending ? "Checking…" : "Check answer"}
                </button>
              )}
              {fb && fb.next.hasQuestion && paused && (
                <>
                  <a href={props.unitHref} data-testid="take-break" className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white hover:bg-brand-purple">{props.unitHref === "/student" ? "Back to My Work" : "Back to my skills"}</a>
                  <button type="button" data-testid="continue-practising-paused" onClick={props.onNext} className="rounded-xl border-2 border-slate-300 px-6 py-3 text-lg font-semibold text-brand-navy">Keep practising</button>
                </>
              )}
              {fb && fb.next.hasQuestion && justDone && !paused && props.onFinish && (
                <button type="button" data-testid="finish-work" onClick={props.onFinish} autoFocus className="rounded-xl bg-emerald-600 px-8 py-3 text-lg font-semibold text-white hover:bg-emerald-700">Stop for now</button>
              )}
              {fb && fb.next.hasQuestion && justDone && !paused && (
                <button type="button" data-testid="continue-practising" onClick={props.onNext} className="rounded-xl border-2 border-slate-300 px-6 py-3 text-lg font-semibold text-brand-navy">Keep practising</button>
              )}
              {fb && fb.next.hasQuestion && !justDone && !paused && (
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
