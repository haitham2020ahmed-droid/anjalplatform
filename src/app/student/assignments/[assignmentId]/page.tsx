import { notFound, redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";

/** Link from a notification: completed → the report; otherwise → practise the skill. Own assignments only. */
export default async function StudentAssignmentLink({ params }: { params: Promise<{ assignmentId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  const { assignmentId } = await params;
  const mine = actor.studentId ? (await repo.findMany("AssignmentStudent", { assignmentId, studentId: actor.studentId }))[0] : undefined;
  const a = mine ? await repo.findUnique("Assignment", { id: assignmentId }) : null;
  if (!a || a.deletedAt || !a.skillId) notFound();
  if (mine!.status === "COMPLETED") redirect(`/student/assignments/${assignmentId}/report`);
  redirect(`/practice/${String(a.skillId)}`);
}
