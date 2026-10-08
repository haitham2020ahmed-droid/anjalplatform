"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { decideDeletion, requestDeletion } from "@/server/admin/question-requests";

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
