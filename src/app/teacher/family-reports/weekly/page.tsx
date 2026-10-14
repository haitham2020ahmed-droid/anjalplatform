import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Family reports this week" };

/**
 * 👪 The older "Weekly family summary" merged into ONE weekly family page (owner: nothing twice): "Family reports this
 * week" (/teacher/family-reports/this-week) — the week per student in English or Arabic, the teacher's note, one PDF
 * per student or the whole class. Old links (?classId=, ?studentId=) open it.
 */
export default async function WeeklySummaryPage({ searchParams }: { searchParams: Promise<{ classId?: string; studentId?: string }> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries({ classId: sp.classId ?? "", studentId: sp.studentId ?? "" }).filter(([, v]) => v));
  redirect(`/teacher/family-reports/this-week${q.size ? `?${q}` : ""}`);
}
