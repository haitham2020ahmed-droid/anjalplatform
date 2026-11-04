import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PracticePlayer } from "@/components/practice/practice-player";
import { PlayerBoundary } from "@/components/practice/player-boundary";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startPractice } from "@/server/practice/session";
import { skillAccess } from "@/server/student/assigned";
import { isMapPracticeSkill, seedAbilityFromRit } from "@/server/map/student-map";
import { hintAction, submitAnswerAction } from "./actions";
import { canPlaySkill } from "@/server/game/skill-games";
import { isPlanSkill } from "@/server/student/plan-access";
import { learnSuggestion } from "@/server/skills/status-extras";
import { safeIfBehind } from "@/server/db/schema-errors";
import { skipLearnAction } from "@/app/student/star-actions";
import { getT } from "@/i18n/server";

/** Starts (or resumes) adaptive practice for a skill. */
export default async function PracticePage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ from?: string; work?: string; learn?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const { skillId } = await params;
  const me = (await getActor())!.user;
  const from = (await searchParams).from;
  // 1) assigned work (the skill, another grade's copy of it, an older multi-skill row, a prerequisite the engine
  //    routes to) · 2) every skill of the student's MAP plan · 3) any skill of their own grade · 4) a skill of
  //    ANOTHER grade that is in the student's own plan (a teacher-sent MAP plan, the Personal Study Plan) — all open,
  //    no "not assigned" message (owner's spec). Checked on the server; all of it counts in reports.
  // ⚡ the two first checks side by side (both only read; the MAP one is answered from kept bank data)
  const [access, mapSkill] = await Promise.all([skillAccess(repo, actor, skillId), isMapPracticeSkill(repo, actor, skillId)]);
  const fromMap = !access.assigned && !access.startsAt ? mapSkill : from === "map" && mapSkill;
  const free = !access.assigned && !access.startsAt && !fromMap && (await canPlaySkill(repo, actor, skillId));
  // a skill in the student's own plan, even from another grade (e.g. a Grade 4 skill for a Grade 5 student): its
  // questions open at the student's own level (the adaptive engine on the skill's one family bank)
  const planned = !access.assigned && !access.startsAt && !fromMap && !free && (await isPlanSkill(repo, actor, skillId));
  if (planned && from === "map") await seedAbilityFromRit(repo, actor, skillId);
  const unitHref = fromMap || planned ? "/student/map" : from === "free" ? "/student/skills" : "/student/work";
  if (fromMap) await seedAbilityFromRit(repo, actor, skillId);
  if (!access.assigned && !fromMap && !free && !planned) {
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
  // ⭐ stuck at ◐ (7+ days or 25+ answers without progress): the skill's Learn lesson first — one gentle card, skippable
  if ((await searchParams).learn !== "skip") {
    const tip = await safeIfBehind("practice.learn", () => learnSuggestion(repo, actor.studentId!, skillId), null);
    if (tip) {
      const { t } = await getT();
      return (
        <AppShell name={String(me.displayName)}>
          <section data-testid="learn-suggestion" className="mx-auto max-w-xl rounded-3xl bg-white p-6 text-center shadow-card ring-1 ring-sky-200">
            <p className="text-4xl" aria-hidden="true">📘</p>
            <h1 className="mt-2 text-xl font-semibold text-brand-navy">{t("A short lesson can help with {skill}", { skill: tip.skill })}</h1>
            <p className="mt-2 text-slate-600">{t("Read “{title}” first, then come back and keep practising. It is your choice.", { title: tip.title })}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link prefetch={false} href={tip.href} className="inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("Open the lesson")}</Link>
              <form action={skipLearnAction}><input type="hidden" name="skillId" value={skillId} />{from && <input type="hidden" name="from" value={from} />}<button className="inline-flex min-h-11 items-center rounded-xl bg-white px-5 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Keep practising")}</button></form>
            </div>
          </section>
        </AppShell>
      );
    }
  }
  try {
    // ?work= : a Curriculum Map lesson continued with skill practice (checked on the server: the student's own lesson)
    const work = (await searchParams).work;
    const view = await startPractice(repo, actor, skillId, new Date(), undefined, work ? { work: String(work).slice(0, 64) } : {});
    return (
      <AppShell name={String(me.displayName)}>
        <PlayerBoundary where="practice"><PracticePlayer initial={view} unitHref={unitHref} submit={submitAnswerAction} hint={hintAction} /></PlayerBoundary>
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
