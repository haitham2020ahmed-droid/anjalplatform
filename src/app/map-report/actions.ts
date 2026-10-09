"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import type { GroupKey } from "@/server/map/map-plan";
import { assignGroupSkills } from "@/server/map/map-reports";

/** 📤 Sends one band group of the Group Study Plan its practice (ticked skills, ticked students). */
export async function assignGroupAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), subject = String(f.get("subject") ?? "READING"), group = String(f.get("group") ?? "") as GroupKey;
  const due = String(f.get("dueAt") ?? "");
  let msg: string;
  try {
    const r = await assignGroupSkills(repo, actor, { classId, group, low: Number(f.get("low")), high: Number(f.get("high")), skillIds: f.getAll("skill").map(String), studentIds: f.getAll("student").map(String), count: Number(f.get("count")) || 15, dueAt: due ? new Date(`${due}T20:59:00Z`) : null });
    msg = `✓ Sent to ${r.students} student(s): one adaptive set from ${r.questions} questions of their band.`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/map-report/class/${classId}/groups?${new URLSearchParams({ subject, msg })}#${group}`);
}
