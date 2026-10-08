"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignRecommendations } from "@/server/map/recommend";

export async function assignRecommendationsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  let msg: string;
  try {
    const picks = f.getAll("pick").map(String).map((v) => { const [studentId, skillId] = v.split("|"); return { studentId, skillId }; }).filter((p) => p.studentId && p.skillId);
    const due = String(f.get("dueAt") ?? "");
    const r = await assignRecommendations(repo, actor, classId, picks, /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59`) : null);
    msg = `Assigned ✓ ${r.assignments} MAP skill(s) to ${r.students} student(s). They appear in each student's 🗺️ My MAP.`;
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  redirect(`/teacher/map-recommendations?classId=${classId}&msg=${encodeURIComponent(msg)}`);
}
