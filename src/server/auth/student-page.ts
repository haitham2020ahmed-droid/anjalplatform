/**
 * A student page's actor: the signed-in student (the page's own `requireStudent`, i.e.
 * requireActor({ roles: ["STUDENT"] })) — or, for "👀 Preview as student", a teacher (or the admin) looking at one of
 * their students with `?preview=<studentId>` (src/server/student/preview-as.ts). Anyone else is sent to their own
 * home by `requireStudent`, exactly as before.
 *
 * In a preview the page reads the chosen student's data with the student's own actor; it is shown inside the
 * read-only PreviewFrame, and every Server Action of the student pages still needs a signed-in STUDENT, so a preview
 * never answers, submits or records anything.
 */
import "server-only";
import { notFound } from "next/navigation";
import { getActor, repo, requireActor } from "./next";
import { ForbiddenError, type Actor } from "./rbac";
import { previewStudentFor } from "../student/preview-as";

export interface StudentPreview { studentId: string; name: string }
export interface StudentPage { actor: Actor; me: { displayName: string }; preview: StudentPreview | null }

export async function studentPage(previewParam: string | string[] | null | undefined, requireStudent: () => Promise<Actor>): Promise<StudentPage> {
  const sid = Array.isArray(previewParam) ? previewParam[0] : previewParam;
  const s = await getActor();
  const staff = s && (s.actor.role === "TEACHER" || s.actor.role === "SCHOOL_ADMIN" || s.actor.role === "SUPER_ADMIN");
  if (sid && staff) {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
    try {
      const p = await previewStudentFor(repo, actor, String(sid));
      return { actor: p.actor, me: { displayName: p.name }, preview: { studentId: p.studentId, name: p.name } };
    } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  }
  const actor = await requireStudent();
  if (actor.role !== "STUDENT") throw new ForbiddenError("Students only.");
  return { actor, me: { displayName: String((await getActor())!.user.displayName ?? "") }, preview: null };
}
