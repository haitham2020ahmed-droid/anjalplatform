"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { cancelAssignment, isAssignedKind } from "@/server/teacher/assigned";
import { adminCancelSkillEverywhere, adminCancelAllAssignedSkills, adminCancelSkillInClass, adminCancelAllAssignedSkillsInClass } from "@/server/admin/cancel-skill";

const ADMIN = ["SCHOOL_ADMIN", "SUPER_ADMIN"] as const;
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError || (e as { status?: number })?.status === 403;

/** Back to the picker, with what happened (or why it did not). */
function back(studentId: string, extra: Record<string, string>): never {
  const q = new URLSearchParams({ student: studentId });
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  redirect(`/admin/cancel-skill?${q.toString()}`);
}

/** Back to the picker's "cancel by skill name" box, keeping the search, with what happened. */
function backBulk(skillQuery: string, extra: Record<string, string>): never {
  const q = new URLSearchParams({ skill: skillQuery });
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  redirect(`/admin/cancel-skill?${q.toString()}`);
}

/** Back to the picker's "cancel in this class" box, keeping the class and its own search, with what happened. */
function backClass(classId: string, classSkill: string, extra: Record<string, string>): never {
  const q = new URLSearchParams({ class: classId, classSkill });
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  redirect(`/admin/cancel-skill?${q.toString()}`);
}

/**
 * 🚫 Cancel one skill for ONE student — the exact same mechanism a teacher's "Remove" (Assigned page, open a row's
 * students) uses: cancelAssignment with a studentId, a soft cancel (AssignmentCancel row). Nothing else is changed;
 * the student's answers stay. Admin-only (role, checked again inside cancelAssignment's own scope check).
 */
export async function adminCancelSkillAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...ADMIN], permission: "assignments:create" });
  const kind = String(f.get("kind") ?? "");
  const id = String(f.get("id") ?? "");
  const studentId = String(f.get("studentId") ?? "");
  if (!isAssignedKind(kind) || !id || !studentId) back(studentId, { err: "Unknown skill." });
  try {
    await cancelAssignment(repo, actor, kind, id, studentId);
  } catch (e) {
    if (known(e)) back(studentId, { err: (e as Error).message.slice(0, 200) });
    throw e;
  }
  back(studentId, { done: "1" });
}

/**
 * 🚫🚫 Cancel every live assignment of ONE exact skill title, for EVERY student, in EVERY class of the school — the
 * "cancel one specific skill" the owner asked for (a skill they no longer want anyone working on this term). Each
 * item is cancelled the same way as a single student's "Remove" (cancelAssignment with studentId: null → everyone),
 * so it is Undo-able per item from the Assigned page afterwards.
 */
export async function adminCancelSkillEverywhereAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...ADMIN], permission: "assignments:create" });
  const kind = String(f.get("kind") ?? "");
  const title = String(f.get("title") ?? "");
  const skillQuery = String(f.get("skillQuery") ?? "");
  if (!isAssignedKind(kind) || !title) backBulk(skillQuery, { err: "Unknown skill." });
  try {
    const n = await adminCancelSkillEverywhere(repo, actor, kind, title);
    backBulk(skillQuery, { bulkDone: String(n) });
  } catch (e) {
    if (known(e)) backBulk(skillQuery, { err: (e as Error).message.slice(0, 200) });
    throw e;
  }
}

/**
 * 🚫🚫🚫 Cancel EVERY currently-assigned skill / progress check, for every student, every grade, every class of the
 * school — the "cancel all skills in My Work" the owner asked for. A single, school-wide action; each item cancelled
 * is still Undo-able one at a time afterwards from the Assigned page (nothing is deleted).
 */
export async function adminCancelAllAction(): Promise<void> {
  const actor = await requireActor({ roles: [...ADMIN], permission: "assignments:create" });
  const n = await adminCancelAllAssignedSkills(repo, actor);
  redirect(`/admin/cancel-skill?${new URLSearchParams({ allDone: String(n) }).toString()}`);
}

/**
 * 🚫 Cancel every live assignment of ONE skill title, for every student, in ONE class only — the "cancel a skill
 * inside a specific class" the owner asked for, narrower than "everywhere".
 */
export async function adminCancelSkillInClassAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...ADMIN], permission: "assignments:create" });
  const kind = String(f.get("kind") ?? "");
  const title = String(f.get("title") ?? "");
  const classId = String(f.get("classId") ?? "");
  const classSkill = String(f.get("classSkill") ?? "");
  if (!isAssignedKind(kind) || !title || !classId) backClass(classId, classSkill, { err: "Unknown skill or class." });
  try {
    const n = await adminCancelSkillInClass(repo, actor, kind, title, classId);
    backClass(classId, classSkill, { classDone: String(n) });
  } catch (e) {
    if (known(e)) backClass(classId, classSkill, { err: (e as Error).message.slice(0, 200) });
    throw e;
  }
}

/** 🚫🚫 Cancel EVERY currently-assigned skill/progress check of ONE class only (every student in it). */
export async function adminCancelAllInClassAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...ADMIN], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  const classSkill = String(f.get("classSkill") ?? "");
  if (!classId) backClass(classId, classSkill, { err: "Choose a class." });
  try {
    const n = await adminCancelAllAssignedSkillsInClass(repo, actor, classId);
    backClass(classId, classSkill, { classAllDone: String(n) });
  } catch (e) {
    if (known(e)) backClass(classId, classSkill, { err: (e as Error).message.slice(0, 200) });
    throw e;
  }
}
