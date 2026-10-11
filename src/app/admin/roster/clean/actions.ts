"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { archiveStudents, deleteStudentsPermanently, parseScope, restoreStudents } from "@/server/admin/roster-clean";

const scopeOf = (f: FormData) => parseScope((k) => (f.has(k) ? String(f.get(k)) : null));
const back = (q: string, msg: string) => redirect(`/admin/roster/clean?${q}&msg=${encodeURIComponent(msg)}`);
async function attempt(f: FormData, fn: () => Promise<string>): Promise<void> {
  let msg: string;
  try { msg = await fn(); } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  back(String(f.get("q") ?? ""), msg);
}

export async function archiveRosterAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  await attempt(f, async () => `📦 ${await archiveStudents(repo, actor, scopeOf(f))} student(s) archived: they cannot sign in and are out of their classes; their data is kept (Restore brings them back).`);
}

export async function deleteRosterAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  await attempt(f, async () => { const r = await deleteStudentsPermanently(repo, actor, scopeOf(f), String(f.get("confirm") ?? "")); return `🗑 ${r.students} student(s) and ${r.rows} record(s) deleted permanently. Classes, teachers, questions and plans are untouched.`; });
}

/** One student from the list: archive or restore. */
export async function oneStudentAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  const id = String(f.get("studentId") ?? "");
  await attempt(f, async () => f.get("op") === "restore"
    ? `↩️ ${await restoreStudents(repo, actor, [id])} student restored: they can sign in again and are back in their class.`
    : `📦 ${await archiveStudents(repo, actor, { kind: "STUDENTS", ids: [id] })} student archived.`);
}
