"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { deleteTeacherReview } from "@/server/curriculum-map/review-control";

type Out<T> = { ok: true; value: T } | { ok: false; message: string };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
async function run<T>(fn: () => Promise<T>): Promise<Out<T>> {
  try { return { ok: true, value: await fn() }; } catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}
const TEACHER = { roles: ["TEACHER" as const], permission: "assignments:create" as const };

/** 📚 "My Reviews" → ➖ Remove one Review for good (a per-Set Review returns to the place's shared defaults; a
 * whole-grade Review Builder is gone). */
export async function deleteMyReviewAction(id: string): Promise<Out<null>> {
  const actor = await requireActor(TEACHER);
  return run(async () => { await deleteTeacherReview(repo, actor, String(id ?? "")); return null; });
}
