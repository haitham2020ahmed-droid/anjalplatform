import Link from "next/link";
import { Suspense } from "react";
import type { Actor } from "@/server/auth/rbac";
import type { TFn } from "@/i18n";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { startReadRiseLibraryLoad } from "@/server/readrise/seed";
import { readRiseHome } from "@/server/readrise/student";
import { ReadRiseIcon } from "@/components/readrise/readrise-icon";
import { GoalRing, GrowthChart, LevelBadge } from "@/components/readrise/widgets";
import { ReadRiseLibrary } from "@/components/readrise/library";
import { ProgramTabs } from "@/components/student/program-tabs";
import { GrowthStory } from "@/components/readrise/growth-story";
import { myGrowthStory } from "@/server/readrise/growth-report";
import { getT } from "@/i18n/server";

export const metadata = { title: "ReadRise" };
export const dynamic = "force-dynamic";

/** 🚀 ReadRise home: my level, weekly goal and streak, growth + projection, the placement prompt and the library. */
export default async function ReadRiseHomePage({ searchParams }: { searchParams: Promise<{ q?: string; topic?: string; tab?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  startReadRiseLibraryLoad(repo); // new article files of a deploy load in the background — the page never waits for them
  const me = (await getActor())!.user;
  const sp = await searchParams;
  /** 📊 "My report" tab: my level, weekly goal, reading numbers and growth; the default tab is the library */
  const report = sp.tab === "report";
  const [h, { t }] = await Promise.all([
    readRiseHome(repo, actor, { q: typeof sp.q === "string" ? sp.q.slice(0, 100) : "", topic: typeof sp.topic === "string" ? sp.topic.slice(0, 100) : "" }),
    getT(),
  ]);
  const sum = h.summary;
  const first = String(me.displayName ?? "").split(" ")[0];
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/student" className="inline-flex min-h-10 items-center text-sm font-medium text-slate-500 hover:text-brand-teal">‹ My Work</Link></p>
      <header className="mt-2 flex flex-wrap items-center gap-4">
        <ReadRiseIcon size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-brand-navy">ReadRise</h1>
          <p className="text-slate-600">Read real-world articles at your level{first ? `, ${first}` : ""} — and watch your level rise.</p>
        </div>
      </header>

      <div className="mt-5"><ProgramTabs tabs={[{ href: "/student/readrise", label: "Articles", icon: "📚", on: !report }, { href: "/student/readrise?tab=report", label: "My report", icon: "📊", on: report }]} /></div>

      {!report && h.placement.state !== "NONE" && (
        <Link href="/student/readrise/placement" className="lift mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-brand-navy to-indigo-700 p-5 text-white shadow-pop">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-wider text-indigo-200">🎯 Find my level</span>
            <span className="block text-2xl font-extrabold">{h.placement.state === "OPEN" ? "Finish your ReadRise placement" : h.placement.state === "RETAKE" ? "Take the placement again" : "Take the ReadRise placement"}</span>
            <span className="block text-sm text-indigo-100">A few short passages with 3 questions each. It finds the articles that are just right for you.</span>
          </span>
          <span className="rounded-xl bg-white px-6 py-3 text-lg font-bold text-brand-navy">{h.placement.state === "OPEN" ? "Continue ▶" : "Start ▶"}</span>
        </Link>
      )}

      {report && <>
      <section aria-label="My progress" data-testid="rr-my-report" className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-50 to-white p-5 shadow-card ring-1 ring-indigo-200">
          <p className="text-sm font-semibold text-slate-600">My ReadRise Level</p>
          <div className="mt-2"><LevelBadge level={sum.level} size="lg" /></div>
          <p className={`mt-2 text-sm font-semibold ${sum.growth > 0 ? "text-emerald-700" : sum.growth < 0 ? "text-rose-700" : "text-slate-600"}`}>
            {sum.growth > 0 ? `▲ +${sum.growth} since I started (${sum.startLevel})` : sum.growth < 0 ? `▼ ${sum.growth} since I started (${sum.startLevel})` : `Starting level ${sum.startLevel}`}
          </p>
          {sum.projected !== null && sum.projected >= sum.level && <p className="mt-1 text-sm text-slate-600">On track for about <strong>{sum.projected}</strong> by the end of the year (estimate).</p>}
          <p className="mt-2 text-xs text-slate-500">An estimate on a Lexile-like scale — not an official Lexile measure.</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-white p-5 shadow-card ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-slate-600">Weekly goal</p>
          <div className="mt-2"><GoalRing done={sum.thisWeek} goal={sum.weeklyGoal} /></div>
          <p className="mt-2 text-sm text-slate-700">{sum.streak > 0 ? <>🔥 <strong>{sum.streak}-week streak</strong> — keep it going!</> : "Meet your goal this week to start a streak."}</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white p-5 shadow-card ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-slate-600">My reading</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div><dt className="text-xs text-slate-500">Articles read</dt><dd className="text-2xl font-bold text-brand-navy">{sum.articlesDone}</dd></div>
            <div><dt className="text-xs text-slate-500">First-try average</dt><dd className="text-2xl font-bold text-brand-navy">{sum.firstTryAvg === null ? "—" : `${sum.firstTryAvg}%`}</dd></div>
            <div><dt className="text-xs text-slate-500">Weeks goal met</dt><dd className="text-2xl font-bold text-brand-navy">{sum.weeksMet}</dd></div>
            <div><dt className="text-xs text-slate-500">Placement</dt><dd className="text-2xl font-bold text-brand-navy">{h.placement.result ?? "—"}</dd></div>
          </dl>
        </div>
      </section>

      <details className="mt-4 rounded-2xl bg-teal-50 p-4 text-sm text-slate-700 ring-1 ring-teal-200">
        <summary className="cursor-pointer font-semibold text-brand-navy">How does my level move?</summary>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>Only your <strong>first try</strong> on an article counts.</li>
          <li>Score 75% or more on 3 of your last 4 articles and your level goes <strong>up 50</strong>.</li>
          <li>Score under 50% on 2 of your last 3 and it goes down 50, so articles fit you better.</li>
          <li>After reading an article, try a <strong>Stretch</strong>: the same article one level higher. It can help you move up and never lowers your level.</li>
        </ul>
      </details>

      <section aria-labelledby="growth-h" className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 id="growth-h" className="text-xl font-bold text-brand-navy">📈 My growth</h2>
        <div className="mt-3"><GrowthChart points={h.growth.points} projected={h.growth.projected} yearEnd={h.growth.yearEnd} /></div>
      </section>

      {/* ⚡ the growth story streams in after the page: the level, goal and chart above show at once */}
      <Suspense fallback={<div aria-hidden="true" className="mt-6 h-40 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />}>
        <StoryPanel actor={actor} t={t} />
      </Suspense>

      </>}

      {!report && <ReadRiseLibrary lib={h.library} />}
    </AppShell>
  );
}

/** "My report" tab: the growth story, read after the home data (which creates the reader's ReadRise row on first use). */
async function StoryPanel({ actor, t }: { actor: Actor; t: TFn }) {
  const story = await myGrowthStory(repo, actor).catch(() => null);
  return story ? <GrowthStory story={story} t={t} /> : null;
}
