import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

/** Students no longer browse the curriculum: they see only their assigned skills. */
export default async function StudentUnitPage() {
  await requireActor({ roles: ["STUDENT"] });
  redirect("/student");
}
