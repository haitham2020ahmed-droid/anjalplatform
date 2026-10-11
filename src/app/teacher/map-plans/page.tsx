import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { mapCenterHref } from "../map-center/href";

/** MAP plans now live on the MAP page: the class matrix → Results, plans and groups → Make a MAP plan. */
export default async function MapPlansRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const sp = await searchParams;
  redirect(mapCenterHref(sp.tab === "matrix" ? "results" : "plan", sp));
}
