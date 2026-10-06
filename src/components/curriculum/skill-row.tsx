/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { SkillCard } from "../../server/queries/student-curriculum";
import { BandMeter } from "./band-meter";

/** One skill: name, where it is taught, mastery stage, evidence so far, and the practice action. */
export function SkillRow({ card }: { card: SkillCard }) {
  const started = card.attempts > 0;
  return (
    <li className="grid grid-cols-1 items-center gap-4 border-t border-slate-200 py-5 first:border-t-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-brand-navy">
          {card.isMastered && (
            <svg aria-label="Mastered" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 fill-brand-gold">
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
            </svg>
          )}
          {card.name}
        </h3>
        {card.taughtIn.length > 0 && <p className="mt-0.5 truncate text-sm text-slate-500">Taught in {card.taughtIn.join(", ")}</p>}
        {card.recommended && card.recommendedReason && (
          <p className="mt-1.5 inline-block rounded-md bg-brand-purple/10 px-2 py-0.5 text-sm text-brand-purple">Recommended. {card.recommendedReason}.</p>
        )}
      </div>
      <div>
        <BandMeter band={card.band} score={card.mastery} started={started} />
        <p className="mt-1 text-sm text-slate-500">
          {started ? `${card.attempts} ${card.attempts === 1 ? "question" : "questions"} answered, ${card.accuracy}% correct` : "No questions answered yet"}
        </p>
      </div>
      <div className="md:justify-self-end">
        {card.canPractice ? (
          <a href={`/practice/${card.skillId}`}
            className="inline-flex min-w-[7.5rem] justify-center rounded-lg bg-brand-navy px-4 py-2.5 font-semibold text-white hover:bg-brand-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal">
            {started ? "Keep practising" : "Start"}
          </a>
        ) : (
          <span className="inline-flex min-w-[7.5rem] justify-center rounded-lg bg-slate-100 px-4 py-2.5 text-sm text-slate-500">Questions coming soon</span>
        )}
      </div>
    </li>
  );
}
