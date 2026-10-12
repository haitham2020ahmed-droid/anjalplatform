import { notFound, redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { lockedTaskForStudent, type LockedStudentView } from "@/server/writing/locked";
import { LockedWriter } from "@/components/writing/locked-writer";

export const metadata = { title: "Writing" };
export const dynamic = "force-dynamic";

/**
 * 🔒 The locked writing page: its own minimal frame (no menu, no links, no back button). Everything that counts
 * (opening, leaving, autosave, the time limit) goes through /api/writing/locked; this render only applies the server's
 * time limit (an essay past it is submitted).
 */
export default async function LockedWritePage({ params }: { params: Promise<{ taskId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const { taskId } = await params;
  let v: LockedStudentView;
  try { v = await lockedTaskForStudent(repo, actor, taskId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  if (v.status === "NOT_STARTED" || (v.status === "IN_PROGRESS" && !v.startedAt) || v.status === "GRADED") redirect(`/student/writing/${encodeURIComponent(taskId)}`);
  return <LockedWriter taskId={v.id} title={v.title} promptHtml={v.promptHtml} minWords={v.minWords} />;
}
