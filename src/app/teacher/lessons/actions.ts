"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignLesson } from "@/server/lessons/teacher";

/** 🧩 Assigns a lesson to the chosen students (or the whole class): each gets a run and a notification. */
export async function assignLessonAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const classId = String(f.get("classId") ?? "").slice(0, 191);
  const skillId = String(f.get("skillId") ?? "").slice(0, 191);
  const studentIds = f.getAll("studentIds").map((x) => String(x).slice(0, 191)).filter(Boolean).slice(0, 200);
  let msg: string;
  try {
    const r = await assignLesson(repo, actor, { classId, skillId, studentIds });
    msg = `✓ Lesson assigned to ${r.assigned} student${r.assigned === 1 ? "" : "s"}${r.already ? ` (${r.already} already had it open)` : ""}.`;
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  redirect(`/teacher/lessons?${new URLSearchParams({ class: classId, skill: skillId, msg })}`);
}
