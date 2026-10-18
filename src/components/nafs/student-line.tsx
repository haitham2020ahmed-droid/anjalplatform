import type { ReactNode } from "react";
import { codeName, codeShort, MOE_BY_CODE, MOE_LABEL } from "@/server/nafs/framework";
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
  const th = (label: string, tip: string) => <th key={label} className={cls}><Tip tip={t(tip)}>{t(label)} <span aria-hidden="true" className="text-[10px] text-muted">ⓘ</span></Tip></th>;
  return <>{th("Score", LINE_TIPS.score)}{th("Right", LINE_TIPS.right)}{th("Wrong", LINE_TIPS.wrong)}{finished ? th("Finished", LINE_TIPS.finished) : null}{th("Top strength", LINE_TIPS.strength)}{th("Top weakness", LINE_TIPS.weakness)}</>;
}

/** A standard / skill as a short code + a short name shown whole (r77); the full name on hover, keyboard focus or tap; "—" with the reason. */
export function SwText({ code, why, t, tone }: { code: string | null; why: NoneWhy | null; t: T; tone: "good" | "bad" }) {
  if (!code) return <Tip tip={why ? t(WHY_TEXT[why]) : ""}><span className="text-muted">—</span></Tip>;
  const std = MOE_BY_CODE.get(code);
  const label = MOE_LABEL[code];
  return (
    <Tip tip={codeName(code, t)}>
      <span className={`text-xs ${tone === "good" ? "text-emerald-800" : "text-rose-800"}`} data-sw={code}>
        {std ? <><b className="me-1 font-mono" dir="ltr">{codeShort(code)}</b>{t(label ?? std.text)}</> : codeName(code, t)}
      </span>
    </Tip>
  );
}

/** A hover / focus / tap tooltip with no script (server components): the bubble shows on hover and on focus (a tap focuses). */
export function Tip({ tip, children }: { tip: string; children: ReactNode }) {
  if (!tip) return <>{children}</>;
  return (
    <span tabIndex={0} className="group relative inline-block cursor-help outline-none" aria-label={tip}>
      {children}
      <span role="tooltip" className="pointer-events-none absolute start-0 top-full z-30 mt-1 hidden w-64 max-w-[70vw] rounded-xl bg-slate-900 px-3 py-2 text-start text-xs font-normal normal-case leading-snug text-white shadow-lg group-hover:block group-focus:block print:hidden">{tip}</span>
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
    <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line print:shadow-none">
      <p className="text-2xl font-bold tabular-nums text-ink">{n}</p>
      <p className="mt-0.5 text-sm text-ink-2"><Tip tip={t(tip)}>{t(label)} <span aria-hidden="true" className="text-[10px] text-muted">ⓘ</span></Tip></p>
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
