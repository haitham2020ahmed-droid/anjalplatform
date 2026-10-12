"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { setDiagnosticWindow } from "@/server/diagnostic/window";

const day = (v: FormDataEntryValue | null, end = false) => { const x = String(v ?? ""); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? new Date(`${x}T${end ? "23:59:59" : "00:00:00"}`) : null; };

/** 🗓️ Open / close / schedule one grade's Diagnostic (school admin only — checked again in setDiagnosticWindow). */
export async function setDiagnosticWindowAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const grade = Number(f.get("grade"));
  const mode = String(f.get("mode")) === "AUTO" ? "AUTO" : "MANUAL";
  let m: string;
  try {
    const r = await setDiagnosticWindow(repo, actor, { grade, mode, isOpen: String(f.get("open")) === "1", opensAt: day(f.get("opensAt")), closesAt: day(f.get("closesAt"), true) });
    m = r.status === "OPEN" ? `Grade ${grade}: open for students.` : r.status === "SCHEDULED" ? `Grade ${grade}: scheduled.` : `Grade ${grade}: closed. Students keep their answers.`;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    m = `⚠️ ${e.message}`;
  }
  revalidatePath("/admin/diagnostic");
  redirect(`/admin/diagnostic?msg=${encodeURIComponent(m)}`);
}
