import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Preview as student" };

/**
 * 👁 "See it as the student does" merged into the ONE preview (owner r67: nothing twice): Preview as student
 * (/teacher/student-view) opens any page where the teacher's work reaches the student, read only.
 */
export default async function AsStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const { studentId } = await params;
  redirect(`/teacher/student-view?${new URLSearchParams({ student: studentId })}`);
}
