import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Class Transfer" };

/** Class Transfer now lives on the School page (each class → “Change teacher”); transferClassAction is kept. */
export default async function ClassTransfer() {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "classes:manage" });
  redirect("/admin/school?open=teacher");
}
