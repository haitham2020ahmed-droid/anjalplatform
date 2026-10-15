"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import type { GroupKey } from "@/server/map/map-plan";
import { assignGroupSkills } from "@/server/map/map-reports";
import { startOfDay } from "@/lib/assign-dates";

/** 📤 Sends one band group of the Group Study Plan its practice (ticked skills, ticked students). */
export async function assignGroupAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? ""), subject = String(f.get("subject") ?? "READING"), group = String(f.get("group") ?? "") as GroupKey;
  const due = String(f.get("dueAt") ?? "");
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
    const r = await assignGroupSkills(repo, actor, { classId, group, low: Number(f.get("low")), high: Number(f.get("high")), skillIds: f.getAll("skill").map(String), studentIds: f.getAll("student").map(String), count: Number(f.get("count")) || 15, dueAt: due ? new Date(`${due}T20:59:00Z`) : null, startAt: startOfDay(f.get("startAt")), source: String(f.get("source") ?? "") });
    msg = `✓ Sent to ${r.students} student(s): one adaptive set from ${r.questions} questions of their band.`;
  } catch (e) { if (isNextControl(e)) throw e; msg = `⚠️ ${await failureMessage(e, "map", "assignGroup", `/map-report/class/${classId}/groups`)}`; } // r79: never a white page
  redirect(`/map-report/class/${classId}/groups?${new URLSearchParams({ subject, msg })}#${group}`);
}
