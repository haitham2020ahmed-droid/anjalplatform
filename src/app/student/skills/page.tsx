import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

/** 🧩 My Skills now lives in My Reports → "My progress" (the skills from my teacher and any skill to practise). */
export default async function MySkillsPage() {
  await requireActor({ roles: ["STUDENT"] });
  redirect("/student/reports?view=progress#skills");
}
