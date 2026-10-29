"use client";
/**
 * The end of every "assign a skill" form: Source (required, ALWAYS empty: MAP · NAFS · Curriculum · Grammar · RTI;
 * owner r74 — it replaced the Program choice) → which questions (the platform chooses, or the teacher picks) →
 * "Preview as student" → Assign. Must sit inside a <form>: it adds the fields `source`, `program` (the source when it
 * is a program; Grammar → Curriculum), `questionIds` (and `track` when asked) and the submit button.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { AUTO, isProgram, type PickerValue } from "./helpers";
import { SourceSelect } from "@/components/assign/source-select";
import type { AssignSource } from "@/lib/assign-source";
import { SkillQuestionPicker } from "./skill-question-picker";
import { StudentPreview } from "./student-preview";
import { studentAccuracyAction } from "@/app/teacher/actions";

/** 🆕 r90: same bar as perf-suggest.ts's STRONG_PCT — kept as a plain number here (not imported) so this client
 * component never pulls server-only modules into its bundle. */
const ENRICHMENT_BAR = 90;

export function SkillAssignSteps({ skillId, track, grammar = false, trackField = false, pending = false, submitLabel = "Assign", cancel, disabled = false, studentId, classId }: {
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
  /** 🆕 r90: when this is an assign-to-ONE-student flow, the student's id and class — enables a non-blocking
   * warning under Source when the teacher picks Enrichment for a student who isn't (yet) excelling on this skill
   * by the platform's own data. Omit for class/group assigns, where no single student's accuracy applies. */
  studentId?: string;
  classId?: string;
}) {
  const t = useT();
  void track;
  // r74: no default — the teacher must choose the source (the server refuses work without one)
  const [source, setSource] = useState<AssignSource | "">("");
  const program = source && isProgram(source) ? source : source === "GRAMMAR" ? "CURRICULUM" : "";
  const [value, setValue] = useState<PickerValue>(AUTO);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const empty = !value.auto && value.questionIds.length === 0;
  // 🆕 r90: fetch only when Enrichment is actually chosen for a known single student — never on every source change
  const [acc, setAcc] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (source !== "ENRICHMENT" || !studentId || !classId) { setAcc(undefined); return; }
    let live = true;
    studentAccuracyAction({ classId, studentId, skillId }).then((r) => { if (live) setAcc(r.acc); }).catch(() => { if (live) setAcc(undefined); });
    return () => { live = false; };
  }, [source, studentId, classId, skillId]);
  const showEnrichmentWarning = source === "ENRICHMENT" && studentId && acc !== undefined && (acc === null || acc < ENRICHMENT_BAR);
  return (
    <div className="grid gap-4">
      {trackField && <input type="hidden" name="track" value={grammar || source === "GRAMMAR" ? "GRAMMAR" : program} />}
      <input type="hidden" name="program" value={program} />
      {step === "preview" && <input type="hidden" name="source" value={source} />}
      <div className={step === "preview" ? "hidden" : "grid gap-4"}>
        {step === "edit" && <SourceSelect t={t} value={source} onChange={setSource} field="h-11 rounded-lg border border-slate-300 px-3 font-normal" className="max-w-xs" />}
        {step === "edit" && showEnrichmentWarning && <p className="max-w-xs rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("This student's recent accuracy on this skill is below the usual Enrichment threshold (90%). You can still assign it.")}</p>}
        <SkillQuestionPicker key={skillId} skillId={skillId} onChange={setValue} />
        {empty && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Tick at least one question, or let the platform choose.")}</p>}
        {/* r91: the platform chooses → at least 30 questions, Done when mastered, at most 50; a teacher's own
            number is now an EXTRA requirement (that many CORRECT answers) on top of mastery, not instead of it */}
        {value.auto && (
          <label className="grid gap-1 text-sm text-slate-700">
            <span className="font-semibold text-brand-navy">{t("Required correct answers (optional)")}</span>
            <input type="number" name="questionCount" min={5} max={50} inputMode="numeric" placeholder="5–50" className="w-32 rounded-lg border border-slate-300 px-3 py-2" />
            <span className="text-xs text-slate-500">{t("Leave empty: each student answers at least 30 questions, done when mastered, at most 50. Set a number to also require that many correct answers before it's Done — mastery is still required either way.")}</span>
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
