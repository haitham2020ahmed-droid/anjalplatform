"use server";
/**
 * School page actions. Each one only checks the input; the rules (admin only, own school, audit) live in the
 * services: src/server/admin/school.ts, users.ts (moveStudent) and teacher/support.ts (transferClass).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { addClass, addGrade, addStudentsToClass, resetClassPasswords } from "@/server/admin/school";
import { moveStudent } from "@/server/admin/users";
import { transferClass } from "@/server/teacher/support";
import type { QuickResult } from "@/server/admin/quick-students";

export type SchoolResult = { ok?: boolean; error?: string; message?: string; count?: number; result?: QuickResult };
const id = z.string().min(1).max(191);

async function run(fn: () => Promise<Omit<SchoolResult, "ok" | "error">>): Promise<SchoolResult> {
  try {
    const r = await fn();
    revalidatePath("/admin/school");
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: "Some fields are missing or invalid." };
    throw e;
  }
}
const ADMIN = { roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] as ("SCHOOL_ADMIN" | "SUPER_ADMIN")[], permission: "classes:manage" as const };

export async function addGradeAction(level: number): Promise<SchoolResult> {
  const actor = await requireActor(ADMIN);
  return run(async () => { await addGrade(repo, actor, z.number().int().min(1).max(12).parse(Number(level))); return { message: "Grade added." }; });
}

export async function addClassAction(gradeLevel: number, name: string): Promise<SchoolResult> {
  const actor = await requireActor(ADMIN);
  return run(async () => { await addClass(repo, actor, { gradeLevel: z.number().int().min(1).max(12).parse(Number(gradeLevel)), name: z.string().max(40).parse(String(name ?? "")) }); return { message: "Class created." }; });
}

export async function addStudentsAction(classId: string, names: string): Promise<SchoolResult> {
  const actor = await requireActor(ADMIN);
  return run(async () => {
    const result = await addStudentsToClass(repo, actor, id.parse(classId), z.string().max(10_000).parse(String(names ?? "")));
    revalidatePath("/admin/users");
    return { result, count: result.created.length };
  });
}

export async function moveStudentToClassAction(studentUserId: string, classId: string): Promise<SchoolResult> {
  const actor = await requireActor(ADMIN);
  return run(async () => { await moveStudent(repo, actor, id.parse(studentUserId), id.parse(classId)); return { message: "Student moved." }; });
}

export async function changeTeacherAction(classId: string, teacherId: string, keepOld: boolean): Promise<SchoolResult> {
  const actor = await requireActor(ADMIN);
  return run(async () => { await transferClass(repo, actor, id.parse(classId), id.parse(teacherId), Boolean(keepOld)); return { message: "Teacher changed." }; });
}

export async function resetClassPasswordsAction(classId: string): Promise<SchoolResult> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  return run(async () => ({ count: await resetClassPasswords(repo, actor, id.parse(classId)) }));
}
