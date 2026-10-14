import type { ReactNode } from "react";
import { codeName, codeShort, MOE_BY_CODE } from "@/server/nafs/framework";
import { RULE_TEXT, WHY_TEXT, type ClassLine, type NoneWhy } from "@/server/nafs/strengths";

type T = (s: string, v?: Record<string, string | number>) => string;

/**
 * 🇸🇦 r70 (owner: "simple, clear, CORRECT"): the SAME student columns and class line in every NAFS report — tests,
 * Ministry booklets, adaptive practice (all and one), the overall Reports tab. The numbers come from
 * src/server/nafs/strengths.ts (one rule); "—" always carries its reason as a tooltip. Teacher-facing only.
 * No hooks: server components use it.
 */
export const LINE_TIPS = {
  score: "Score = % of the answers that were right.",
  right: "Answers that were fully right.",
  wrong: "Answers that were wrong or left blank (a half-marked written answer counts here). Right + Wrong = all the answers marked.",
  finished: "Yes = handed in / finished.",
  strength: `The student's best standard. ${RULE_TEXT}`,
  weakness: `The student's weakest standard. ${RULE_TEXT}`,
  average: "The average of the students' scores (each student counted once).",
} as const;

/** The six column heads (with their ⓘ tooltip). `finished` = false leaves the Finished column out. */
export function LineHeads({ t, finished = true, cls = "" }: { t: T; finished?: boolean; cls?: string }) {
  const th = (label: string, tip: string) => <th key={label} className={cls} title={t(tip)}>{t(label)} <span aria-hidden="true" className="text-[10px] text-muted">ⓘ</span></th>;
  return <>{th("Score", LINE_TIPS.score)}{th("Right", LINE_TIPS.right)}{th("Wrong", LINE_TIPS.wrong)}{finished ? th("Finished", LINE_TIPS.finished) : null}{th("Top strength", LINE_TIPS.strength)}{th("Top weakness", LINE_TIPS.weakness)}</>;
}

/** A standard / skill as a short code with its name on hover; "—" with the reason when there is none. */
export function SwText({ code, why, t, tone }: { code: string | null; why: NoneWhy | null; t: T; tone: "good" | "bad" }) {
  if (!code) return <span className="text-muted" title={why ? t(WHY_TEXT[why]) : undefined}>—</span>;
  const name = MOE_BY_CODE.get(code)?.text;
  return (
    <span className={`inline-block max-w-[11rem] truncate align-bottom text-xs ${tone === "good" ? "text-emerald-800" : "text-rose-800"}`} title={codeName(code, t)}>
      {name ? <><b className="me-1 font-mono" dir="ltr">{codeShort(code)}</b>{t(name)}</> : codeName(code, t)}
    </span>
  );
}

/** The six cells of one student, in the order of LineHeads. */
export function LineCells({ x, t, finished = true, cls = "text-center" }: { x: { pct: number | null; right: number; wrong: number; finished?: boolean; strength: string | null; weakness: string | null; strengthWhy: NoneWhy | null; weaknessWhy: NoneWhy | null }; t: T; finished?: boolean; cls?: string }) {
  return (
    <>
      <td className={`${cls} font-semibold tabular-nums`} data-cell="score">{x.pct === null ? "—" : `${x.pct}%`}</td>
      <td className={`${cls} tabular-nums text-emerald-800`} data-cell="right">{x.right}</td>
      <td className={`${cls} tabular-nums text-rose-800`} data-cell="wrong">{x.wrong}</td>
      {finished ? <td className={cls} data-cell="finished">{x.finished ? `✓ ${t("Yes")}` : t("No")}</td> : null}
      <td className="pe-2" data-cell="strength"><SwText code={x.strength} why={x.strengthWhy} t={t} tone="good" /></td>
      <td className="pe-2" data-cell="weakness"><SwText code={x.weakness} why={x.weaknessWhy} t={t} tone="bad" /></td>
    </>
  );
}

/** The class line as four small cards: average, finished, strongest, weakest. */
export function ClassLineCards({ c, t, finishedLabel = "Finished", extra }: { c: ClassLine; t: T; finishedLabel?: string; extra?: ReactNode }) {
  const card = (n: ReactNode, label: string, tip: string) => (
    <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line print:shadow-none" title={t(tip)}>
      <p className="text-2xl font-bold tabular-nums text-ink">{n}</p>
      <p className="mt-0.5 text-sm text-ink-2">{t(label)} <span aria-hidden="true" className="text-[10px] text-muted">ⓘ</span></p>
    </div>
  );
  return (
    <section aria-label={t("Class summary")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="nafs-class-line">
      {card(c.average === null ? "—" : `${c.average}%`, "Class average", LINE_TIPS.average)}
      {card(<span dir="ltr">{c.finished}/{c.of}</span>, finishedLabel, "How many students finished, of the students it was given to.")}
      {card(<SwText code={c.strongest} why={c.strongestWhy} t={t} tone="good" />, "Strongest standard", "The standard the class did best on (at least 2 answers).")}
      {card(<SwText code={c.weakest} why={c.weakestWhy} t={t} tone="bad" />, "Weakest standard", "The standard the class did worst on (at least 2 answers).")}
      {extra}
    </section>
  );
}
