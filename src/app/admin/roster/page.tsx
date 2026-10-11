import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

/** Import Users now lives on the School page (the “Upload roster” dialog); the server actions are unchanged. */
export default async function RosterPage() {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  redirect("/admin/school?open=roster");
}
