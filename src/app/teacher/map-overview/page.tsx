import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { mapCenterHref } from "../map-center/href";

/** The grade and school overview is now under Reports on the MAP page. */
export default async function MapOverviewRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const sp = await searchParams;
  const term = Array.isArray(sp.term) ? sp.term[0] : sp.term;
  redirect(mapCenterHref("reports", sp, { view: "overview", term: term ?? "" }));
}
