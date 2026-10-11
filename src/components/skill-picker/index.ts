/**
 * 🧩 Skill picker kit — import from "@/components/skill-picker":
 *   <SkillQuestionPicker skillId mode />   the skill's questions: platform chooses (default) or I'll pick
 *   <ProgramChoice value onChange />       Curriculum / MAP / RTI / NAFS (form field `program`)
 *   <StudentPreview skillId value />       the first questions as the student sees them
 *   <SkillAssignSteps skillId … />         Program → questions → Preview as student → Assign (inside a form)
 * plus the pure helpers (dedupe by skill name, picker output, program default, the `questionIds` field).
 */
export { SkillQuestionPicker, type SkillQuestionPickerProps } from "./skill-question-picker";
export { ProgramChoice } from "./program-choice";
export { StudentPreview } from "./student-preview";
export { SkillAssignSteps } from "./assign-steps";
export * from "./helpers";
