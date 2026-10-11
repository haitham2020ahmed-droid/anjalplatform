"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignFromMap, setStudentLevels } from "@/server/curriculum-map/levels";
import { DEFAULT_TARGET_CORRECT } from "@/server/teacher/assign";
import { sendMapPlan, type SendMapPlanInput } from "@/server/curriculum-map/send-plan";
import { getT } from "@/i18n/server";

export interface PlaceAssignInput { classId: string; code: string; studentIds?: string[]; mode?: "ADAPTIVE" | "BY_LEVEL"; startLevels?: { studentId: string; level: "ABOVE" | "ON" | "BELOW" }[]; max?: number; dueAt?: string | null; note?: string | null }

/** ⭐ Assign from the Curriculum Map, without leaving the page. */
export async function assignPlaceAction(input: PlaceAssignInput): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    if (input.studentIds && !input.studentIds.length) throw new ValidationError("Star at least one student, or choose “All students”.");
    const due = input.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt) ? new Date(`${input.dueAt}T23:59:59`) : null;
    // adaptive: the number is the goal of correct answers (the student may keep practising after it)
    const adaptive = (input.mode ?? "ADAPTIVE") === "ADAPTIVE";
    // ✋ the teacher chose each student's starting level: saved as their level (the set adapts from there)
    if (input.startLevels?.length) await setStudentLevels(repo, actor, input.classId, input.startLevels.filter((x) => ["ABOVE", "ON", "BELOW"].includes(x.level)));
    const r = await assignFromMap(repo, actor, { classId: input.classId, categoryCode: input.code, studentIds: input.studentIds, mode: input.mode, maxQuestions: input.max, targetCorrect: adaptive ? input.max ?? DEFAULT_TARGET_CORRECT : null, dueAt: due, note: input.note ?? null });
    const LV = { ABOVE: "Above", ON: "On", BELOW: "Below" } as const;
    const parts = r.groups.map((g) => `${g.level ? LV[g.level] : "everyone"}: ${g.students} student(s)`);
    return { ok: true, message: `Assigned ✓ ${parts.join(" · ")}. Students were notified.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}` };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}

/** 📘 Send the whole curriculum plan, or one unit's plan, to a class / a group / one student (checked on the server). */
export async function sendMapPlanAction(input: SendMapPlanInput): Promise<{ ok: boolean; message: string; planId?: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const { t } = await getT();
  try {
    const r = await sendMapPlan(repo, actor, { grade: Number(input.grade), unitCode: input.unitCode ?? null, classId: String(input.classId ?? ""), studentIds: Array.isArray(input.studentIds) ? input.studentIds.map(String) : null });
    const msg = t("Sent: {n} parts to {m} students.", { n: r.parts, m: r.students });
    return { ok: true, planId: r.planId, message: r.skipped.length ? `${msg} ${t("{n} parts have no questions yet and were left out.", { n: r.skipped.length })}` : msg };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}
