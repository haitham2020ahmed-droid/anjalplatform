"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignQuestions } from "@/server/teacher/assign";

/** Assigns the Copilot's recommended questions to a group (or the class). */
export async function assignCopilotQuestionsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "").slice(0, 191);
  const questionIds = String(f.get("questionIds") ?? "").split(",").filter(Boolean).slice(0, 20);
  const studentIds = String(f.get("studentIds") ?? "").split(",").filter(Boolean).slice(0, 60);
  let msg: string;
  try {
    const r = await assignQuestions(repo, actor, { classId, questionIds, studentIds: studentIds.length ? studentIds : undefined, title: String(f.get("title") ?? "Copilot practice").slice(0, 120) });
    msg = `✅ ${r.questions} question(s) assigned to ${r.students} student(s).`;
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  redirect(`/teacher/ai?class=${encodeURIComponent(classId)}&msg=${encodeURIComponent(msg)}`);
}
