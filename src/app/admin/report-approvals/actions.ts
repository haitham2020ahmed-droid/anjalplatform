"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { reviewFamilyReport, saveFamilyReport, submitFamilyReport } from "@/server/reports/family-reports";
import { contentFromForm } from "@/components/reports/family-report-view";

/**
 * ✅ Approve (optionally after small edits) or ↩️ return to the teacher with a note.
 * A MONTHLY draft the teacher has not sent yet has no PENDING step to review: "status" (hidden field, the report's
 * own status at the time the page was rendered) tells us so, and "Approve" instead calls submitFamilyReport — an
 * admin calling it moves the draft straight to PENDING and (being an admin) submitFamilyReport approves it in the
 * same call. "Return" has no meaning on a draft (nothing was sent yet), so the page never offers it there.
 */
export async function reviewReportAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const id = String(f.get("id") ?? ""), op = String(f.get("op") ?? ""), status = String(f.get("status") ?? "");
  let dest: string;
  try {
    if (f.has("sections")) { const { title, content } = contentFromForm(f); await saveFamilyReport(repo, actor, id, { title, content }); }
    if (op === "save") dest = `/admin/report-approvals/${id}?msg=${encodeURIComponent("💾 Saved.")}`;
    else if (op === "approve" && status === "DRAFT") {
      await submitFamilyReport(repo, actor, id);
      dest = `/admin/report-approvals?msg=${encodeURIComponent("✅ Approved: the student and the parents were notified.")}`;
    } else {
      await reviewFamilyReport(repo, actor, id, { approve: op === "approve", note: String(f.get("note") ?? "") });
      dest = `/admin/report-approvals?msg=${encodeURIComponent(op === "approve" ? "✅ Approved: the student and the parents were notified." : "↩️ Returned to the teacher with your note.")}`;
    }
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    dest = `/admin/report-approvals/${id}?msg=${encodeURIComponent(`⚠️ ${e.message}`)}`;
  }
  redirect(dest);
}
