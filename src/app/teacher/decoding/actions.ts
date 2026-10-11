"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { inviteToScreen } from "@/server/word-study/screener";

/** “Ask these students to take the screener”: creates the invitations and notifies the students. */
export async function inviteScreensAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "").slice(0, 191);
  const ids = f.getAll("studentId").map(String).slice(0, 200);
  let msg: string;
  try {
    const n = await inviteToScreen(repo, actor, classId, ids);
    msg = n ? `✓ ${n} student${n === 1 ? "" : "s"} asked to take the word check. They see it in their notifications and on their Word Check page.` : "Those students already have a word check waiting.";
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    msg = `⚠️ ${e.message}`;
  }
  redirect(`/teacher/decoding?classId=${encodeURIComponent(classId)}&msg=${encodeURIComponent(msg)}`);
}
