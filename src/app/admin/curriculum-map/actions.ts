"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignFromMap } from "@/server/curriculum-map/levels";

export interface PlaceAssignInput { classId: string; code: string; studentIds?: string[]; mode?: "ADAPTIVE" | "BY_LEVEL"; max?: number; dueAt?: string | null; note?: string | null }

/** ⭐ Assign from the Curriculum Map, without leaving the page. */
export async function assignPlaceAction(input: PlaceAssignInput): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    if (input.studentIds && !input.studentIds.length) throw new ValidationError("Star at least one student, or choose “All students”.");
    const due = input.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt) ? new Date(`${input.dueAt}T23:59:59`) : null;
    const r = await assignFromMap(repo, actor, { classId: input.classId, categoryCode: input.code, studentIds: input.studentIds, mode: input.mode, maxQuestions: input.max, dueAt: due, note: input.note ?? null });
    const LV = { ABOVE: "Above", ON: "On", BELOW: "Below" } as const;
    const parts = r.groups.map((g) => `${g.level ? LV[g.level] : "everyone"}: ${g.students} student(s)`);
    return { ok: true, message: `Assigned ✓ ${parts.join(" · ")}. Students were notified.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}` };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}
