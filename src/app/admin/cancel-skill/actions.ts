"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { cancelAssignment, isAssignedKind } from "@/server/teacher/assigned";

const ADMIN = ["SCHOOL_ADMIN", "SUPER_ADMIN"] as const;
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError || (e as { status?: number })?.status === 403;

/** Back to the picker, with what happened (or why it did not). */
function back(studentId: string, extra: Record<string, string>): never {
  const q = new URLSearchParams({ student: studentId });
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  redirect(`/admin/cancel-skill?${q.toString()}`);
}

/**
 * 🚫 Cancel one skill for ONE student — the exact same mechanism a teacher's "Remove" (Assigned page, open a row's
 * students) uses: cancelAssignment with a studentId, a soft cancel (AssignmentCancel row). Nothing else is changed;
 * the student's answers stay. Admin-only (role, checked again inside cancelAssignment's own scope check).
 */
export async function adminCancelSkillAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...ADMIN], permission: "assignments:create" });
  const kind = String(f.get("kind") ?? "");
  const id = String(f.get("id") ?? "");
  const studentId = String(f.get("studentId") ?? "");
  if (!isAssignedKind(kind) || !id || !studentId) back(studentId, { err: "Unknown skill." });
  try {
    await cancelAssignment(repo, actor, kind, id, studentId);
  } catch (e) {
    if (known(e)) back(studentId, { err: (e as Error).message.slice(0, 200) });
    throw e;
  }
  back(studentId, { done: "1" });
}
