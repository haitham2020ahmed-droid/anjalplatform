"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { setStudentPasswordsToUsername, stopUsernamePasswords } from "@/server/admin/student-cards";

const back = (f: FormData, msg: string) => {
  const q = new URLSearchParams();
  const classId = String(f.get("classId") ?? ""), grade = String(f.get("grade") ?? "");
  if (classId) q.set("classId", classId);
  if (grade) q.set("grade", grade);
  q.set("msg", msg);
  return `/admin/student-cards?${q.toString()}`;
};

/** Sets every student's password to their username (and keeps doing it for new students and resets). */
export async function setUsernamePasswordsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  let to: string;
  if (f.get("confirm") !== "yes") to = back(f, "⚠️ Tick the box to confirm first.");
  else {
    try {
      const r = await setStudentPasswordsToUsername(repo, actor); // the whole school: the cards must always be right
      to = back(f, `✓ ${r.updated} student password(s) are now the same as the username. New students will get the same.`);
    } catch (e) {
      if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
      to = back(f, `⚠️ ${e.message}`);
    }
  }
  redirect(to);
}

/** New students and resets go back to a temporary password (existing passwords do not change). */
export async function stopUsernamePasswordsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  await stopUsernamePasswords(repo, actor);
  redirect(back(f, "✓ New students will get a temporary password again."));
}
