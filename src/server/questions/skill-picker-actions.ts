"use server";
/**
 * Server action for the question picker: a skill's pooled questions (one bank) for a teacher or an admin.
 * Access is checked here (signed-in teacher / admin) and again inside listSkillQuestionsForTeacher (school, role).
 */
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { listSkillQuestionsForTeacher, type PickerResult } from "@/server/questions/skill-picker";

const Input = z.object({
  skillId: z.string().min(1).max(191),
  level: z.enum(["BELOW", "ON", "ABOVE"]).optional(),
  search: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export async function listSkillQuestionsForTeacherAction(skillId: string, opts: { level?: "BELOW" | "ON" | "ABOVE"; search?: string; limit?: number } = {}): Promise<PickerResult | { error: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const input = Input.parse({ skillId, ...opts });
  try {
    return await listSkillQuestionsForTeacher(repo, actor, input.skillId, { level: input.level, search: input.search, limit: input.limit });
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
