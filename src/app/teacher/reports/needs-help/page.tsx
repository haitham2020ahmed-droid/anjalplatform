import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Mistakes and root causes" };

/**
 * 🧡 "Needs help" (repeated mistakes) merged into ONE report (owner r67: nothing twice): Reports → My class →
 * Mistakes and root causes (/teacher/reports/errors), which keeps the repeated mistakes with Assign. Old links open it.
 */
export default async function NeedsHelpReport({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const sp = await searchParams;
  redirect(`/teacher/reports/errors${sp.classId ? `?${new URLSearchParams({ classId: sp.classId })}` : ""}`);
}
