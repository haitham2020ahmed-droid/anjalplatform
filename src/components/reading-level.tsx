/**
 * 📏 One reading-level label everywhere (Update 39C, readiness S-14: four reading numbers were shown side by side
 * without saying how they differ). Each scale keeps its own name, and every label carries the same explanation.
 *
 *   MAP Lexile                 NWEA MAP Growth's Lexile from the official test (an official measure)
 *   ReadMaster reading Lexile  ReadMaster's own level: starts from MAP, moves ±30L after each article (75%+ up, <50% down)
 *   ReadRise Level (estimate)  ReadRise's own level on a Lexile-like scale from first-try article scores — an
 *                              estimate, never called a Lexile
 */
export type ReadingScale = "MAP" | "READMASTER" | "READRISE";
export const READING_SCALE_NAME: Record<ReadingScale, string> = { MAP: "MAP Lexile", READMASTER: "ReadMaster reading Lexile", READRISE: "ReadRise Level (estimate)" };
export const READING_SCALE_HELP: Record<ReadingScale, string> = {
  MAP: "MAP Lexile: from the official NWEA MAP Growth Reading test. It changes only when a new MAP test is taken.",
  READMASTER: "ReadMaster reading Lexile: ReadMaster's own level for choosing article versions. It starts from MAP and moves 30L after each article (75%+ up, under 50% down).",
  READRISE: "ReadRise Level (estimate): ReadRise's own level on a Lexile-like scale from first-try article scores. It is an estimate, not an official Lexile measure.",
};
export const READING_SCALES_NOTE = "Three reading numbers, three purposes: MAP Lexile is the official test result; ReadMaster reading Lexile and ReadRise Level (estimate) are each program's own working level for choosing texts. They are not the same scale and are not compared with each other.";

/** “MAP Lexile 820L” with the explanation on hover / long-press (title) and for screen readers. */
export function ReadingLevelLabel({ scale, value, suffix }: { scale: ReadingScale; value?: number | null; suffix?: boolean }) {
  const unit = scale === "READRISE" ? "" : "L";
  return (
    <span title={READING_SCALE_HELP[scale]} className="relative cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2">
      {READING_SCALE_NAME[scale]}{value !== undefined ? <>{" "}<b className="tabular-nums">{value === null ? "—" : `${value}${suffix === false ? "" : unit}`}</b></> : null}
      <span className="sr-only"> ({READING_SCALE_HELP[scale]})</span>
    </span>
  );
}

/** A small “What do these reading numbers mean?” box. */
export function ReadingScalesHelp({ className = "" }: { className?: string }) {
  return (
    <details className={`rounded-xl bg-sky-50 px-4 py-2 text-sm text-slate-700 ring-1 ring-sky-200 ${className}`}>
      <summary className="min-h-10 cursor-pointer py-2 font-semibold text-brand-navy">📏 What do these reading numbers mean?</summary>
      <p className="mt-1">{READING_SCALES_NOTE}</p>
      <ul className="mt-2 list-disc space-y-1 ps-5">{(["MAP", "READMASTER", "READRISE"] as const).map((k) => <li key={k}>{READING_SCALE_HELP[k]}</li>)}</ul>
    </details>
  );
}
