import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/next";

export const metadata = { title: "Skill" };

/**
 * 🔗 r87: the ONE stable link printed for every skill in the Curriculum Map PDF (/skill?code=G4.U1.TS1.CV), so
 * the PDF never has to guess who opens it — a teacher, a student or a parent, on the platform or not logged in
 * yet. This page does no work itself: it reads who is signed in and sends them straight to the page built for
 * their own role (teacher: the full preview with the answer key; student/parent: the read-only family preview).
 * Not signed in → the login page; after they sign in, they land on their role's home and can search "Curriculum
 * Map" from there (the platform's login does not carry a return address past that point — matches every other
 * login redirect on the platform, not a new limitation of this link).
 */
export default async function SkillRouterPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = String((await searchParams).code ?? "").trim();
  const s = await getActor();
  if (!s) redirect("/login");
  const q = code ? `?code=${encodeURIComponent(code)}` : "";
  if (s.actor.role === "TEACHER" || s.actor.role === "SCHOOL_ADMIN" || s.actor.role === "SUPER_ADMIN") redirect(`/teacher/preview${q}`);
  if (s.actor.role === "STUDENT") redirect(`/student/curriculum/skill${q}`);
  if (s.actor.role === "PARENT") redirect(`/parent/skill${q}`);
  redirect("/login");
}
