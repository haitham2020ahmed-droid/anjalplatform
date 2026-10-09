"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { handleAlert } from "@/server/insights/alerts";

export async function handleAlertAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  let msg = f.get("reopen") === "1" ? "Alert opened again." : "✓ Marked as handled. Thank you!";
  try { await handleAlert(repo, actor, String(f.get("alertId")), String(f.get("action") ?? ""), f.get("reopen") === "1"); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  const q = new URLSearchParams({ status: String(f.get("status") ?? "OPEN"), classId: String(f.get("classId") ?? ""), msg });
  redirect(`/teacher/alerts?${q}`);
}
