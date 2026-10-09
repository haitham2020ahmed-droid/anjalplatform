"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { createTask, scoreSubmission, type TaskKind } from "@/server/teacher/writing";

export async function createTaskAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId"));
  let to: string;
  try {
    const id = await createTask(repo, actor, { classId, kind: (f.get("kind") === "READ_ALOUD" ? "READ_ALOUD" : "WRITE") as TaskKind, title: String(f.get("title") ?? ""), prompt: String(f.get("prompt") ?? ""), passage: String(f.get("passage") ?? "") || null, minWords: Number(f.get("minWords")) || null, dueAt: f.get("dueAt") ? new Date(`${String(f.get("dueAt"))}T20:59:00Z`) : null });
    to = `/teacher/writing?classId=${classId}&task=${id}&msg=${encodeURIComponent("✓ Sent. Students were notified.")}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) to = `/teacher/writing?classId=${classId}&msg=${encodeURIComponent(`⚠️ ${e.message}`)}`; else throw e; }
  redirect(to);
}

export async function scoreAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const taskId = String(f.get("taskId")), studentId = String(f.get("studentId"));
  const scores: Record<string, number> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("s.")) scores[k.slice(2)] = Number(v);
  let msg = "✓ Scored. The student can see it.";
  try { await scoreSubmission(repo, actor, taskId, studentId, scores, String(f.get("comment") ?? "")); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/teacher/writing?classId=${String(f.get("classId"))}&task=${taskId}&msg=${encodeURIComponent(msg)}#s-${studentId}`);
}
