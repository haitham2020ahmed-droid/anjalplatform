"use server";
/** ➕ Add students by name · ✏️ fix a name · leave the class — the teacher's own class only (rules: src/server/teacher/class-students.ts). */
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { addStudentsByName, removeFromClass, renameClassStudent, type AddByNameResult } from "@/server/teacher/class-students";

const STAFF = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError || (e as { status?: number })?.status === 403;
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

export type ClassStudentsState = { error?: string; message?: string; result?: AddByNameResult; withdrawn?: number };

function refresh(classId: string) {
  // the class page, Home, Download Accounts and the class QR sign-in list all read the class live
  for (const p of [`/teacher/classes/${classId}`, "/teacher", "/teacher/accounts", "/teacher/class-signin"]) revalidatePath(p);
}

export async function addStudentsByNameAction(classId: string, text: string): Promise<ClassStudentsState> {
  const actor = await requireActor({ roles: [...STAFF] });
  try {
    const result = await addStudentsByName(repo, actor, { classId: str(classId, 191), text: str(text, 6000) });
    refresh(classId);
    return { result };
  } catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

export async function renameClassStudentAction(classId: string, studentId: string, name: string): Promise<ClassStudentsState> {
  const actor = await requireActor({ roles: [...STAFF] });
  try {
    await renameClassStudent(repo, actor, { classId: str(classId, 191), studentId: str(studentId, 191), name: str(name, 200) });
    refresh(classId);
    return { message: "Name saved." };
  } catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

export async function removeFromClassAction(classId: string, studentId: string): Promise<ClassStudentsState> {
  const actor = await requireActor({ roles: [...STAFF] });
  try {
    const { withdrawn } = await removeFromClass(repo, actor, { classId: str(classId, 191), studentId: str(studentId, 191) });
    refresh(classId);
    // the count is rendered client-side via t(message, {n}) — never bake it into the message string, or it can
    // never be found/translated in en.ts/ar.ts (one entry would have to cover every possible count).
    return withdrawn > 0
      ? { message: "Removed from this class. {n} open assignment(s) from this class no longer show in their My Work (answers are kept).", withdrawn }
      : { message: "Removed from this class." };
  } catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}
