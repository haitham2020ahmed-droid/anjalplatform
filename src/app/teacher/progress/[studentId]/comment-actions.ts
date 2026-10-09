"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { addComment, deleteComment } from "@/server/teacher/classroom";
import { addNote, deleteNote, saveQuickComment } from "@/server/teacher/extras";

export async function addCommentAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const studentId = String(f.get("studentId"));
  let msg = "✓ Comment sent: the student and the parent can read it.";
  try {
    await addComment(repo, actor, studentId, String(f.get("body") ?? ""), String(f.get("assignmentId") ?? "") || null);
    if (f.get("keep") === "on") await saveQuickComment(repo, actor, String(f.get("body") ?? ""));
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/teacher/progress/${studentId}?msg=${encodeURIComponent(msg)}#comments`);
}

export async function deleteCommentAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"] });
  await deleteComment(repo, actor, String(f.get("id")));
  redirect(`/teacher/progress/${String(f.get("studentId"))}#comments`);
}

export async function addNoteAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const studentId = String(f.get("studentId"));
  let msg = "✓ Private note saved (staff only).";
  try { await addNote(repo, actor, studentId, String(f.get("body") ?? "")); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/teacher/progress/${studentId}?msg=${encodeURIComponent(msg)}#notes`);
}

export async function deleteNoteAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await deleteNote(repo, actor, String(f.get("id")));
  redirect(`/teacher/progress/${String(f.get("studentId"))}#notes`);
}
