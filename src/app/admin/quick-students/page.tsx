import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Quick add students" };

/** Quick add now lives on the School page (each class → “Add student”, one name per line); quickAddAction is kept. */
export default async function QuickStudentsPage() {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  redirect("/admin/school?open=add-student");
}
