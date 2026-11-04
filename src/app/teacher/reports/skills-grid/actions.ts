"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { sendSkillsToFamily, skillPageAction, type SkillAction } from "@/server/skills/student-skills";
import { setPlanClosed } from "@/server/skills/skills-plans";

const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
const back = (q: Record<string, string>) => `/teacher/reports/skills-grid?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`;

/** ⭐ Skill page: Assign to students not mastered · Create small group · Reteach to whole class (one press each). */
export async function skillActionAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), key = String(f.get("key") ?? ""), action = String(f.get("action") ?? "") as SkillAction;
  let msg: string;
  try {
    if (!["NOT_MASTERED", "SMALL_GROUP", "RETEACH"].includes(action)) throw new ValidationError("Choose an action.");
    const r = await skillPageAction(repo, actor, classId, key, action, new Date(), String(f.get("source") ?? ""));
    msg = `Assigned to ${r.students} student${r.students === 1 ? "" : "s"} ✓`;
  } catch (e) { if (!known(e)) throw e; msg = (e as Error).message; }
  redirect(back({ classId, view: "skill", skill: key, msg }));
}

/** 🗂️ r84 Plans tab: "Close plan" (moves the card to Finished plans) or "Reopen" — a teacher-side flag only. */
export async function closePlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const classId = String(f.get("classId") ?? ""), planId = String(f.get("planId") ?? ""), close = String(f.get("close") ?? "1") === "1";
  let msg: string;
  try { await setPlanClosed(repo, actor, classId, planId, close); msg = close ? "Plan closed: it is now under Finished plans ✓" : "Plan opened again ✓"; }
  catch (e) { if (!known(e)) throw e; msg = (e as Error).message; }
  redirect(back({ classId, tab: "plans", from: String(f.get("from") ?? ""), to: String(f.get("to") ?? ""), msg }));
}

/** 📨 Send the student's My Skills to the family (the school admin approves it first). */
export async function sendSkillsFamilyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const studentId = String(f.get("studentId") ?? ""), classId = String(f.get("classId") ?? "");
  let msg: string;
  try { await sendSkillsToFamily(repo, actor, studentId); msg = actor.role === "TEACHER" ? "Sent to the school admin for approval ✓" : "Sent to the family ✓"; }
  catch (e) { if (!known(e)) throw e; msg = (e as Error).message; }
  redirect(back({ classId, view: "student", student: studentId, msg }));
}
