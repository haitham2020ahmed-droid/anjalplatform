"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { mergeSkills, undoMerge } from "@/server/skills/master";

/** 🧩 Merge two skills (the admin pressed Merge on a pair), or undo a merge. */
export async function mergeAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const grade = String(f.get("grade") ?? "");
  let msg: string;
  try {
    if (f.get("op") === "undo") msg = `↩ Undone: ${await undoMerge(repo, actor, String(f.get("skillId") ?? ""))} question(s) moved back.`;
    else { const r = await mergeSkills(repo, actor, String(f.get("keep") ?? ""), String(f.get("merge") ?? "")); msg = `✓ Merged: ${r.questions} question(s), ${r.assignments} assignment(s), ${r.links} curriculum link(s) moved. The other skill is switched off (not deleted).`; }
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(`/admin/skills?${new URLSearchParams({ grade, msg })}`);
}
