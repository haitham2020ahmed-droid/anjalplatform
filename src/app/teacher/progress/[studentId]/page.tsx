import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Student file" };

/**
 * 📈 "Student Progress" merged into the ONE student file (owner: nothing twice): /teacher/students/[id] has the
 * results, the language profile, MAP, the levels (Level Story), the comments and the private notes. The MAP-based
 * plan lives in Plans (the MAP plan). Old links (#comments, #notes) open the same sections of the file.
 */
export default async function StudentProgressPage({ params }: { params: Promise<{ studentId: string }> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const { studentId } = await params;
  redirect(`/teacher/students/${encodeURIComponent(studentId)}`);
}
