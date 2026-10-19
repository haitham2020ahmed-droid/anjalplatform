"use client";
/**
 * ⭐ "This class already has this skill assigned — assign it again?" (Yes / No) — the same warning the full "Assign a
 * skill" page already showed (src/app/teacher/skill-assign/page.tsx, hasPriorSkillAssignment), now offered by the
 * quick ways to assign a skill too (Curriculum Map's Skill plan ⭐, the "Find a skill" Assign dialog), so a teacher
 * who searches for or stars a skill they already sent is asked on purpose instead of silently getting a duplicate.
 */
export function priorAssignedQuestion(t: (s: string) => string): string {
  return t("This class already has this skill assigned — assign it again?");
}

export function PriorAssignedPrompt({ onYes, onNo, t, busy = false }: { onYes: () => void; onNo: () => void; t: (s: string) => string; busy?: boolean }) {
  return (
    <span role="group" data-testid="prior-assigned" className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-950 ring-1 ring-amber-200">
      <span aria-hidden="true">⭐</span>{priorAssignedQuestion(t)}
      <button type="button" disabled={busy} onClick={onYes} className="rounded-md bg-brand-navy px-2 py-0.5 font-semibold text-white disabled:opacity-50">{t("Assign again")}</button>
      <button type="button" disabled={busy} onClick={onNo} className="rounded-md bg-white px-2 py-0.5 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-50">{t("Cancel")}</button>
    </span>
  );
}
