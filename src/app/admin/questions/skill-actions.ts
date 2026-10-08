"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignSkill } from "@/server/teacher/assign";

/** Assign a whole skill (adaptive practice) from the Question Bank, without leaving the page. */
export async function assignSkillInline(input: { classId: string; skillId: string; studentIds?: string[]; track: "CURRICULUM" | "MAP" | "NAFS"; dueAt?: string | null }): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    if (input.studentIds && !input.studentIds.length) throw new ValidationError("Star at least one student, or choose “All students”.");
    const due = input.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt) ? new Date(`${input.dueAt}T23:59:59`) : null;
    const r = await assignSkill(repo, actor, { classId: input.classId, skillId: input.skillId, studentIds: input.studentIds, track: input.track, dueAt: due });
    return { ok: true, message: `Assigned ✓ to ${r.students} student(s). They practise it adaptively and were notified.` };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}
