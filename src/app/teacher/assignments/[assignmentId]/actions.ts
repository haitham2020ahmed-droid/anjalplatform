"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { copyAssignment } from "@/server/teacher/extras";

export async function copyAssignmentAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("assignmentId"));
  let to = `/teacher/assignments/${id}`;
  try {
    const due = f.get("dueAt") ? new Date(`${String(f.get("dueAt"))}T20:59:00Z`) : null;
    const copy = await copyAssignment(repo, actor, id, String(f.get("classId")), due);
    to = `/teacher/assignments/${copy}?msg=${encodeURIComponent("✓ Copied to the other class. Students were notified.")}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) to += `?msg=${encodeURIComponent(`⚠️ ${e.message}`)}`; else throw e; }
  redirect(to);
}
