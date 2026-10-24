"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { cancelAssignment } from "@/server/teacher/assign";

/**
 * ✖ Cancel a sent Review from the Review Reports page itself (r93, "في مشكله تانيه ان review reports جايب
 * reviews اتلغت اصلا"): the "My Reviews" page's delete button only removes the teacher's own question-selection
 * template (TeacherReviewSet) — it has no link to the Assignment actually sent to the class, so a sent Review kept
 * showing here as fully active even after its template was "removed". This reuses the same cancelAssignment()
 * already used by /teacher/assignments/[assignmentId] and the skill-plan ⭐ un-star — same guarantee: the Review
 * disappears from students' lists at once, answers already given are kept, only the class's own teacher (or a
 * school admin) can do it.
 */
export async function cancelReviewAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("assignmentId") ?? "");
  const classId = String(f.get("classId") ?? "");
  let to = `/teacher/reports/review-reports${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`;
  const sep = to.includes("?") ? "&" : "?";
  if (f.get("confirm") !== "yes") redirect(`${to}${sep}msg=${encodeURIComponent("⚠️ Tick the box to confirm the cancellation.")}`);
  try {
    const r = await cancelAssignment(repo, actor, id);
    to += `${sep}msg=${encodeURIComponent(`✓ “${r.title}” was cancelled. It is no longer on the students' lists; answers already given are kept.`)}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) to += `${sep}msg=${encodeURIComponent(`⚠️ ${e.message}`)}`; else throw e; }
  redirect(to);
}
