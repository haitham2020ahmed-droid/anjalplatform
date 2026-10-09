"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignRecommendations } from "@/server/map/recommend";

/** Assign the plan's ticked skills to this one student. */
export async function assignPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), studentId = String(f.get("studentId") ?? ""), subject = String(f.get("subject") ?? "READING");
  let msg: string;
  try {
    const due = String(f.get("dueAt") ?? "");
    const r = await assignRecommendations(repo, actor, classId, f.getAll("skill").map(String).filter(Boolean).map((skillId) => ({ studentId, skillId })), /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59`) : null);
    msg = `Assigned ✓ ${r.assignments} skill(s). The student starts each at their own level.`;
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  redirect(`/teacher/progress/${studentId}?${new URLSearchParams({ subject, msg })}`);
}
