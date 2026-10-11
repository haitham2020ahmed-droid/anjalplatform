"use client";
/**
 * The end of every "assign a skill" form: Program (required, Curriculum by default) → which questions (the platform
 * chooses, or the teacher picks) → "Preview as student" → Assign. Must sit inside a <form>: it adds the fields
 * `program`, `questionIds` (and `track` when asked) and the submit button.
 */
import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { AUTO, defaultProgram, type PickerValue, type Program } from "./helpers";
import { ProgramChoice } from "./program-choice";
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
  const [program, setProgram] = useState<Program>(defaultProgram(grammar ? "CURRICULUM" : track));
  const [value, setValue] = useState<PickerValue>(AUTO);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const empty = !value.auto && value.questionIds.length === 0;
  return (
    <div className="grid gap-4">
      {trackField && <input type="hidden" name="track" value={grammar ? "GRAMMAR" : program} />}
      <div className={step === "preview" ? "hidden" : "grid gap-4"}>
        <ProgramChoice value={program} onChange={setProgram} />
        <SkillQuestionPicker key={skillId} skillId={skillId} onChange={setValue} />
        {empty && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Tick at least one question, or let the platform choose.")}</p>}
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
          ? <button type="button" onClick={() => setStep("preview")} disabled={empty || disabled} className={`${BTN_PRIMARY} disabled:opacity-50`}>{t("Preview as student")}</button>
          : <>
              <button type="button" onClick={() => setStep("edit")} className={BTN_SECONDARY}>{t("Back")}</button>
              <button type="submit" disabled={pending || disabled} className={`${BTN_PRIMARY} disabled:opacity-60`}>{t(pending ? "Assigning…" : submitLabel)}</button>
            </>}
      </div>
    </div>
  );
}
