import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

/** 🌟 The Progress Report now lives in My Reports → "My progress" (same numbers, nothing lost). */
export default async function MyProgressPage() {
  await requireActor({ roles: ["STUDENT"] });
  redirect("/student/reports?view=progress");
}
