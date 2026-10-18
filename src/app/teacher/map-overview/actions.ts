"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import { setCutScores, type CutScores } from "@/server/map/nwea-reports";

/** Admin: the Spring “proficient” RIT per grade (used when the NWEA data file has no projected proficiency). */
export async function saveCutScoresAction(f: FormData): Promise<void> {
  const v: CutScores = { READING: {}, LANGUAGE: {} };
  for (const [k, val] of f.entries()) { const m = k.match(/^cut:(READING|LANGUAGE):(\d+)$/); if (m) v[m[1] as "READING" | "LANGUAGE"][Number(m[2])] = String(val).trim() ? Number(val) : null; }
  let msg = "✓ Cut scores saved.";
  try {
    const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
    await setCutScores(repo, actor, v);
  } catch (e) { if (isNextControl(e)) throw e; msg = `⚠️ ${await failureMessage(e, "map", "saveCutScores", "/teacher/map-overview")}`; } // r79: never a white page
  redirect(`/teacher/map-overview?msg=${encodeURIComponent(msg)}`);
}
