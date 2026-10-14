"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { runMigration } from "@/server/skills/status-extras";

/** ⭐ System check → "Compute skill stars again": every student's status from the practice data (idempotent). */
export async function runStarsMigrationAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await runMigration(repo, actor);
  revalidatePath("/admin/system");
}
