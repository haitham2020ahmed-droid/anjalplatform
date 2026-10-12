import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

/** Students never see RTI or support-level wording: their support skills are ordinary work in My Work. */
export default async function StudentRtiPage() {
  await requireActor({ roles: ["STUDENT"] });
  redirect("/student/work");
}
