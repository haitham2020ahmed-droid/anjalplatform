/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Five-step mastery meter: Beginning → Developing → Approaching → Proficient → Mastered.
 * Shows the stage a student has reached, not just a number. Mastered turns gold.
 */
import type { MasteryBandName } from "../../types/domain";

const ORDER: MasteryBandName[] = ["BEGINNING", "DEVELOPING", "APPROACHING", "PROFICIENT", "MASTERED"];
const LABEL: Record<MasteryBandName, string> = {
  BEGINNING: "Beginning", DEVELOPING: "Developing", APPROACHING: "Approaching", PROFICIENT: "Proficient", MASTERED: "Mastered",
};

export function BandMeter({ band, score, started }: { band: MasteryBandName; score: number; started: boolean }) {
  const reached = started ? ORDER.indexOf(band) : -1;
  const mastered = band === "MASTERED";
  return (
    <div role="img" aria-label={started ? `Mastery ${score} out of 100, ${LABEL[band]}` : "Not started"} className="w-full">
      <div className="flex gap-1">
        {ORDER.map((b, i) => (
          <span
            key={b}
            className={[
              "h-2.5 flex-1 first:rounded-l-full last:rounded-r-full",
              i <= reached ? (mastered ? "bg-brand-gold" : "bg-brand-teal") : "bg-slate-200",
            ].join(" ")}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-sm">
        <span className={mastered ? "font-semibold text-amber-700" : "font-medium text-brand-navy"}>{started ? LABEL[band] : "Not started"}</span>
        {started && <span className="tabular-nums text-slate-500">{score} / 100</span>}
      </div>
    </div>
  );
}
