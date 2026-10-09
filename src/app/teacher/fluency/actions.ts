"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { saveFluency } from "@/server/teacher/support";

/** Saves the fluency checks typed for the class (rows left empty are skipped). */
export async function saveFluencyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  const entries = f.getAll("studentId").map(String).map((id) => ({ studentId: id, wcpm: Number(f.get(`w-${id}`)), raw: String(f.get(`w-${id}`) ?? ""), accuracy: f.get(`a-${id}`) ? Number(f.get(`a-${id}`)) : null, note: String(f.get(`n-${id}`) ?? "") || null })).filter((e) => e.raw.trim() !== "");
  let msg: string;
  try { const n = await saveFluency(repo, actor, classId, entries); msg = n ? `✓ ${n} fluency check(s) saved. They show in the Diagnostic analysis and the family reports.` : "Type a number of words per minute first."; }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  redirect(`/teacher/fluency?classId=${classId}&msg=${encodeURIComponent(msg)}`);
}
