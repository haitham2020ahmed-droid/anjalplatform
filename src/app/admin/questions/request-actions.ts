"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { decideDeletion, requestDeletion } from "@/server/admin/question-requests";
import { decideEdit, restoreEdit } from "@/server/admin/question-edits";
import { reportQuestionProblem } from "@/server/teacher/classroom";

const msgOf = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };

export async function requestDeletionAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "questions:edit" });
  const id = String(f.get("questionId") ?? "");
  let msg: string;
  try { await requestDeletion(repo, actor, id, String(f.get("reason") ?? "")); msg = "Deletion requested. An admin will decide."; }
  catch (e) { msg = msgOf(e); }
  redirect(`/admin/questions/${id}?msg=${encodeURIComponent(msg)}`);
}

export async function decideDeletionAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  let msg: string;
  try {
    const r = await decideDeletion(repo, actor, String(f.get("questionId") ?? ""), f.get("decision") === "approve");
    msg = r === "deleted" ? "Approved: the question was deleted." : r === "archived" ? "Approved: students had answered it, so it was archived (their history is kept)." : "Request rejected: the question stays.";
  } catch (e) { msg = msgOf(e); }
  redirect(`/admin/questions/requests?msg=${encodeURIComponent(msg)}`);
}

/** ✏️ The admin approves or rejects a teacher's change of a question. */
export async function decideEditAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  let msg: string;
  try {
    const r = await decideEdit(repo, actor, String(f.get("questionId") ?? ""), f.get("decision") === "approve", String(f.get("note") ?? "") || null);
    msg = r.result === "applied" ? "Approved: the change now applies for every student." : "Change rejected: the question stays as it was.";
  } catch (e) { msg = msgOf(e); }
  redirect(`/admin/questions/requests?msg=${encodeURIComponent(msg)}`);
}

/** ↩ Restore the version before one logged change (admin). */
export async function restoreEditAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  let id = String(f.get("questionId") ?? ""), msg: string;
  try { id = await restoreEdit(repo, actor, id, String(f.get("at") ?? "")); msg = "Restored: the earlier version now applies for every student."; }
  catch (e) { msg = msgOf(e); }
  redirect(`/admin/questions/${id}?msg=${encodeURIComponent(msg)}`);
}

/** 🚩 A teacher reports a problem with a question (the admin sees it in Question Check → Flags). */
export async function reportProblemAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const id = String(f.get("questionId") ?? "");
  let msg: string;
  try { await reportQuestionProblem(repo, actor, id, String(f.get("reason") ?? ""), String(f.get("note") ?? "")); msg = "Thank you. The problem was sent to the admin."; }
  catch (e) { msg = msgOf(e); }
  const back = String(f.get("back") ?? "");
  redirect(back.startsWith("/") && !back.startsWith("//") ? `${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}` : `/admin/questions/${id}?msg=${encodeURIComponent(msg)}`);
}
