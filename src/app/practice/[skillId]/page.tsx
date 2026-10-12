import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PracticePlayer } from "@/components/practice/practice-player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startPractice } from "@/server/practice/session";
import { skillAccess } from "@/server/student/assigned";
import { isMapPracticeSkill, seedAbilityFromRit } from "@/server/map/student-map";
import { hintAction, submitAnswerAction } from "./actions";
import { canPlaySkill } from "@/server/game/skill-games";

/** Starts (or resumes) adaptive practice for a skill. */
export default async function PracticePage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ from?: string; work?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const { skillId } = await params;
  const me = (await getActor())!.user;
  const from = (await searchParams).from;
  // 1) assigned work (the skill, another grade's copy of it, an older multi-skill row, a prerequisite the engine
  //    routes to) · 2) every skill of the student's MAP plan · 3) any skill of their own grade — all open, no
  //    "not assigned" message (owner's spec). Checked on the server; all of it counts in reports.
  const access = await skillAccess(repo, actor, skillId);
  const fromMap = !access.assigned && !access.startsAt ? await isMapPracticeSkill(repo, actor, skillId) : from === "map" && (await isMapPracticeSkill(repo, actor, skillId));
  const free = !access.assigned && !access.startsAt && !fromMap && (await canPlaySkill(repo, actor, skillId));
  const unitHref = fromMap ? "/student/map" : from === "free" ? "/student/skills" : "/student/work";
  if (fromMap) await seedAbilityFromRit(repo, actor, skillId);
  if (!access.assigned && !fromMap && !free) {
    return (
      <AppShell name={String(me.displayName)}>
        <p className="text-lg text-slate-700">{access.startsAt ? `This skill opens on ${access.startsAt.toISOString().slice(0, 10)}. Come back then!` : "This skill is for another grade. Here is your own work:"}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/student/work" className="inline-block rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white">My Work</Link>
          <Link href="/student/map" className="inline-block rounded-xl bg-white px-5 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">My Plan</Link>
        </div>
      </AppShell>
    );
  }
  try {
    // ?work= : a Curriculum Map lesson continued with skill practice (checked on the server: the student's own lesson)
    const work = (await searchParams).work;
    const view = await startPractice(repo, actor, skillId, new Date(), undefined, work ? { work: String(work).slice(0, 64) } : {});
    return (
      <AppShell name={String(me.displayName)}>
        <PracticePlayer initial={view} unitHref={unitHref} submit={submitAnswerAction} hint={hintAction} />
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
