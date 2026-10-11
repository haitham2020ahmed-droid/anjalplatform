"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { shareParentReport } from "@/server/insights/parent-report";
import { shareClassReports } from "@/server/teacher/extras";

/** 👪 Share (or stop sharing) the ticked students' reports. */
export async function shareManyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), shared = f.get("op") !== "stop";
  const ids = f.getAll("student").map(String);
  let msg: string;
  try {
    if (f.get("op") === "all") {
      const n = await shareClassReports(repo, actor, classId, null);
      redirect(`/teacher/reports?${new URLSearchParams({ classId, msg: actor.role === "TEACHER" ? `📨 All ${n} reports sent to the school admin for approval. Parents are notified once approved.` : `✓ All ${n} reports shared. Parents were notified.` })}`);
    }
    if (!ids.length) throw new ValidationError("Tick at least one student.");
    for (const id of ids) await shareParentReport(repo, actor, id, shared, null);
    msg = shared ? (actor.role === "TEACHER" ? `📨 ${ids.length} report(s) sent to the school admin for approval.` : `✓ ${ids.length} report(s) shared. Parents were notified.`) : `${ids.length} report(s) no longer shared.`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(`/teacher/reports?${new URLSearchParams({ classId, msg })}`);
}
