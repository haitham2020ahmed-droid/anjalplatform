import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { mapCenterHref } from "../map-center/href";

/** MAP recommendations are now the suggestion step of “Make a MAP plan” on the MAP page. */
export default async function MapRecommendationsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  redirect(mapCenterHref("plan", await searchParams));
}
