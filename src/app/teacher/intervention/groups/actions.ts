"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startIntervention } from "@/server/insights/interventions";

/** 🎯 Starts an intervention group: the platform saves mastery now and measures the change at the end. */
export async function startInterventionAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "").slice(0, 191);
  let msg: string;
  try {
    await startIntervention(repo, actor, {
      classId, skillId: String(f.get("skillId") ?? "").slice(0, 191), studentIds: f.getAll("studentId").map((x) => String(x).slice(0, 191)),
      days: Number(f.get("days") ?? 14), title: String(f.get("title") ?? "").slice(0, 120),
    });
    msg = "🎯 Intervention started. The platform will measure the change.";
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  redirect(`/teacher/intervention/groups?class=${encodeURIComponent(classId)}&msg=${encodeURIComponent(msg)}`);
}
