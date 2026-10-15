"use client";
/**
 * The end of every "assign a skill" form: Source (required, ALWAYS empty: MAP · NAFS · Curriculum · Grammar · RTI;
 * owner r74 — it replaced the Program choice) → which questions (the platform chooses, or the teacher picks) →
 * "Preview as student" → Assign. Must sit inside a <form>: it adds the fields `source`, `program` (the source when it
 * is a program; Grammar → Curriculum), `questionIds` (and `track` when asked) and the submit button.
 */
import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { AUTO, isProgram, type PickerValue } from "./helpers";
import { SourceSelect } from "@/components/assign/source-select";
import type { AssignSource } from "@/lib/assign-source";
import { SkillQuestionPicker } from "./skill-question-picker";
import { StudentPreview } from "./student-preview";

export function SkillAssignSteps({ skillId, track, grammar = false, trackField = false, pending = false, submitLabel = "Assign", cancel, disabled = false }: {
  skillId: string;
  /** the page's source (MAP, NAFS…): the starting program; Grammar starts on Curriculum */
  track?: string | null;
  grammar?: boolean;
  /** also send `track` (the tag students see): GRAMMAR for a grammar skill, else the program */
  trackField?: boolean;
  pending?: boolean;
  submitLabel?: string;
  /** e.g. a Cancel button, shown before the main button */
  cancel?: ReactNode;
  disabled?: boolean;
}) {
  const t = useT();
  void track;
  // r74: no default — the teacher must choose the source (the server refuses work without one)
  const [source, setSource] = useState<AssignSource | "">("");
  const program = source && isProgram(source) ? source : source === "GRAMMAR" ? "CURRICULUM" : "";
  const [value, setValue] = useState<PickerValue>(AUTO);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const empty = !value.auto && value.questionIds.length === 0;
  return (
    <div className="grid gap-4">
      {trackField && <input type="hidden" name="track" value={grammar || source === "GRAMMAR" ? "GRAMMAR" : program} />}
      <input type="hidden" name="program" value={program} />
      {step === "preview" && <input type="hidden" name="source" value={source} />}
      <div className={step === "preview" ? "hidden" : "grid gap-4"}>
        {step === "edit" && <SourceSelect t={t} value={source} onChange={setSource} field="h-11 rounded-lg border border-slate-300 px-3 font-normal" className="max-w-xs" />}
        <SkillQuestionPicker key={skillId} skillId={skillId} onChange={setValue} />
        {empty && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Tick at least one question, or let the platform choose.")}</p>}
        {/* r67: the platform chooses → at least 30 questions, Done when mastered, at most 50 — unless the teacher sets a count */}
        {value.auto && (
          <label className="grid gap-1 text-sm text-slate-700">
            <span className="font-semibold text-brand-navy">{t("Number of questions (optional)")}</span>
            <input type="number" name="questionCount" min={5} max={50} inputMode="numeric" placeholder="30–50" className="w-32 rounded-lg border border-slate-300 px-3 py-2" />
            <span className="text-xs text-slate-500">{t("Leave empty: each student answers at least 30 questions, done when mastered, at most 50.")}</span>
          </label>
        )}
      </div>
      {step === "preview" && (
        <div className="grid gap-2">
          <h3 className="font-semibold text-brand-navy">{t("Preview as student")}</h3>
          <StudentPreview skillId={skillId} value={value} />
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        {cancel}
        {step === "edit"
          ? <>{!source && <span className="self-center text-sm text-amber-800">{t("Choose the source first.")}</span>}<button key="to-preview" type="button" onClick={(e) => { e.preventDefault(); setStep("preview"); }} disabled={empty || disabled || !source} className={`${BTN_PRIMARY} disabled:opacity-50`}>{t("Preview as student")}</button></>
          : <>
              <button key="back" type="button" onClick={(e) => { e.preventDefault(); setStep("edit"); }} className={BTN_SECONDARY}>{t("Back")}</button>
              <button key="assign" type="submit" disabled={pending || disabled} className={`${BTN_PRIMARY} disabled:opacity-60`}>{t(pending ? "Assigning…" : submitLabel)}</button>
            </>}
      </div>
    </div>
  );
}
