"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { createFamilyReport, saveFamilyReport, submitFamilyReport, withdrawFamilyReport } from "@/server/reports/family-reports";
import { contentFromForm } from "@/components/reports/family-report-view";

const to = (path: string, msg: string) => `${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`;
async function attempt(back: string, fn: () => Promise<string>): Promise<never> {
  let dest: string;
  try { dest = await fn(); } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; dest = to(back, `⚠️ ${e.message}`); }
  redirect(dest);
}

/** 📝 New report for one student: the platform prepares it (AUTO) or the teacher writes it (MANUAL). */
export async function newFamilyReportAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const studentId = String(f.get("studentId") ?? ""), kind = f.get("kind") === "MANUAL" ? "MANUAL" : "AUTO";
  await attempt(String(f.get("back") || "/teacher/family-reports"), async () => {
    if (!studentId) throw new ValidationError("Choose a student.");
    const id = await createFamilyReport(repo, actor, { studentId, kind });
    return to(`/teacher/family-reports/${id}`, kind === "AUTO" ? "✨ The platform prepared the report. Read it, edit anything, then send it for approval." : "✍️ Write the report, then send it for approval.");
  });
}

/** Save the edits; “send” also sends it to the school admin for approval. */
export async function saveFamilyReportAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("id") ?? ""), back = `/teacher/family-reports/${id}`;
  await attempt(back, async () => {
    const { title, content } = contentFromForm(f);
    await saveFamilyReport(repo, actor, id, { title, content });
    if (f.get("op") !== "send") return to(back, "💾 Saved.");
    const st = await submitFamilyReport(repo, actor, id);
    return to(back, st === "APPROVED" ? "✅ Approved and sent to the family." : "📨 Sent to the school admin for approval. You will be notified.");
  });
}

export async function withdrawFamilyReportAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("id") ?? ""), back = `/teacher/family-reports/${id}`;
  await attempt(back, async () => { await withdrawFamilyReport(repo, actor, id); return to(back, "↩️ Taken back: you can edit it again."); });
}
