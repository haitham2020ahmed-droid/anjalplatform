"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignYearWeek, editYearPlan, yearPlanView, type YearEdit, type YearPlanView } from "@/server/map/year-plan";
import { sendYearPlan, skillQuestionsPreview, type PreviewQuestion } from "@/server/map/year-plan-share";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type Out<T> = { ok: true; value: T; message?: string } | { ok: false; message: string };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;

/** 🗓️ Move · swap · replace · add · remove · make again — returns the plan as it is now. */
export async function yearEditAction(classId: string, edit: YearEdit): Promise<Out<YearPlanView>> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    await editYearPlan(repo, actor, String(classId ?? ""), edit);
    return { ok: true, value: await yearPlanView(repo, actor, String(classId ?? "")) };
  } catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}

/** ☆ Assign this week: every skill of the week not assigned yet. */
export async function yearAssignWeekAction(classId: string, week: number, excludeMastered = false, source: string | null = null): Promise<Out<YearPlanView>> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const r = await assignYearWeek(repo, actor, String(classId ?? ""), Number(week), new Date(), { excludeMastered: excludeMastered === true, source });
    return { ok: true, value: await yearPlanView(repo, actor, String(classId ?? "")), message: [`${r.assigned}`, ...r.skipped].join(" · ") };
  } catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}

/** 📤 Send the Year plan to the class's students (or stop showing it). Back to the Year plan tab. */
export async function yearSendAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  let msg = "";
  try { const r = await sendYearPlan(repo, actor, classId, String(f.get("on") ?? "1") !== "0"); msg = r.sentAt ? "Sent to students ✓" : "Students no longer see the Year plan."; }
  catch (e) { if (known(e)) msg = (e as Error).message; else throw e; }
  revalidatePath("/student/map");
  redirect(`/teacher/map-center?${new URLSearchParams({ tab: "year", classId, ...(msg ? { msg } : {}) })}`);
}

/** 🔎 The questions behind a skill of the plan (a few, with their choices). */
export async function yearQuestionsAction(classId: string, skillId: string): Promise<Out<{ total: number; questions: PreviewQuestion[] }>> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  try { return { ok: true, value: await skillQuestionsPreview(repo, actor, String(classId ?? ""), String(skillId ?? "")) }; }
  catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}
