import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

/** 🗂️ My Plans is gone: every plan's work is in My Work (and in its program page: MAP, RTI, NAFS, Curriculum). */
export default async function MyPlans() {
  await requireActor({ roles: ["STUDENT"] });
  redirect("/student");
}
