"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { createAssignment } from "@/server/teacher/assignments";
import { resolveAlert } from "@/server/teacher/interventions";
import { ValidationError } from "@/server/curriculum-admin";

const id = z.string().min(1).max(191);

export async function resolveAlertAction(f: FormData) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await resolveAlert(repo, actor, id.parse(f.get("alertId")));
  revalidatePath(`/teacher/classes/${id.parse(f.get("classId"))}`);
}

export async function createAssignmentAction(_: { error?: string }, f: FormData): Promise<{ error?: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = id.parse(f.get("classId"));
  const target = z.enum(["SKILL", "UNIT"]).parse(f.get("target"));
  const due = String(f.get("dueAt") ?? "");
  try {
    await createAssignment(repo, actor, {
      classId, title: String(f.get("title") ?? ""), target,
      skillIds: target === "SKILL" ? f.getAll("skillIds").map(String) : undefined,
      unitId: target === "UNIT" ? String(f.get("unitId") ?? "") : undefined,
      dueAt: due ? new Date(`${due}T23:59:00`) : null,
      targetMastery: z.coerce.number().int().min(40).max(100).parse(f.get("targetMastery") ?? 75),
    });
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  redirect(`/teacher/classes/${classId}`);
}
