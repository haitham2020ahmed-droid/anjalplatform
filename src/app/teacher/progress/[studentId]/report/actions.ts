"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { shareParentReport } from "@/server/insights/parent-report";

export async function shareReportAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const studentId = String(f.get("studentId") ?? ""), shared = f.get("shared") === "1";
  let msg: string;
  try { await shareParentReport(repo, actor, studentId, shared, String(f.get("note") ?? "")); msg = shared ? "✓ Shared with the parent. They were notified." : "The parent can no longer see this report."; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(`/teacher/progress/${studentId}/report?msg=${encodeURIComponent(msg)}`);
}
