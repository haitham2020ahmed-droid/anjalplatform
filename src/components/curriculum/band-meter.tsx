"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * 🪜 The student's skill progress bar: five steps — Getting started → Building → Strengthening → Nearly there →
 * Mastered — with the progress inside the current step (a small start is always visible, even at 0), the next step
 * ("About 3 more correct answers to reach Building") and a quiet "✓ Building reached" when a step is reached while
 * the student practises. Mastered turns gold. Same data and thresholds as the engine (lib/mastery-steps);
 * no level or tier words. Accessible: role="progressbar" with the step and the next step as its text.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n/client";
import type { MasteryBandName } from "../../types/domain";
import { MASTERY_STEPS, nextStepText, progressText, segmentFills, stepIndex } from "../../lib/mastery-steps";

export function BandMeter({ band, score, started, answered }: { band: MasteryBandName; score: number; started: boolean; answered?: number | null }) {
  const t = useT();
  const at = started ? stepIndex(band) : 0;
  const mastered = started && band === "MASTERED";
  const fills = started ? segmentFills(band, score) : segmentFills("BEGINNING", 0);
  const value = started ? Math.round(Math.max(0, Math.min(100, Number(score) || 0))) : 0;
  // 🎉 a step reached during this visit (not on the first view): a short, calm note
  const seen = useRef(at);
  const [reached, setReached] = useState<string | null>(null);
  useEffect(() => {
    if (at > seen.current) {
      setReached(MASTERY_STEPS[at].label);
      const id = setTimeout(() => setReached(null), 5000);
      seen.current = at;
      return () => clearTimeout(id);
    }
    seen.current = at;
  }, [at]);
  return (
    <div role="progressbar" aria-label={t("Skill progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
      aria-valuetext={progressText(started ? band : "BEGINNING", value, started, answered, t)} className="w-full" data-testid="skill-progress">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={mastered ? "font-semibold text-amber-700" : "font-semibold text-brand-navy"}>
          {mastered && <span aria-hidden="true">★ </span>}{t(MASTERY_STEPS[at].label)}
          <span className="ms-1.5 text-xs font-normal text-slate-500">{t("Step {n} of 5", { n: at + 1 })}</span>
        </span>
        {started && value > 0 && <span className="tabular-nums text-xs text-slate-500" dir="ltr">{value} / 100</span>}
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden="true">
        {MASTERY_STEPS.map((s, i) => (
          <span key={s.band} title={t(s.label)} className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            {fills[i] > 0 && (
              <span className={`absolute inset-y-0 start-0 rounded-full transition-[width] duration-500 ${mastered ? "bg-brand-gold" : i < at ? "bg-brand-teal" : "bg-brand-teal/70"} ${reached && i === at ? "animate-pop" : ""}`}
                style={{ width: `${Math.round(fills[i] * 100)}%` }} />
            )}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-600">{nextStepText(started ? band : "BEGINNING", value, started, answered, t)}</p>
      {reached && (
        <p role="status" className="animate-pop mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
          <span aria-hidden="true">✓</span> {t("{step} reached", { step: t(reached) })}
        </p>
      )}
    </div>
  );
}
