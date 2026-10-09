"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { closeExitTicket, createExitTicket, setClassGoal, setClassRhythm, type GoalKind } from "@/server/teacher/classroom";
import { hideOnboarding, planNextWeek } from "@/server/teacher/week-plan";

async function go(f: FormData, job: () => Promise<string>, to?: (r: string) => string): Promise<never> {
  let msg: string, ok = true;
  try { msg = await job(); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) { msg = `⚠️ ${e.message}`; ok = false; } else throw e; }
  redirect(ok && to ? to(msg) : `/teacher/week?${new URLSearchParams({ classId: String(f.get("classId") ?? ""), msg })}`);
}

export async function planNextWeekAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  await go(f, async () => { const r = await planNextWeek(repo, actor, String(f.get("classId"))); return `✓ Next week planned: ${r.assigned.length ? `practice again on ${r.assigned.join(", ")}` : "no reteach needed"}${r.plansSent ? `; ${r.plansSent} MAP plan(s) sent` : ""}.`; });
}

export async function classGoalAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  await go(f, async () => { await setClassGoal(repo, actor, String(f.get("classId")), { kind: String(f.get("kind")) as GoalKind, target: Number(f.get("target")), title: String(f.get("title") ?? "") }); return "✓ Class goal set: students see it on their home page."; });
}

export async function rhythmAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  await go(f, async () => { const days = Number(f.get("days")); await setClassRhythm(repo, actor, String(f.get("classId")), days ? { days, minutes: Number(f.get("minutes")) || 15 } : null); return days ? "✓ Weekly rhythm saved: students who fall behind get a reminder from Wednesday." : "Weekly rhythm turned off."; });
}

export async function exitTicketAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  let id = "";
  await go(f, async () => { id = await createExitTicket(repo, actor, String(f.get("classId")), { skillId: String(f.get("skillId") ?? "") || null }); return "✓ Exit ticket open: students see it on their home page now."; }, (m) => `/teacher/exit/${id}?msg=${encodeURIComponent(m)}`);
}

export async function closeTicketAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("ticketId"));
  await closeExitTicket(repo, actor, id);
  redirect(`/teacher/exit/${id}?msg=${encodeURIComponent("Exit ticket closed.")}`);
}

export async function hideChecklistAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"] });
  await hideOnboarding(repo, actor, f.get("hidden") === "1");
  redirect(String(f.get("back") ?? "/teacher"));
}
