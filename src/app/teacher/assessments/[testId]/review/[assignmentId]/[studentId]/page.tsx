import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TestReviewView } from "@/components/tests/test-review-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { testReview, type TestReview } from "@/server/tests/assessments";

export const metadata = { title: "Test answers" };

/** A student's answers to a test (the teacher of the class, or the admin). */
export default async function TeacherTestReview({ params }: { params: Promise<{ testId: string; assignmentId: string; studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const p = await params;
  let r: TestReview;
  try { r = await testReview(repo, actor, p.assignmentId, p.studentId); } catch (e) { if (e instanceof ForbiddenError || e instanceof ValidationError) notFound(); throw e; }
  return <AppShell name={String(me.displayName)}><TestReviewView r={r} backHref={`/teacher/assessments/${encodeURIComponent(p.testId)}`} backLabel="Test results" /></AppShell>;
}
