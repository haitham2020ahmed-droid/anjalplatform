"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { runDaily } from "@/server/insights/daily";

/** 🧠 Runs the daily learning job for the school now (decay, misconceptions, prerequisites, outcomes, profiles, digests). */
export async function runEngineNowAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const r = await runDaily(repo, actor.schoolId!, new Date());
  redirect(`/admin/learning-engine?msg=${encodeURIComponent(`Done: ${r.profiles} profiles, ${r.tagged} options tagged, ${r.prerequisites} prerequisites added, ${r.recommendations} recommendations checked, ${r.interventions} interventions measured, ${r.decayed} skills faded, ${r.digests} teacher summaries.`)}`);
}
