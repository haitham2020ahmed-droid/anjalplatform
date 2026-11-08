"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { archiveStudents } from "@/server/admin/roster-clean";

/** Reports audit 8 Nov 2026: archive the extra account of a duplicate pair (reversible: Users → Restore). */
export async function archiveDuplicateAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  const id = String(f.get("studentId") ?? "");
  let msg: string;
  try {
    const n = await archiveStudents(repo, actor, { kind: "STUDENTS", ids: [id] });
    msg = n ? `📦 ${String(f.get("name") ?? "")}: archived (out of the class, cannot sign in; Restore brings it back).` : "Nothing to archive.";
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${(e as Error).message}`; }
  redirect(`/admin/data-cleanup/duplicates?msg=${encodeURIComponent(msg)}`);
}
