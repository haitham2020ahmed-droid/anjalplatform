"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { personalPlan } from "@/server/map/personal-plan";
import { assignRecommendations } from "@/server/map/recommend";

/** ⭐ Assigns a group's goal skills (2 per goal area) to that group's students only, as MAP work. */
export async function assignBandGoalsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), subject = f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING", band = String(f.get("band") ?? "");
  let msg: string;
  try {
    const p = await personalPlan(repo, actor, classId, subject);
    const b = p.bands.find((x) => x.band === band);
    const skills = (b?.goals ?? []).flatMap((g) => g.skills.slice(0, 2).map((k) => k.id));
    if (!b || !b.students.length || !skills.length) throw new ValidationError("This group has no students or no goal skills with questions yet.");
    const r = await assignRecommendations(repo, actor, classId, b.students.flatMap((st) => skills.map((skillId) => ({ studentId: st.studentId, skillId }))), f.get("dueAt") ? new Date(String(f.get("dueAt"))) : null);
    msg = `⭐ ${r.assignments} assignment(s) for ${r.students} student(s) of the ${band.toLowerCase()} group (adaptive MAP practice).`;
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  redirect(`/teacher/personal-plan?classId=${encodeURIComponent(classId)}&subject=${subject.toLowerCase()}&msg=${encodeURIComponent(msg)}`);
}
