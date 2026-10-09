"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { saveWriting } from "@/server/teacher/writing";

export async function saveWritingAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const id = String(f.get("taskId")), submit = f.get("submit") === "1";
  let msg = submit ? "✅ Sent to your teacher!" : "💾 Draft saved.";
  try { await saveWriting(repo, actor, id, String(f.get("text") ?? ""), submit); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/student/writing/${id}?msg=${encodeURIComponent(msg)}`);
}
