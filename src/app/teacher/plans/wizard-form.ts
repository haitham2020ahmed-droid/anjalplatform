import { planTypeOf } from "@/server/plans/wizard";

/** The Plans wizard's form → the wizard input (shared by the page's preview and the Assign action). */
export function readWizardForm(get: (k: string) => string | null, getAll: (k: string) => string[]) {
  const who = get("who") === "student" || get("who") === "group" ? String(get("who")) : "class";
  const sids = getAll("sid").filter(Boolean);
  const studentIds = who === "class" ? [] : who === "student" ? sids.slice(0, 1) : sids;
  const grade = /^\d{1,2}$/.test(String(get("grade") ?? "")) ? Number(get("grade")) : null;
  const classId = String(get("classId") ?? ""), type = planTypeOf(get("type")), unitId = get("unitId") || null;
  const subject = (get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING") as "READING" | "LANGUAGE";
  const areas = getAll("area").filter(Boolean);
  // the teacher's ticks on the preview count only for the SAME plan (same class, students, type and options)
  const key = wizardKey({ classId, who, studentIds, type, grade, unitId, subject, areas });
  return {
    classId, who, studentIds, type, grade, unitId, subject, areas, key,
    skillIds: getAll("add").filter(Boolean),
    keep: get("edited") === "1" && get("pkey") === key ? getAll("keep") : null,
  };
}


/** Identifies one plan's options; the preview's ticks are kept only while it stays the same. */
export function wizardKey(w: { classId: string; who: string; studentIds: string[]; type: string | null; grade: number | null; unitId: string | null; subject: string; areas: string[] }): string {
  return [w.classId, w.who, w.studentIds.join(","), w.type ?? "", w.type === "CURRICULUM" || w.type === "NAFS" || w.type === "MAP" ? w.grade ?? "" : "", w.type === "CURRICULUM" ? w.unitId ?? "" : "", w.type === "MAP" ? w.subject : "", w.type === "NAFS" ? w.areas.join(",") : ""].join("|");
}
