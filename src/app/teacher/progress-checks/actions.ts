"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { createProgressCheck } from "@/server/progress-checks/progress-checks";

/** 📋 The class teacher gives a progress check for a text set (once; "retake" makes a new form). */
export async function createProgressCheckAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "").slice(0, 191);
  const lessonId = String(f.get("lessonId") ?? "").slice(0, 191);
  const due = String(f.get("dueAt") ?? "");
  let msg: string;
  let check = "";
  try {
    const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T20:59:00Z`) : undefined;
    const r = await createProgressCheck(repo, actor, { classId, lessonId, retake: f.get("retake") === "1", dueAt });
    check = r.checkId;
    msg = r.created
      ? `✓ Progress check assigned (Form ${r.form}): ${r.items} questions — ${r.byCategory.COMPREHENSION} comprehension, ${r.byCategory.VOCABULARY} vocabulary.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}`
      : "ℹ️ This text set already has a progress check for this class. Tick “New form (retake)” to give another one.";
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    msg = `⚠️ ${e.message}`;
  }
  redirect(`/teacher/progress-checks?${new URLSearchParams({ class: classId, ...(check ? { check } : { lesson: lessonId }), msg })}`);
}
