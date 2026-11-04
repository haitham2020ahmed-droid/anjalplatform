"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { linkMissingForClass, linkStudentNow } from "@/server/admin/work-visibility";

const STAFF = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError || (e as { status?: number })?.status === 403;
const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/[^A-Za-z0-9_-]/g, "");

/** Back to the same student, with what happened (or why it did not). */
function back(studentId: string, extra: Record<string, string>): never {
  const q = new URLSearchParams({ student: studentId });
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  redirect(`/admin/work-visibility?${q.toString()}`);
}

/** ⚠️ "Link now": the one missing student row of a single skill / question set (audit-logged). */
export async function linkStudentNowAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF], permission: "assignments:create" });
  const studentId = clean(f.get("studentId"));
  let n = 0;
  try { n = await linkStudentNow(repo, actor, clean(f.get("assignmentId")), studentId); }
  catch (e) { if (known(e)) back(studentId, { err: (e as Error).message }); throw e; }
  back(studentId, { linked: String(n) });
}

/** "Link all missing for this class": students who joined after the work was sent (audit-logged). */
export async function linkMissingForClassAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF], permission: "assignments:create" });
  const studentId = clean(f.get("studentId"));
  let n = 0;
  try { n = await linkMissingForClass(repo, actor, clean(f.get("classId"))); }
  catch (e) { if (known(e)) back(studentId, { err: (e as Error).message }); throw e; }
  back(studentId, { linked: String(n) });
}
