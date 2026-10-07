import { AppShell } from "@/components/app-shell";
import { PracticePlayer } from "@/components/practice/practice-player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startPractice } from "@/server/practice/session";
import { isAssignedSkill } from "@/server/student/assigned";
import { isMapPracticeSkill, seedAbilityFromRit } from "@/server/map/student-map";
import { submitAnswerAction } from "./actions";

/** Starts (or resumes) adaptive practice for a skill. */
export default async function PracticePage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ from?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const { skillId } = await params;
  const me = (await getActor())!.user;
  // MAP practice: a skill of the student's own grade linked to a MAP goal area (adaptive, starts at their RIT level)
  const fromMap = (await searchParams).from === "map" && (await isMapPracticeSkill(repo, actor, skillId));
  const unitHref = fromMap ? "/student/map" : "/student";
  if (fromMap) await seedAbilityFromRit(repo, actor, skillId);
  // otherwise students practise assigned work only (checked on the server)
  if (!fromMap && !(await isAssignedSkill(repo, actor, skillId))) {
    return (
      <AppShell name={String(me.displayName)}>
        <p className="text-lg text-slate-700">This skill has not been assigned to you. Your teacher will assign the skills to practise.</p>
        <a href="/student" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My assigned skills</a>
      </AppShell>
    );
  }
  try {
    const view = await startPractice(repo, actor, skillId);
    return (
      <AppShell name={String(me.displayName)}>
        <PracticePlayer initial={view} unitHref={unitHref} submit={submitAnswerAction} />
      </AppShell>
    );
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    return (
      <AppShell name={String(me.displayName)}>
        <p className="text-lg text-slate-700">{e.message}</p>
        <a href={unitHref} className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">Back to my skills</a>
      </AppShell>
    );
  }
}
