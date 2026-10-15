"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import { assignRecommendations } from "@/server/map/recommend";

export async function assignRecommendationsAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? "");
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
    const picks = f.getAll("pick").map(String).map((v) => { const [studentId, skillId] = v.split("|"); return { studentId, skillId }; }).filter((p) => p.studentId && p.skillId);
    const due = String(f.get("dueAt") ?? "");
    const r = await assignRecommendations(repo, actor, classId, picks, /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59`) : null, String(f.get("source") ?? ""));
    msg = `Assigned ✓ ${r.assignments} MAP skill(s) to ${r.students} student(s). They appear in each student's 🗺️ My MAP.`;
  } catch (e) { if (isNextControl(e)) throw e; msg = await failureMessage(e, "map", "assignRecommendations", "/teacher/map-recommendations"); } // r79: never a white page
  redirect(`/teacher/map-recommendations?classId=${classId}&msg=${encodeURIComponent(msg)}`);
}
