/**
 * 🪜 A compact "stars filled x/5" meter for a skill's progress toward mastery, for places too tight for the full
 * BandMeter (My Work's compact rows): the same five steps and thresholds (lib/mastery-steps), five small dots, filled
 * gold up to the current step, the current one part-filled so it never looks empty. No text by default (an optional
 * `label` shows "{n}/5" for a reader who wants the number); the accessible name carries the full step + next-step text.
 */
import { useT } from "@/i18n/client";
import { MASTERY_STEPS, bandOfScore, nextStepText, progressText, segmentFills, stepIndex } from "../../lib/mastery-steps";

export function MasteryMeter({ score, answered, label = false, size = 7 }: { score: number; answered?: number | null; /** show "{n}/5" after the dots */ label?: boolean; size?: number }) {
  const t = useT();
  const band = bandOfScore(score);
  const at = stepIndex(band);
  const fills = segmentFills(band, score);
  const text = progressText(band, score, true, answered, t);
  return (
    <span data-testid="mastery-meter" role="img" aria-label={text} title={`${t(MASTERY_STEPS[at].label)} — ${nextStepText(band, score, true, answered, t)}`} className="inline-flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden="true">
        {MASTERY_STEPS.map((step, i) => (
          <span key={step.band} className="relative overflow-hidden rounded-full bg-slate-200" style={{ width: size, height: size }}>
            {fills[i] > 0 && <span className={`absolute inset-y-0 start-0 rounded-full ${i <= at && band === "MASTERED" ? "bg-brand-gold" : "bg-brand-teal"}`} style={{ width: `${Math.round(fills[i] * 100)}%` }} />}
          </span>
        ))}
      </span>
      {label && <span className="text-xs font-semibold tabular-nums text-slate-500" aria-hidden="true">{at + 1}/5</span>}
    </span>
  );
}
