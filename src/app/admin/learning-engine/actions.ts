"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { runDaily, riyadhDay } from "@/server/insights/daily";
import { log } from "@/server/monitoring/log";
import { memoryHigh } from "@/server/monitoring/memory";
import { inJobSlot } from "@/server/jobs/runner";

/**
 * 🧠 Runs the daily learning job for the school now (decay, misconceptions, prerequisites, outcomes, profiles, digests).
 * 🛟 r89 (server-stability audit, Oct 2026): before this fix, a manual click called runDaily directly — never
 * through the SAME slot the nightly/first-visit path uses (maybeRunDaily → inJobSlot(`daily|${schoolId}`, …)) and
 * never through the memory gate. Two admins clicking at once, or one click landing while the automatic run for the
 * same school was already mid-flight, could run two full school-wide passes side by side on the 512 MB web server —
 * exactly the scenario the rest of the engine is built to prevent, just not applied here. Now: (1) the server's
 * memory is checked first, so a busy server defers the run instead of adding a second heavy job on top; (2) the run
 * itself goes through the SAME process-wide slot as the automatic path, so a manual click and the nightly run (or
 * two manual clicks) for the same school can never execute at the same time — the second one simply waits its turn.
 */
export async function runEngineNowAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const schoolId = actor.schoolId!;
  if (memoryHigh()) {
    log("warn", "daily.run.manual_deferred_memory", { schoolId });
    redirect(`/admin/learning-engine?msg=${encodeURIComponent("The server is busy right now — please try “Update now” again in a few minutes.")}`);
  }
  const now = new Date();
  // same slot name maybeRunDaily() uses, so the automatic run and a manual click (or two manual clicks) for this
  // school are always serialized, never concurrent
  const r = await inJobSlot(`daily|${schoolId}`, () => runDaily(repo, schoolId, now));
  // r86: a manual "Update now" click bypasses maybeRunDaily's own done-mark (that write only happens on the
  // nightly-schedule / first-visit path), so engineOverview()'s `lastRun` — read from this same SchoolSetting
  // key — never reflected a manual run. Write the same done-mark here so "Last update" on the page updates too.
  const key = `daily.run.${riyadhDay(now)}`;
  const value = { ...r, doneAt: now.toISOString() };
  await repo.upsert("SchoolSetting", { schoolId, key }, { value }, { value }).catch((e) => log("error", "daily.done_mark.failed", { schoolId, key, error: e }));
  redirect(`/admin/learning-engine?msg=${encodeURIComponent(`Done: ${r.profiles} profiles, ${r.tagged} options tagged, ${r.prerequisites} prerequisites added, ${r.recommendations} recommendations checked, ${r.interventions} interventions measured, ${r.decayed} skills faded, ${r.digests} teacher summaries.`)}`);
}
