import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { mapCenterHref } from "../map-center/href";

/** Every MAP report is now under Reports on the MAP page. */
export default async function MapReportsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  redirect(mapCenterHref("reports", await searchParams));
}
