import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SkillGame } from "@/components/game/skill-game";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startPractice } from "@/server/practice/session";
import { canPlaySkill, recordGameJoin } from "@/server/game/skill-games";
import { submitAnswerAction } from "@/app/practice/[skillId]/actions";

export const metadata = { title: "Skill game" };

/** 🎯 A skill game at the student's own level (opened from “My skills” or a teacher's QR card). */
export default async function SkillGamePage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ via?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { skillId } = await params;
  const via = (await searchParams).via === "qr" ? "QR" : "LINK";
  if (!(await canPlaySkill(repo, actor, skillId))) {
    return (
      <AppShell name={String(me.displayName)}>
        <p className="text-lg text-slate-700">This game is not for your grade, or it has no questions yet.</p>
        <Link href="/student/skills" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My skills</Link>
      </AppShell>
    );
  }
  await recordGameJoin(repo, actor, skillId, via);
  try {
    const view = await startPractice(repo, actor, skillId);
    return <AppShell name={String(me.displayName)}><SkillGame initial={view} submit={submitAnswerAction} backHref="/student/skills" /></AppShell>;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{e.message}</p><Link href="/student/skills" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My skills</Link></AppShell>;
  }
}
