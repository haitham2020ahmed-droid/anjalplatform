"use server";
/**
 * Staff action: reset a user's password (teacher → own students; admin → own school).
 * Scope is enforced inside resetPassword(); the UI only shows the button where allowed.
 * Returns the temporary password once so the teacher can tell the student.
 */
import { headers } from "next/headers";
import { z } from "zod";
import { clientIp } from "@/server/auth/http";
import { repo, requireActor } from "@/server/auth/next";
import { resetPassword } from "@/server/auth/passwords-admin";
import { ForbiddenError } from "@/server/auth/rbac";

export async function resetPasswordAction(userId: string): Promise<{ temporaryPassword?: string; error?: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const id = z.string().min(1).max(191).parse(userId);
  try {
    return await resetPassword(repo, actor, id, { ip: clientIp(await headers()) });
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
