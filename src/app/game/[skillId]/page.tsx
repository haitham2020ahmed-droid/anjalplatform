import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { recordGameJoin } from "@/server/game/skill-games";

export const metadata = { title: "Skill game" };

/**
 * 🎯 A skill's game (opened from "My skills" or a teacher's QR card). Games Part 1: it now opens Quiz Race on that
 * skill — filled from the bank at the student's level, game points only (the older skill game ran the adaptive
 * practice engine, so it changed mastery and levels, which games must never do). QR joins are still recorded.
 */
export default async function SkillGamePage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ via?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const { skillId } = await params;
  const via = (await searchParams).via === "qr" ? "QR" : "LINK";
  await recordGameJoin(repo, actor, skillId, via);
  redirect(`/student/play/quiz-race/${encodeURIComponent(skillId)}`);
}
