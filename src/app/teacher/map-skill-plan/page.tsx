import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { mapCenterHref } from "../map-center/href";

/** The MAP skill plan is now part of “Make a MAP plan” on the MAP page (skills suggested from the lowest sub-areas). */
export default async function MapSkillPlanRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const sp = await searchParams;
  redirect(mapCenterHref("plan", { ...sp, subject: sp.group === "GRAMMAR" || sp.group === "MECH" || sp.group === "WRITING" ? "LANGUAGE" : sp.subject }));
}
