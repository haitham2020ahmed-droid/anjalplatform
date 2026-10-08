"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { createSkillPlan } from "@/server/curriculum-map/plans";

export async function createPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  let target: string;
  try {
    const due = String(f.get("dueAt") ?? "");
    const r = await createSkillPlan(repo, actor, {
      classId, title: String(f.get("title") ?? ""), codes: f.getAll("codes").map(String),
      studentIds: f.get("who") === "some" ? f.getAll("studentIds").map(String) : undefined,
      maxQuestions: Number(f.get("max")) || 20, dueAt: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59`) : null, note: String(f.get("note") ?? "") || null,
    });
    target = `/teacher/plans/${r.planId}?msg=${encodeURIComponent(`Plan assigned: ${r.items} place(s). Students were notified.${r.skipped.length ? ` Skipped: ${r.skipped.join(" · ")}` : ""}`)}`;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    target = `/teacher/plans?classId=${classId}&msg=${encodeURIComponent(e.message)}`;
  }
  redirect(target);
}
