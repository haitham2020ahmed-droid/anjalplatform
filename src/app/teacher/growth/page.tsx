import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { mapCenterHref } from "../map-center/href";

/** MAP growth is now a section of Reports on the MAP page (shown once Winter or Spring scores exist). */
export default async function GrowthRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  redirect(mapCenterHref("reports", await searchParams));
}
