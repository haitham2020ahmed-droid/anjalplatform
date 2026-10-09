"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { setFollowupRules } from "@/server/insights/teacher-followup";

export async function followupRulesAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  let msg: string;
  try { await setFollowupRules(repo, actor, { noLoginDays: Number(f.get("noLoginDays")), noAssignmentDays: Number(f.get("noAssignmentDays")), atRiskDays: Number(f.get("atRiskDays")) }); msg = "Rules saved."; }
  catch (e) { if (e instanceof ValidationError) msg = e.message; else throw e; }
  redirect(`/admin/teachers?msg=${encodeURIComponent(msg)}`);
}
