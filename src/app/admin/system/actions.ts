"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { queueMigration } from "@/server/skills/status-extras";

/**
 * ⭐ System check → "Compute skill stars again": every student's status from the practice data (idempotent). r68: queued
 * as the light background job (batches of 25 students, memory gate) — the button returns at once and the page shows
 * the new report when the job has finished (it never runs school-wide inside the request).
 */
export async function runStarsMigrationAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await queueMigration(repo, actor);
  revalidatePath("/admin/system");
}
