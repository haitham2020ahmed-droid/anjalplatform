"use client";
/**
 * ⭐ "5 students already mastered this skill — exclude them?" (Yes / No) — the ONE prompt every place that assigns a
 * skill shows (☆ quick-assign, the Assign window, plans, the Year plan). Yes = only the students who have not mastered
 * it get the work; No = everyone (the teacher may still assign a mastered skill on purpose).
 */
export function excludeQuestion(n: number, t: (s: string, v?: Record<string, string | number>) => string): string {
  return n === 1 ? t("1 student already mastered this skill — exclude them?") : t("{n} students already mastered this skill — exclude them?", { n });
}

export function ExcludeMasteredPrompt({ count, onYes, onNo, t, busy = false }: { count: number; onYes: () => void; onNo: () => void; t: (s: string, v?: Record<string, string | number>) => string; busy?: boolean }) {
  return (
    <span role="group" data-testid="exclude-mastered" className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-950 ring-1 ring-amber-200">
      <span aria-hidden="true">⭐</span>{excludeQuestion(count, t)}
      <button type="button" disabled={busy} onClick={onYes} className="rounded-md bg-brand-navy px-2 py-0.5 font-semibold text-white disabled:opacity-50">{t("Yes")}</button>
      <button type="button" disabled={busy} onClick={onNo} className="rounded-md bg-white px-2 py-0.5 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-50">{t("No")}</button>
    </span>
  );
}
