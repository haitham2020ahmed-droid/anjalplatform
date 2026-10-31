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
import { setTeachersCanAddStudents } from "@/server/teacher/class-students";

export type SchoolResult = { ok?: boolean; error?: string; message?: string; count?: number; result?: QuickResult; withdrawn?: number };
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

/** The switch "Teachers can add students" (School page). */
export async function teachersAddStudentsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  await setTeachersCanAddStudents(repo, actor, f.get("on") === "1");
  revalidatePath("/admin/school");
}

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
  return run(async () => {
    const { withdrawn } = await moveStudent(repo, actor, id.parse(studentUserId), id.parse(classId));
    // the count is rendered client-side via t(message, {n}) — never bake it into the message string, or it can
    // never be found/translated in en.ts/ar.ts (one entry would have to cover every possible count).
    return withdrawn > 0
      ? { message: "Student moved. {n} open assignment(s) from the old class no longer show in their My Work (answers are kept).", withdrawn }
      : { message: "Student moved." };
  });
}

export async function changeTeacherAction(classId: string, teacherId: string, keepOld: boolean): Promise<SchoolResult> {
  const actor = await requireActor(ADMIN);
  return run(async () => { await transferClass(repo, actor, id.parse(classId), id.parse(teacherId), Boolean(keepOld)); return { message: "Teacher changed." }; });
}

export async function resetClassPasswordsAction(classId: string): Promise<SchoolResult> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  return run(async () => ({ count: await resetClassPasswords(repo, actor, id.parse(classId)) }));
}
