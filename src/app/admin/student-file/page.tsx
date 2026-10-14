import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Find a student" };

/**
 * 🔎 Find a Student moved into My Students (/teacher/students: the ready list of every student, grouped by class,
 * with an instant search). `?id=` opens that student's file; anything else goes to My Students (the typed search kept).
 */
export default async function FindStudentPage({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const sp = await searchParams;
  const id = String(sp.id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (id) redirect(`/teacher/students/${id}`);
  const q = String(sp.q ?? "").trim().slice(0, 80);
  redirect(q ? `/teacher/students?${new URLSearchParams({ q })}` : "/teacher/students");
}
