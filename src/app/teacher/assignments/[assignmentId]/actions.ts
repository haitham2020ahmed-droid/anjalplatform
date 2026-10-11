"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { copyAssignment } from "@/server/teacher/extras";
import { cancelAssignment } from "@/server/teacher/assign";

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

/** ✖ Cancel the assignment (soft delete) after the teacher ticked the confirmation box. */
export async function cancelAssignmentAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("assignmentId") ?? "");
  let to = `/teacher/assignments/${id}`;
  if (f.get("confirm") !== "yes") redirect(`${to}?msg=${encodeURIComponent("⚠️ Tick the box to confirm the cancellation.")}`);
  try {
    const r = await cancelAssignment(repo, actor, id);
    to = `/teacher/assignments?msg=${encodeURIComponent(`✓ “${r.title}” was cancelled. It is no longer on the students' lists; answers already given are kept.`)}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) to += `?msg=${encodeURIComponent(`⚠️ ${e.message}`)}`; else throw e; }
  redirect(to);
}
