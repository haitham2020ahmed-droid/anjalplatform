"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { transferClass } from "@/server/teacher/support";

export async function transferClassAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "classes:manage" });
  let msg: string;
  try { await transferClass(repo, actor, String(f.get("classId")), String(f.get("teacherId")), f.get("keep") === "1"); msg = `✓ ${String(f.get("className"))} moved. All its students, assignments, plans and reports stay with the class.`; }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  redirect(`/admin/class-transfer?msg=${encodeURIComponent(msg)}`);
}
