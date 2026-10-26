import { ASSIGN_SOURCE_CLASS, ASSIGN_SOURCE_LABEL, ASSIGN_SOURCES, type AssignSource } from "@/lib/assign-source";

type T = (text: string, vars?: Record<string, string | number>) => string;
const same: T = (text) => text;

/**
 * 🏷️ The required "Source" of every assign window (owner r74 §1): MAP · NAFS · Curriculum · Grammar · RTI. ALWAYS empty
 * at first (no default) and `required`, so the browser stops an empty submit; the server refuses it too
 * (server/assign/source.ts). A plain <select name="source">: no hooks, usable in server forms and client dialogs
 * (controlled when `onChange` is given).
 */
export function SourceSelect({ t = same, value, onChange, name = "source", className = "", field = "h-10 rounded-lg border border-slate-300 px-2 font-normal", compact = false, disabled }: {
  t?: T; value?: string; onChange?: (v: AssignSource | "") => void; name?: string; className?: string; field?: string; compact?: boolean; disabled?: boolean;
}) {
  const ctl = onChange ? { value: value ?? "", onChange: (e: { target: { value: string } }) => onChange(e.target.value as AssignSource | "") } : { defaultValue: "" };
  return (
    <label className={`flex ${compact ? "items-center gap-1 text-xs" : "flex-col text-sm"} font-semibold text-slate-700 ${className}`} data-testid="source-select">
      <span>{t("Source")} <span aria-hidden="true" className="text-rose-600">*</span></span>
      <select name={name} required aria-required="true" disabled={disabled} {...ctl} className={`${field} ${compact ? "h-8 text-xs" : ""}`}>
        <option value="">{t("Choose a source…")}</option>
        {/* ⚡ Enrichment is never a manual choice here — it's only ever set automatically for a plan created as
            Enrichment (plan-builder.tsx / editor-ui.tsx show it fixed, like a program plan's source). */}
        {ASSIGN_SOURCES.filter((k) => k !== "ENRICHMENT").map((k) => <option key={k} value={k}>{t(ASSIGN_SOURCE_LABEL[k])}</option>)}
      </select>
    </label>
  );
}

/** The small source badge(s) (grid column, My Work, print, student report). */
export function SourceBadges({ sources, t = same, className = "" }: { sources: readonly AssignSource[]; t?: T; className?: string }) {
  if (!sources.length) return null;
  return (
    <span className={`inline-flex flex-wrap justify-center gap-0.5 ${className}`} data-testid="source-badges">
      {sources.map((k) => <span key={k} data-source={k} className={`rounded px-1 text-[10px] font-semibold leading-4 ring-1 print:ring-1 ${ASSIGN_SOURCE_CLASS[k]}`}>{t(ASSIGN_SOURCE_LABEL[k])}</span>)}
    </span>
  );
}
