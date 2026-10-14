"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignYearWeek, editYearPlan, yearPlanView, type YearEdit, type YearPlanView } from "@/server/map/year-plan";

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
export async function yearAssignWeekAction(classId: string, week: number, excludeMastered = false): Promise<Out<YearPlanView>> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const r = await assignYearWeek(repo, actor, String(classId ?? ""), Number(week), new Date(), { excludeMastered: excludeMastered === true });
    return { ok: true, value: await yearPlanView(repo, actor, String(classId ?? "")), message: [`${r.assigned}`, ...r.skipped].join(" · ") };
  } catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}
