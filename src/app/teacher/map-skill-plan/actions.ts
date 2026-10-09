"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import type { GroupKey } from "@/server/map/map-plan";
import { assignRange } from "@/server/map/skill-plan";

/** ⭐ Assigns the ticked skills of one RIT range to the ticked students (one adaptive MAP set). */
export async function assignRangeAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), group = String(f.get("group") ?? "LIT") as GroupKey, range = Number(f.get("range"));
  const due = String(f.get("dueAt") ?? "");
  let msg: string;
  try {
    const r = await assignRange(repo, actor, { classId, group, range, skillIds: f.getAll("skill").map(String), studentIds: f.getAll("student").map(String), count: Number(f.get("count")) || 15, dueAt: due ? new Date(`${due}T20:59:00Z`) : null });
    msg = `✓ Assigned to ${r.students} student(s): one adaptive set from ${r.questions} questions of this RIT range. They find it in their work and in My MAP.`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/teacher/map-skill-plan?${new URLSearchParams({ classId, group, msg })}#range-${range}`);
}
