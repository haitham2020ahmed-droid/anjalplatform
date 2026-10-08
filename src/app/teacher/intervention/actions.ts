"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignRecommendations } from "@/server/map/recommend";

/** 🔁 Assigns a student's review-due skills (spaced review), as adaptive practice. */
export async function assignReviewAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), studentId = String(f.get("studentId") ?? "");
  const skills = f.getAll("skillId").map(String).filter(Boolean);
  let msg: string;
  try {
    const r = await assignRecommendations(repo, actor, classId, skills.map((skillId) => ({ studentId, skillId })));
    msg = `🔁 ${r.assignments} review assignment(s) sent.`;
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  redirect(`/teacher/intervention?flag=REVIEW&msg=${encodeURIComponent(msg)}`);
}
