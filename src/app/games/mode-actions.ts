"use server";
import { repo, requireActor } from "@/server/auth/next";
import { liveModesFor } from "@/server/game/visibility";

/** 🏁 Live Challenge setup: the game modes with enough fitting questions for the chosen skills (teacher / admin). */
export async function liveModesForSkillsAction(skillIds: string[]): Promise<{ modes: string[] }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  return { modes: await liveModesFor(repo, actor, Array.isArray(skillIds) ? skillIds.map(String) : []) };
}
