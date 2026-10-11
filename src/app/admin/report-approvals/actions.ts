"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { reviewFamilyReport, saveFamilyReport } from "@/server/reports/family-reports";
import { contentFromForm } from "@/components/reports/family-report-view";

/** ✅ Approve (optionally after small edits) or ↩️ return to the teacher with a note. */
export async function reviewReportAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const id = String(f.get("id") ?? ""), op = String(f.get("op") ?? "");
  let dest: string;
  try {
    if (f.has("sections")) { const { title, content } = contentFromForm(f); await saveFamilyReport(repo, actor, id, { title, content }); }
    if (op === "save") dest = `/admin/report-approvals/${id}?msg=${encodeURIComponent("💾 Saved.")}`;
    else {
      await reviewFamilyReport(repo, actor, id, { approve: op === "approve", note: String(f.get("note") ?? "") });
      dest = `/admin/report-approvals?msg=${encodeURIComponent(op === "approve" ? "✅ Approved: the student and the parents were notified." : "↩️ Returned to the teacher with your note.")}`;
    }
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    dest = `/admin/report-approvals/${id}?msg=${encodeURIComponent(`⚠️ ${e.message}`)}`;
  }
  redirect(dest);
}
