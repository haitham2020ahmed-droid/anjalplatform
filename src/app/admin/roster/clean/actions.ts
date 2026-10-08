"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { archiveStudents, deleteStudentsPermanently, type RosterScope } from "@/server/admin/roster-clean";

const scopeOf = async (f: FormData): Promise<RosterScope> => {
  const kind = String(f.get("scope") ?? "");
  if (kind === "grade") return { kind: "GRADE", grade: Number(f.get("grade")) };
  if (kind === "class") return { kind: "CLASS", classId: String(f.get("classId") ?? "") };
  return { kind: "SCHOOL" };
};
const back = (q: string, msg: string) => redirect(`/admin/roster/clean?${q}&msg=${encodeURIComponent(msg)}`);

export async function archiveRosterAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  let msg: string;
  try { msg = `📦 ${await archiveStudents(repo, actor, await scopeOf(f))} student(s) archived: they cannot sign in and are out of their classes; their data is kept.`; }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  back(String(f.get("q") ?? ""), msg);
}

export async function deleteRosterAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  let msg: string;
  try { const r = await deleteStudentsPermanently(repo, actor, await scopeOf(f), String(f.get("confirm") ?? "")); msg = `🗑 ${r.students} student(s) and ${r.rows} record(s) deleted permanently. You can now add the new roster.`; }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  back(String(f.get("q") ?? ""), msg);
}
