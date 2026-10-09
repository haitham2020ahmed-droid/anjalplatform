"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { quickAddStudents, type QuickResult } from "@/server/admin/quick-students";

export type QuickState = { error?: string; result?: QuickResult };

/** ⚡ Adds the pasted names to one class; the sign-ins are shown once (print them). */
export async function quickAddAction(_: QuickState, f: FormData): Promise<QuickState> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  try { return { result: await quickAddStudents(repo, actor, { classId: String(f.get("classId") ?? ""), text: String(f.get("names") ?? "") }) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message }; throw e; }
}
