import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "My classes" };

/** 👥 My Classes is now part of My Students (each class is a section there, with its class page, dashboard and levels). */
export default async function MyClassesPage() {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  redirect("/teacher/students");
}
