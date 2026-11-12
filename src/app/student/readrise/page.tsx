import Link from "next/link";
import { Suspense } from "react";
import type { Actor } from "@/server/auth/rbac";
import type { TFn } from "@/i18n";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { startReadRiseLibraryLoad } from "@/server/readrise/seed";
import { readRiseHome, type ReadRiseHome } from "@/server/readrise/student";
import { ReadRiseIcon } from "@/components/readrise/readrise-icon";
import { GoalRing, GrowthChart, LevelBadge } from "@/components/readrise/widgets";
import { ReadRiseLibrary } from "@/components/readrise/library";
import { ProgramTabs } from "@/components/student/program-tabs";
import { GrowthStory } from "@/components/readrise/growth-story";
import { myGrowthStory } from "@/server/readrise/growth-report";
import { getT } from "@/i18n/server";
import { PlacementPopup } from "@/components/readrise/placement-popup";
import { InterestsPicker } from "@/components/readrise/interests-picker";
import { ReadRiseScoreboard } from "@/components/readrise/scoreboard";
import { studentScoreboard } from "@/server/readrise/points";
import { loadReadRiseWindows } from "@/server/readrise/windows";
import { ensureWeeklyPlansForStudent } from "@/server/readrise/teacher";
import { formatLevel } from "@/server/readrise/level";

export const metadata = { title: "ReadRise" };
export const dynamic = "force-dynamic";

/** 🚀 ReadRise home: my level, weekly goal and streak, growth + projection, the placement prompt and the library. */
export default async function ReadRiseHomePage({ searchParams }: { searchParams: Promise<{ q?: string; topic?: string; tab?: string; page?: string; topics?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  startReadRiseLibraryLoad(repo); // new article files of a deploy load in the background — the page never waits for them
  const me = (await getActor())!.user;
  const sp = await searchParams;
  // 🗓 round 6: the classes' automatic weekly ReadRise plans (teacher.ts; never throws) — before the library is read
  await ensureWeeklyPlansForStudent(repo, actor.studentId!);
  /** 📊 "My report" tab: my level, weekly goal, reading numbers and growth; 🎯 "Placement test" tab (r68); the default tab is the library */
  const report = sp.tab === "report";
  const placementTab = sp.tab === "placement";
  const [h, { t }] = await Promise.all([
    readRiseHome(repo, actor, { q: typeof sp.q === "string" ? sp.q.slice(0, 100) : "", topic: typeof sp.topic === "string" ? sp.topic.slice(0, 100) : "", page: Number(sp.page) || 1 }),
    getT(),
  ]);
  const sum = h.summary;
  const first = String(me.displayName ?? "").split(" ")[0];
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/student" className="inline-flex min-h-10 items-center text-sm font-medium text-slate-500 hover:text-brand-teal"><span aria-hidden="true" className="inline-block rtl:rotate-180">‹</span>&nbsp;{t("My Work")}</Link></p>
      <header className="mt-2 flex flex-wrap items-center gap-4">
        <ReadRiseIcon size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-brand-navy">ReadRise</h1>
          <p className="text-slate-600">{first ? t("Read real-world articles at your level, {name} — and watch your level rise.", { name: first }) : t("Read real-world articles at your level — and watch your level rise.")}</p>
        </div>
      </header>

      {/* 🎯 no level before the placement: the big card sits at the top of both tabs until the test is finished */}
      {/* 🎯 r68: the first visit without a finished placement: a friendly window (Start / Later); the card below stays */}
      {!h.placement.doneAt && (h.placement.state === "NEED" || h.placement.state === "OPEN") && !placementTab && <PlacementPopup studentKey={actor.studentId!} href="/student/readrise/placement" cont={h.placement.state === "OPEN"} />}
      {h.placement.state !== "NONE" && (!h.placed || !report || h.placement.state === "CHECK") && !placementTab && (
        <Link href="/student/readrise/placement" data-testid="rr-placement-card" data-state={h.placement.state} className="lift mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-brand-navy to-indigo-700 p-6 text-white shadow-pop">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-wider text-indigo-200">🎯 {h.placement.state === "CHECK" ? t("Reading check") : t("Find my level")}</span>
            <span className="block text-2xl font-extrabold">{h.placement.state === "OPEN" ? t("Finish your ReadRise placement") : h.placement.state === "RETAKE" ? t("Take the placement again") : h.placement.state === "CHECK" ? t("Check your reading level") : t("Take the placement test")}</span>
            <span className="block text-sm text-indigo-100">{h.placement.state === "CHECK" ? t("It is time for your reading check: a few short passages with 3 questions each. It shows how much you have grown.") : t("Up to 13 short passages with 3 questions each (about 36–39 questions). About 20–30 minutes — no time limit, you can stop and come back. It finds the articles that are just right for you.")}</span>
          </span>
          <span className="rounded-xl bg-white px-6 py-3 text-lg font-bold text-brand-navy">{h.placement.state === "OPEN" ? t("Continue ▶") : t("Start ▶")}</span>
        </Link>
      )}

      <div className="mt-5"><ProgramTabs tabs={[{ href: "/student/readrise", label: "Articles", icon: "📚", on: !report && !placementTab }, { href: "/student/readrise?tab=report", label: "My report", icon: "📊", on: report }, { href: "/student/readrise?tab=placement", label: "Placement test", icon: "🎯", on: placementTab }]} /></div>

      {placementTab && (
        <section data-testid="rr-placement-tab" aria-label={t("Placement test")} className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-slate-200">
          {h.placement.state === "OPEN" ? (
            <><p className="text-lg font-semibold text-brand-navy">{t("Your placement test is half done.")}</p><Link href="/student/readrise/placement" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("Continue ▶")}</Link></>
          ) : h.placement.doneAt ? (
            <>
              <p className="text-lg font-semibold text-emerald-800">✅ {t("Placement test done on {date}", { date: h.placement.doneAt.slice(0, 10) })}</p>
              {h.placement.result !== null && <p className="mt-1 text-slate-700">{t("Your starting level")}: <b className="text-brand-navy">{formatLevel(h.placement.result)}</b></p>}
              {h.placement.state === "CHECK" ? <Link href="/student/readrise/placement" data-testid="rr-check-start" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("Check your reading level")} ▶</Link>
                : h.placement.state === "RETAKE" ? <Link href="/student/readrise/placement" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("Take the placement again")} ▶</Link>
                : <p className="mt-2 text-sm text-slate-500">{t("Your teacher can let you take it again.")}</p>}
            </>
          ) : h.placement.ready === false ? (
            <p className="text-slate-700">{t("The placement test is not ready yet. Ask your teacher.")}</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-brand-navy">{t("Take the placement test")}</p>
              <p className="mt-1 text-slate-600">{t("Up to 13 short passages with 3 questions each (about 36–39 questions). About 20–30 minutes — no time limit, you can stop and come back. It finds the articles that are just right for you.")}</p>
              {h.placed && <p className="mt-1 text-sm text-slate-500">{t("Your teacher set your level; the placement test can still find your best level.")}</p>}
              <Link href="/student/readrise/placement" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white" data-testid="rr-placement-start">{t("Start ▶")}</Link>
            </>
          )}
        </section>
      )}


      {report && !h.placed && (
        <p data-testid="rr-no-level" className="mt-5 rounded-2xl bg-white p-5 text-slate-700 ring-1 ring-slate-200">{t("You do not have a ReadRise level yet. Take the placement test to find your level.")}</p>
      )}

      {report && h.placed && <>
      <section aria-label="My progress" data-testid="rr-my-report" className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-50 to-white p-5 shadow-card ring-1 ring-indigo-200">
          <p className="text-sm font-semibold text-slate-600">{t("My ReadRise Level")}</p>
          <div className="mt-2"><LevelBadge level={sum.level} size="lg" /></div>
          <p className={`mt-2 text-sm font-semibold ${sum.growth > 0 ? "text-emerald-700" : sum.growth < 0 ? "text-rose-700" : "text-slate-600"}`}>
            {sum.growth > 0 ? `▲ ${t("+{n} since I started ({start})", { n: sum.growth, start: formatLevel(sum.startLevel) })}` : sum.growth < 0 ? `▼ ${t("{n} since I started ({start})", { n: sum.growth, start: formatLevel(sum.startLevel) })}` : t("Starting level {n}", { n: formatLevel(sum.startLevel) })}
          </p>
          {sum.projected !== null && sum.projected >= sum.level && <p className="mt-1 text-sm text-slate-600">{t("On track for about {n} by the end of the year (estimate).", { n: formatLevel(sum.projected) })}</p>}
          <p className="mt-2 text-xs text-slate-500">{t("Your ReadRise level is ReadRise's own reading level.")}</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-white p-5 shadow-card ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-slate-600">{t("Weekly goal")}</p>
          <div className="mt-2"><GoalRing done={sum.thisWeek} goal={sum.weeklyGoal} t={t} /></div>
          <p className="mt-2 text-sm text-slate-700">{sum.streak > 0 ? <>🔥 <strong>{t("{n}-week streak", { n: sum.streak })}</strong> — {t("keep it going!")}</> : t("Meet your goal this week to start a streak.")}</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white p-5 shadow-card ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-slate-600">{t("My reading")}</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div><dt className="text-xs text-slate-500">{t("Articles read")}</dt><dd className="text-2xl font-bold text-brand-navy">{sum.articlesDone}</dd></div>
            <div><dt className="text-xs text-slate-500">{t("First-try average")}</dt><dd className="text-2xl font-bold text-brand-navy">{sum.firstTryAvg === null ? "—" : `${sum.firstTryAvg}%`}</dd></div>
            <div><dt className="text-xs text-slate-500">{t("Weeks goal met")}</dt><dd className="text-2xl font-bold text-brand-navy">{sum.weeksMet}</dd></div>
            <div><dt className="text-xs text-slate-500">{t("Placement")}</dt><dd className="text-2xl font-bold text-brand-navy">{h.placement.result === null ? "—" : formatLevel(h.placement.result)}</dd></div>
          </dl>
        </div>
      </section>

      <details className="mt-4 rounded-2xl bg-teal-50 p-4 text-sm text-slate-700 ring-1 ring-teal-200">
        <summary className="cursor-pointer font-semibold text-brand-navy">{t("How does my level move?")}</summary>
        {/* round 5: the real rules (first-try.ts / student.ts stretchOffer / engine.ts) — round 9: the gentler automatic drop + the quick way back */}
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>{t("Only your first try on an article counts. Reading it again is practice.")}</li>
          <li>{t("Score 75% or more on 3 of your last 4 articles and your level goes up 50.")}</li>
          <li>{t("One hard article never moves your level down. Under 50% on 2 articles in a row (or on 3 of your last 4, or an average under 60% on your last 4) and your level goes down 50, so the next articles fit you better. 25% or less two times in a row: down 100.")}</li>
          <li>{t("After your level goes down, 75% or more on 2 articles in a row brings it back up 50.")}</li>
          <li>{t("Take your time: answers that come too fast do not count, and an article read in under 45 seconds does not count.")}</li>
          <li>{t("Your weekly goal counts each article once: 75% or more on the first try.")}</li>
          <li>{t("Three times a year you check your reading level with a few short passages: at the start, in the middle and at the end of the year.")}</li>
          <li>{t("Score 75% or more on your first try and you can Stretch: the same article at your grade level, with new questions. It is practice: it gives you points but never changes your level.")}</li>
        </ul>
      </details>

      {h.placement.checks && <ReadingChecks checks={h.placement.checks} t={t} />}

      <section aria-labelledby="growth-h" className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 id="growth-h" className="text-xl font-bold text-brand-navy">📈 {t("My growth")}</h2>
        <div className="mt-3"><GrowthChart points={h.growth.points} projected={h.growth.projected} yearEnd={h.growth.yearEnd} t={t} /></div>
      </section>

      {/* ⚡ the growth story streams in after the page: the level, goal and chart above show at once */}
      <Suspense fallback={<div aria-hidden="true" className="mt-6 h-40 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />}>
        <StoryPanel actor={actor} t={t} />
      </Suspense>

      </>}

      {!report && !placementTab && (h.locked ? (
        <p data-testid="rr-locked" className="mt-6 rounded-2xl bg-white p-5 text-slate-700 ring-1 ring-slate-200">🔒 {t("Your articles open after the placement test.")}</p>
      ) : (
        <>
          <ProgressStrip h={h} t={t} />
          {h.progress && (h.progress.interests.length === 0 || sp.topics === "1") ? (
            <div className="mt-4"><InterestsPicker topics={h.progress.topics} chosen={h.progress.interests} /></div>
          ) : h.progress ? (
            <p className="mt-2 text-sm"><Link href="/student/readrise?topics=1" data-testid="rr-change-topics" className="text-brand-teal underline">❤️ {t("Change my topics")}</Link></p>
          ) : null}
          <ReadRiseLibrary lib={h.library} showLevel={h.placed} t={t} panel={
            /* 🏆 round 6: points, the annual goal, achievements and the school boards stream in after the articles */
            <Suspense fallback={<div aria-hidden="true" className="mt-6 h-40 animate-pulse rounded-3xl bg-amber-50 motion-reduce:animate-none" />}>
              <ScorePanel actor={actor} t={t} />
            </Suspense>
          } />
        </>
      ))}
    </AppShell>
  );
}

/**
 * 📈 Round 5: the progress strip at the top of the Articles tab — "Your level 1400 · This week 1 of 2 · 2 more strong
 * reads (75%+) to move up +50" (engine.ts levelWindow + readsToMoveUp: the 3-of-4 rule). No level before placement.
 */
function ProgressStrip({ h, t }: { h: ReadRiseHome; t: TFn }) {
  const s = h.summary;
  const n = h.progress?.toMoveUp ?? null;
  return (
    <section data-testid="rr-progress-strip" aria-label={t("My progress")} className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-gradient-to-r from-indigo-50 to-white px-5 py-3 text-slate-800 ring-1 ring-indigo-200">
      {h.placed && <span className="font-bold text-brand-navy">{t("Your level {n}", { n: formatLevel(s.level) })}</span>}
      {h.placed && <span aria-hidden="true" className="text-slate-400">·</span>}
      <span>{s.goalMet ? `🏆 ${t("This week {n} of {m}", { n: s.thisWeek, m: s.weeklyGoal })}` : t("This week {n} of {m}", { n: s.thisWeek, m: s.weeklyGoal })}</span>
      {h.placed && n !== null && <><span aria-hidden="true" className="text-slate-400">·</span><span data-testid="rr-to-move-up">{n === 1 ? t("1 more strong read (75%+) to move up +{step}", { step: h.progress!.step }) : t("{n} more strong reads (75%+) to move up +{step}", { n, step: h.progress!.step })}</span></>}
    </section>
  );
}

/** 🗓️ The year's three reading checks: start → middle → end (owner r69). Numbers only — never a level word. */
function ReadingChecks({ checks, t }: { checks: NonNullable<ReadRiseHome["placement"]["checks"]>; t: TFn }) {
  const items: { key: keyof typeof checks; label: string }[] = [{ key: "BOY", label: t("Start of year") }, { key: "MOY", label: t("Middle of year") }, { key: "EOY", label: t("End of year") }];
  return (
    <section aria-labelledby="checks-h" data-testid="rr-reading-checks" className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 id="checks-h" className="text-xl font-bold text-brand-navy">🗓️ {t("My reading checks")}</h2>
      <ol className="mt-3 flex flex-wrap items-center gap-2">
        {items.map((x, i) => (
          <li key={x.key} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className="text-slate-400">→</span>}
            <span className="rounded-xl bg-indigo-50 px-4 py-2 ring-1 ring-indigo-200">
              <span className="block text-xs font-semibold text-slate-600">{x.label}</span>
              <span className="block text-xl font-bold tabular-nums text-brand-navy">{checks[x.key] ? formatLevel(checks[x.key]!.level) : <span className="text-sm font-semibold text-slate-400">{t("Not yet")}</span>}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 🏆 Round 6: the scoreboard panel (points.ts: computed from the runs, cached; the school board cached 60 s). */
async function ScorePanel({ actor, t }: { actor: Actor; t: TFn }) {
  if (!actor.studentId || !actor.schoolId) return null;
  const board = await loadReadRiseWindows(repo, actor.schoolId)
    .then((w) => studentScoreboard(repo, actor.studentId!, { schoolId: actor.schoolId!, yearStart: new Date(`${w.yearStart}T00:00:00+03:00`) }))
    .catch(() => null);
  return board ? <ReadRiseScoreboard board={board} t={t} /> : null;
}

/** "My report" tab: the growth story, read after the home data (which creates the reader's ReadRise row on first use). */
async function StoryPanel({ actor, t }: { actor: Actor; t: TFn }) {
  const story = await myGrowthStory(repo, actor).catch(() => null);
  return story ? <GrowthStory story={story} t={t} /> : null;
}
