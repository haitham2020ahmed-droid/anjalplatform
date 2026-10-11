import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

/** 👪 The Family Report is now a section of My Reports → "For my family" (with the English | Arabic switch). */
export default async function FamilyReport() {
  await requireActor({ roles: ["STUDENT"] });
  redirect("/student/reports?view=family");
}
