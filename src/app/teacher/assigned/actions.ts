"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { cancelAssignment, cancelMany, isAssignedKind, parseBulkRefs, restoreAssignment, restoreMany } from "@/server/teacher/assigned";

const STAFF = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError || (e as { status?: number })?.status === 403;

/** Back to the same list (filters kept), with what happened — and the Undo it needs. */
function back(f: FormData, extra: Record<string, string>): never {
  const raw = String(f.get("back") ?? "");
  const q = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : "");
  for (const k of ["done", "k", "i", "s", "err"]) q.delete(k);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  redirect(`/teacher/assigned?${q.toString()}`);
}

/** 🚫 Cancel for everyone, or remove one student (soft: answers and results are kept). */
export async function cancelAssignedAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF], permission: "assignments:create" });
  const kind = String(f.get("kind") ?? ""), id = String(f.get("id") ?? ""), sid = String(f.get("studentId") ?? "");
  if (!isAssignedKind(kind)) back(f, { err: "Unknown kind of work." });
  try { await cancelAssignment(repo, actor, kind, id, sid || null); }
  catch (e) { if (known(e)) back(f, { err: (e as Error).message.slice(0, 200) }); throw e; }
  back(f, { done: sid ? "removed" : "cancelled", k: kind, i: id, s: sid });
}

/**
 * ☑ Several at once (owner r68): "Cancel selected" / "Undo selected" and the toast's Undo. Returns what happened (the
 * page refreshes: cancelled rows disappear from the default list).
 */
export async function bulkAssignedAction(input: { op: "cancel" | "restore"; refs: string[] }): Promise<{ ok: boolean; done: string[]; failed: number; message?: string }> {
  const actor = await requireActor({ roles: [...STAFF], permission: "assignments:create" });
  const refs = parseBulkRefs(Array.isArray(input?.refs) ? input.refs.map(String) : []);
  if (!refs.length) return { ok: false, done: [], failed: 0, message: "Select at least one item." };
  try {
    const r = input.op === "restore" ? await restoreMany(repo, actor, refs) : await cancelMany(repo, actor, refs);
    revalidatePath("/teacher/assigned");
    return { ok: r.done.length > 0, done: r.done.map((x) => `${x.kind}:${x.id}`), failed: r.failed.length, message: r.failed[0]?.message };
  } catch (e) {
    if (known(e)) return { ok: false, done: [], failed: refs.length, message: (e as Error).message.slice(0, 200) };
    throw e;
  }
}

/** ↩ Undo: the work is back in the students' My Work, with their answers as they were. */
export async function restoreAssignedAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF], permission: "assignments:create" });
  const kind = String(f.get("kind") ?? ""), id = String(f.get("id") ?? ""), sid = String(f.get("studentId") ?? "");
  if (!isAssignedKind(kind)) back(f, { err: "Unknown kind of work." });
  try { await restoreAssignment(repo, actor, kind, id, sid || null); }
  catch (e) { if (known(e)) back(f, { err: (e as Error).message.slice(0, 200) }); throw e; }
  back(f, { done: "restored", k: kind, i: id, s: sid });
}
