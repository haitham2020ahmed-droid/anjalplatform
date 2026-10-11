"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { addClassStudent, applyClassRoster, planClassRoster, resetToUsername, type ClassRosterPlan } from "@/server/teacher/class-accounts";
import { findSkillFamilies, type SkillFamily } from "@/server/teacher/home";

const STAFF = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError || (e as { status?: number })?.status === 403;
const MAX_FILE = 2 * 1024 * 1024;

export type AddStudentState = { error?: string; added?: { name: string; username: string; password: string; className: string } };

/** ➕ Add Student (username only; password = username). Only into the teacher's own class (checked on the server). */
export async function addStudentAction(_: AddStudentState, f: FormData): Promise<AddStudentState> {
  const actor = await requireActor({ roles: [...STAFF] });
  try {
    const r = await addClassStudent(repo, actor, { classId: String(f.get("classId") ?? ""), username: String(f.get("username") ?? ""), name: String(f.get("name") ?? "") });
    revalidatePath("/teacher");
    return { added: { name: r.name, username: r.username, password: r.password, className: r.className } };
  } catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

/** 🔎 Find a skill: one result per skill family, with grade tags. */
export async function findSkillsAction(q: string, classGrade: number | null): Promise<SkillFamily[]> {
  const actor = await requireActor({ roles: [...STAFF] });
  return findSkillFamilies(repo, actor, String(q ?? "").slice(0, 80), classGrade);
}

export type RosterState = { error?: string; plan?: ClassRosterPlan; saved?: { created: number; className: string } };

async function fileOf(f: FormData): Promise<{ name: string; bytes: Uint8Array }> {
  const file = f.get("file");
  if (!file || typeof file === "string" || !(file as File).size) throw new ValidationError("Choose the roster file (.xlsx or .csv).");
  if ((file as File).size > MAX_FILE) throw new ValidationError("The file is too big (2 MB at most).");
  return { name: (file as File).name, bytes: new Uint8Array(await (file as File).arrayBuffer()) };
}

/** 📤 Upload Roster, step 1: preview + row errors (nothing saved). */
export async function previewRosterAction(f: FormData): Promise<RosterState> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { const file = await fileOf(f); return { plan: await planClassRoster(repo, actor, String(f.get("classId") ?? ""), file.name, file.bytes) }; }
  catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

/** 📤 Upload Roster, step 2: save the previewed file (all students or none). */
export async function saveRosterAction(f: FormData): Promise<RosterState> {
  const actor = await requireActor({ roles: [...STAFF] });
  try {
    const file = await fileOf(f);
    const r = await applyClassRoster(repo, actor, String(f.get("classId") ?? ""), file.name, file.bytes, String(f.get("sha256") ?? ""));
    revalidatePath("/teacher");
    return { saved: { created: r.created, className: r.className } };
  } catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

/** 🔑 Reset one of my students' password to their username (Download Accounts page). */
export async function resetToUsernameAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  const classId = String(f.get("classId") ?? "");
  await resetToUsername(repo, actor, classId, String(f.get("studentId") ?? ""));
  revalidatePath("/teacher/accounts");
}
