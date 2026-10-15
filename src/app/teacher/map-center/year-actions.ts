"use server";
import { repo, requireActor } from "@/server/auth/next";
import { guardAction, guardCall } from "@/server/lib/action-guard";
import { assignYearWeek, editYearPlan, yearPlanView, type YearEdit, type YearPlanView } from "@/server/map/year-plan";
import { sendYearPlan, skillQuestionsPreview, type PreviewQuestion } from "@/server/map/year-plan-share";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type Out<T> = { ok: true; value: T; message?: string } | { ok: false; message: string };
const PATH = "/teacher/map-center?tab=year";

/**
 * 🧯 r79: a known refusal comes back as its message; anything else is logged and comes back as "Something went wrong —
 * try again" (the board shows it) — never a thrown error (Next.js's error page).
 */

/** 🗓️ Move · swap · replace · add · remove · make again — returns the plan as it is now. */
export async function yearEditAction(classId: string, edit: YearEdit): Promise<Out<YearPlanView>> {
  return guardCall("map", "yearEdit", PATH, async () => {
    const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
    await editYearPlan(repo, actor, String(classId ?? ""), edit);
    return { ok: true as const, value: await yearPlanView(repo, actor, String(classId ?? "")) };
  });
}

/** ☆ Assign this week: every skill of the week not assigned yet. */
export async function yearAssignWeekAction(classId: string, week: number, excludeMastered = false, source: string | null = null): Promise<Out<YearPlanView>> {
  return guardCall("map", "yearAssignWeek", PATH, async () => {
    const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
    const r = await assignYearWeek(repo, actor, String(classId ?? ""), Number(week), new Date(), { excludeMastered: excludeMastered === true, source });
    return { ok: true as const, value: await yearPlanView(repo, actor, String(classId ?? "")), message: [`${r.assigned}`, ...r.skipped].join(" · ") };
  });
}

/** 📤 Send the Year plan to the class's students (or stop showing it). Back to the Year plan tab. */
export async function yearSendAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? "");
  const back = (msg: string): never => redirect(`/teacher/map-center?${new URLSearchParams({ tab: "year", classId, ...(msg ? { msg } : {}) })}`);
  await guardAction("map", "yearSend", PATH, back, async () => {
    const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
    const r = await sendYearPlan(repo, actor, classId, String(f.get("on") ?? "1") !== "0");
    revalidatePath("/student/map");
    return r.sentAt ? "Sent to students ✓" : "Students no longer see the Year plan.";
  });
}

/** 🔎 The questions behind a skill of the plan (a few, with their choices). */
export async function yearQuestionsAction(classId: string, skillId: string): Promise<Out<{ total: number; questions: PreviewQuestion[] }>> {
  return guardCall("map", "yearQuestions", PATH, async () => {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
    return { ok: true as const, value: await skillQuestionsPreview(repo, actor, String(classId ?? ""), String(skillId ?? "")) };
  });
}
