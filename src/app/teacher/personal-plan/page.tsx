import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { mapCenterHref } from "../map-center/href";

/** The personal and 3-level plan is now “Make a MAP plan” on the MAP page (its Word document is under Reports). */
export default async function PersonalPlanRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  redirect(mapCenterHref("plan", await searchParams));
}
