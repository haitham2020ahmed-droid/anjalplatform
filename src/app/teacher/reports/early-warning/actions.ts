"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { handleEarlyWarning } from "@/server/insights/early-warning";

/** ✓ Mark handled from the early-warning list (the alert follow-up): the student leaves the list. */
export async function handleEarlyWarningAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  let msg = "✓ Marked as handled. Thank you!";
  try { await handleEarlyWarning(repo, actor, String(f.get("studentId") ?? ""), String(f.get("action") ?? "")); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  const keep = ["classId", "gradeId", "teacherId", "severity"].map((k) => [k, String(f.get(k) ?? "")] as [string, string]).filter(([, v]) => v);
  redirect(`/teacher/reports/early-warning?${new URLSearchParams([...keep, ["msg", msg]])}`);
}
