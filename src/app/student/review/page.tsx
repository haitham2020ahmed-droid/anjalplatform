import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Review my mistakes" };

/**
 * 🔁 Review my mistakes now lives in ⭐ Second Chance: by the school's rule, Second Chance is the ONLY place a missed
 * question is shown again (questions/fresh.ts). Old links and bookmarks land there.
 */
export default async function ReviewPage() {
  await requireActor({ roles: ["STUDENT"] });
  redirect("/student/second-chance");
}
