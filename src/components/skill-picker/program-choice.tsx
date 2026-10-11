"use client";
import { useT } from "@/i18n/client";
import { TAG_STYLE } from "@/components/ui-kit/tokens";
import { PROGRAMS, PROGRAM_LABEL, type Program } from "./helpers";

/**
 * The required "Program" choice when assigning: Curriculum (blue) · MAP (green) · RTI (orange) · NAFS (teal).
 * Sent as the form field `program` (MAP | RTI | CURRICULUM | NAFS).
 */
export function ProgramChoice({ value, onChange, name = "program" }: { value: Program; onChange: (p: Program) => void; name?: string }) {
  const t = useT();
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-700">{t("Program")}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label={t("Program")}>
        {PROGRAMS.map((p) => {
          const on = value === p, st = TAG_STYLE[p];
          return (
            <button key={p} type="button" role="radio" aria-checked={on} onClick={() => onChange(p)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 ${st.className} ${on ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"}`}>
              {on && <span aria-hidden="true">✓</span>}{t(PROGRAM_LABEL[p])}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
