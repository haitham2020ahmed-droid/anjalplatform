"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { resolveFlags } from "@/server/teacher/classroom";

export async function resolveFlagsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const st = f.get("status") === "FIXED" ? "FIXED" : "DISMISSED";
  const n = await resolveFlags(repo, actor, String(f.get("questionId")), st);
  redirect(`/admin/question-flags?msg=${encodeURIComponent(`✓ ${n} report(s) marked ${st === "FIXED" ? "fixed" : "not a problem"}.`)}`);
}
