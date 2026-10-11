"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { openStrategySurvey } from "@/server/surveys/strategy";

/** Opens the Reading Strategy Survey for one class (the students are notified). */
export async function openStrategySurveyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  let m: string;
  try { const n = await openStrategySurvey(repo, actor, classId); m = `The survey is open for this class. ${n} student(s) were notified.`; }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; m = `⚠️ ${e.message}`; }
  redirect(`/teacher/strategy-groups?classId=${encodeURIComponent(classId)}&msg=${encodeURIComponent(m)}`);
}
