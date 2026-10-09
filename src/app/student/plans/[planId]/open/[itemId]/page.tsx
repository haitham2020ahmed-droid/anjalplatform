import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { openPlanItem } from "@/server/curriculum-map/curriculum-plan";

export const dynamic = "force-dynamic";

/** Opens one part of a plan (made the first time anyone in the class starts it), then goes to its questions. */
export default async function OpenPlanItem({ params }: { params: Promise<{ planId: string; itemId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const { planId, itemId } = await params;
  let href: string;
  try { href = await openPlanItem(repo, actor, planId, itemId); }
  catch (e) {
    if (e instanceof ForbiddenError || e instanceof ValidationError) redirect(`/student/plans/${planId}?msg=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(href);
}
