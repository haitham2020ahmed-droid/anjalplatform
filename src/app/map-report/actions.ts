"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import type { GroupKey } from "@/server/map/map-plan";
import { assignGroupSkills, assignStudyPlanSkills, saveMapFamilyNote } from "@/server/map/map-reports";
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

/** 📤 Sends a student's Personal Study Plan: the ticked skills, one adaptive assignment each. */
export async function assignStudyPlanAction(f: FormData): Promise<void> {
  const studentId = String(f.get("studentId") ?? ""), classId = String(f.get("classId") ?? ""), subject = String(f.get("subject") ?? "READING");
  const due = String(f.get("dueAt") ?? "");
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
    const r = await assignStudyPlanSkills(repo, actor, { studentId, classId, skillIds: f.getAll("skill").map(String), dueAt: due ? new Date(`${due}T20:59:00Z`) : null, startAt: startOfDay(f.get("startAt")), source: String(f.get("source") ?? "") });
    msg = `✓ Sent: ${r.skills} skill(s) assigned.`;
  } catch (e) { if (isNextControl(e)) throw e; msg = `⚠️ ${await failureMessage(e, "map", "assignStudyPlan", `/map-report/study-plan/${studentId}`)}`; }
  redirect(`/map-report/study-plan/${studentId}?${new URLSearchParams({ subject, msg })}`);
}

/** ✏️ Edit the note that goes with a student's MAP Family Report, before Send (the Reports hub's "Send to family"). */
export async function saveMapFamilyNoteAction(f: FormData): Promise<void> {
  const studentId = String(f.get("studentId") ?? "");
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
    await saveMapFamilyNote(repo, actor, studentId, String(f.get("note") ?? ""));
    msg = "💾 Saved.";
  } catch (e) { if (isNextControl(e)) throw e; msg = `⚠️ ${await failureMessage(e, "map", "saveMapFamilyNote", `/map-report/family/${studentId}`)}`; } // r79: never a white page
  redirect(`/map-report/family/${studentId}?${new URLSearchParams({ msg })}`);
}
