/**
 * 🪜 The student's skill progress in five friendly steps (pure: the progress bar, its tests and any page can use it).
 *
 *   BEGINNING → Getting started · DEVELOPING → Building · APPROACHING → Strengthening · PROFICIENT → Nearly there ·
 *   MASTERED → Mastered
 *
 * The same data and thresholds as the mastery engine: the step is the band the engine gives, the fill inside a step
 * follows the band thresholds (DEFAULT_MASTERY: 40 · 60 · 75 · 90) and the minimum answers the engine asks for
 * Nearly there (8) and Mastered (15). Students never see level or tier words here.
 */
import { DEFAULT_MASTERY } from "../config/engine";
import type { MasteryBandName } from "../types/domain";

export interface MasteryStep { band: MasteryBandName; label: string; from: number; to: number }

const B = DEFAULT_MASTERY.bands;
export const MASTERY_STEPS: readonly MasteryStep[] = [
  { band: "BEGINNING", label: "Getting started", from: B.beginning, to: B.developing },
  { band: "DEVELOPING", label: "Building", from: B.developing, to: B.approaching },
  { band: "APPROACHING", label: "Strengthening", from: B.approaching, to: B.proficient },
  { band: "PROFICIENT", label: "Nearly there", from: B.proficient, to: B.mastered },
  { band: "MASTERED", label: "Mastered", from: B.mastered, to: 100 },
];

/** The step of a band (unknown → Getting started). */
export const stepIndex = (band: string | null | undefined): number => Math.max(0, MASTERY_STEPS.findIndex((x) => x.band === band));
export const stepLabel = (band: string | null | undefined): string => MASTERY_STEPS[stepIndex(band)].label;

/** The smallest fill shown for the current step, so the bar never looks empty (even at 0). */
export const MIN_FILL = 0.12;

/** How full each of the five segments is (0–1): steps before the current one are full; the current one shows the
 *  progress inside its range (never less than MIN_FILL); later steps are empty. Mastered: all full. */
export function segmentFills(band: string, score: number): number[] {
  const at = stepIndex(band);
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  return MASTERY_STEPS.map((step, i) => {
    if (i < at) return 1;
    if (i > at) return 0;
    if (step.band === "MASTERED") return 1;
    const inside = (s - step.from) / Math.max(1, step.to - step.from);
    return Math.round(Math.max(MIN_FILL, Math.min(0.95, inside)) * 100) / 100;
  });
}

/**
 * About how many more correct answers lead to the next step (null when mastered). An estimate of the engine: early
 * correct answers add the most (≈12 points from 0, as the engine's own example: 2 easy correct answers ≈ 25), later
 * ones less (never under 2.5); and the engine asks for 8 answers before Nearly there and 15 before Mastered.
 */
export function correctAnswersToNext(band: string, score: number, answered?: number | null): number | null {
  const at = stepIndex(band);
  if (at >= MASTERY_STEPS.length - 1) return null;
  const target = MASTERY_STEPS[at + 1].from;
  let s = Math.max(0, Math.min(100, Number(score) || 0)), n = 0;
  while (s < target && n < 60) { s += Math.max(2.5, 12 * (1 - s / 100)); n++; }
  const next = MASTERY_STEPS[at + 1].band;
  const gate = next === "PROFICIENT" ? DEFAULT_MASTERY.minAttemptsForProficient : next === "MASTERED" ? DEFAULT_MASTERY.minAttemptsForMastered : 0;
  if (gate && answered !== undefined && answered !== null) n = Math.max(n, gate - Math.max(0, Math.floor(answered)));
  return Math.max(1, n);
}

type TFn = (text: string, vars?: Record<string, string | number>) => string;
const plain: TFn = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));

/** The encouraging next-step line under the bar (translated with `t`). */
export function nextStepText(band: string, score: number, started: boolean, answered?: number | null, t: TFn = plain): string {
  if (!started) return t("Answer your first question to begin.");
  const at = stepIndex(band);
  if (at >= MASTERY_STEPS.length - 1) return t("Skill mastered. A quick review now and then keeps it strong.");
  const n = correctAnswersToNext(band, score, answered) ?? 1;
  const step = t(MASTERY_STEPS[at + 1].label);
  return n === 1 ? t("1 more correct answer to reach {step}", { step }) : t("About {n} more correct answers to reach {step}", { n, step });
}

/** What a screen reader says for the bar. */
export function progressText(band: string, score: number, started: boolean, answered?: number | null, t: TFn = plain): string {
  const at = stepIndex(band);
  const step = t(MASTERY_STEPS[at].label);
  const where = t("Step {n} of 5: {step}", { n: at + 1, step });
  return started ? `${where}. ${t("{score} of 100", { score: Math.round(Number(score) || 0) })}. ${nextStepText(band, score, started, answered, t)}` : `${where}. ${nextStepText(band, score, started, answered, t)}`;
}
