"use client";
/**
 * ⭐ Owner (1 Nov 2026): nobody is left out of an assignment. When some students already mastered the skill, the
 * teacher only SEES it: "5 students already mastered this skill — they get a 20-question review" and presses Assign
 * (the whole class gets the work; for those students it is a review — practice/completion.ts REVIEW_WORK_*). The
 * old "exclude them? Yes / No" question is gone; `onYes` stays in the signature for the existing callers.
 */
export function excludeQuestion(n: number, t: (s: string, v?: Record<string, string | number>) => string): string {
  return n === 1 ? t("1 student already mastered this skill: a 20-question review for them.") : t("{n} students already mastered this skill: a 20-question review for them.", { n });
}

export function ExcludeMasteredPrompt({ count, onNo, t, busy = false }: { count: number; onYes?: () => void; onNo: () => void; t: (s: string, v?: Record<string, string | number>) => string; busy?: boolean }) {
  return (
    <span role="group" data-testid="exclude-mastered" className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-950 ring-1 ring-amber-200">
      <span aria-hidden="true">⭐</span>{excludeQuestion(count, t)}
      <button type="button" disabled={busy} onClick={onNo} className="rounded-md bg-brand-navy px-2 py-0.5 font-semibold text-white disabled:opacity-50">{t("Assign")}</button>
    </span>
  );
}
