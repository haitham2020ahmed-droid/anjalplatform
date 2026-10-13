import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentHome } from "@/server/student/student-home";
import { myWorkView } from "@/server/student/program-work";
import { StudentTour } from "@/components/student/student-tour";
import { LatestCertificate } from "@/components/student/latest-certificate";
import { HomeTiles, withoutTilePages } from "@/components/student/home-tiles";
import { ReadRiseLevelCard } from "@/components/student/readrise-level-card";
import { WeekStrip } from "@/components/student/week-strip";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { BTN_ACCENT } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { JoinLive } from "@/components/game/join-live";
import { Suspense } from "react";
import { QotdCard } from "@/components/motivation/qotd-card";

export const metadata = { title: "Home" };

/** the small line icon in front of each notice (no emoji) */
const NOTICE_ICON: Record<string, LineIconName> = { diagnostic: "tests", exit: "ticket", "map-test": "map", respond: "writing", comments: "chat" };

/**
 * Student Home (Literise D1, calm and smaller than the mockup): the week strip ("This week") and Join Live; the navy
 * hero card with the mashrabiya pattern (hello, Today, the next task, the saffron Start / Continue and how far the work
 * is); the ReadRise level gauge beside it; one grid of main tiles (My Work, MAP, Curriculum Map, Second Chance,
 * ReadMaster / ReadRise, Fluency Coach, Writing, My Tests) on 8-point-star badges; short notices (never a page that is
 * already a tile), the compact Question of the Day and my newest certificate. Avatar, coins and badge sit next to my
 * name in the top bar. No support-level wording anywhere. All reads: src/server/student/student-home.ts (+ the week
 * strip, streamed on its own).
 */
export default async function StudentHomePage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t, lang }, h] = await Promise.all([getT(), studentHome(repo, actor)]);
  const first = String(me.displayName ?? "").trim().split(/\s+/)[0] || String(me.displayName ?? "");
  const { progress: prog, toDo, cont, allDone } = myWorkView(h.work, h.last);
  const notices = withoutTilePages(h.notices);
  return (
    <AppShell name={String(me.displayName)}>
      <StudentTour />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Suspense fallback={<span className="inline-block h-9" aria-hidden="true" />}>{actor.studentId ? <WeekStrip studentId={actor.studentId} /> : null}</Suspense>
        <JoinLive />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        {/* the hero: hello, then Today — what to do now */}
        <section aria-labelledby="hello" className="lr-hero flex min-h-[200px] flex-col gap-3 p-5 sm:p-7 lg:col-span-8">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-0 -z-10 h-full w-[55%]" style={{ color: "var(--lr-hero-pattern)" }}>
            <defs>
              <pattern id="lr-hero-star" width="64" height="64" patternUnits="userSpaceOnUse">
                <g fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M32 5 L40 24 L59 32 L40 40 L32 59 L24 40 L5 32 L24 24 Z" /><circle cx="32" cy="32" r="6" /></g>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#lr-hero-star)" />
          </svg>
          <h1 id="hello" data-testid="welcome" className="font-sans text-[15px] font-medium text-[#c6cbef]">{t("Hello, {name}!", { name: first })}</h1>
          <div id="my-work" data-tour="my-work" className="flex flex-1 flex-col gap-3">
            <h2 id="today-h" className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c6cbef]">{t("Today")}{toDo > 0 && <span data-testid="my-work-todo" className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-white ring-1 ring-white/20">{t("{n} to do", { n: toDo })}</span>}</h2>
            {cont ? <p className="line-clamp-2 max-w-[34rem] font-display text-[1.625rem] leading-[1.15] text-white sm:text-[2rem]"><bdi>{cont.title}</bdi></p>
              : <p className="max-w-[34rem] font-display text-[1.5rem] leading-[1.2] text-white sm:text-[1.75rem]">{allDone ? t("All done for today!") : t("Your teacher will add work here soon.")}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
              {cont && (
                <Link prefetch={false} href={cont.href} data-testid="continue" title={cont.title} className={`${BTN_ACCENT} min-h-11 rounded-xl px-6`}>
                  {h.last && cont.href === h.last.href ? t("Continue") : t("Start")}
                </Link>
              )}
              {prog.total > 0 ? (
                <div className="min-w-[10rem] flex-1 basis-40 sm:max-w-[16rem]">
                  <p data-testid="my-work-progress" className="mb-1.5 flex justify-between text-[13px] text-[#c6cbef]"><span>{t("{done} of {total} done", { done: prog.done, total: prog.total })}</span><span dir="ltr" className="tabular-nums">{prog.pct}%</span></p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done} aria-label={t("{done} of {total} done", { done: prog.done, total: prog.total })}>
                    <div className="h-full rounded-full bg-[#2bc4c4]" style={{ width: `${prog.pct}%` }} />
                  </div>
                </div>
              ) : null}
              {h.testsToDo > 0 && <span className="text-[13px] text-[#c6cbef]">{t("You have {y} tests waiting.", { y: h.testsToDo })}</span>}
            </div>
          </div>
        </section>
        <div className="lg:col-span-4"><ReadRiseLevelCard t={t} lang={lang} level={h.readRiseLevel} start={h.readRiseStart} /></div>
      </div>

      {/* the main pages: each once */}
      <div className="mt-4"><HomeTiles t={t} badges={{ work: toDo, tests: h.testsToDo, writing: h.writingToDo }} /></div>

      {notices.length > 0 && (
        <section aria-label={t("Also for you")} className="mt-4 grid gap-2 sm:grid-cols-2">
          {notices.map((n) => (
            <Link key={n.key} prefetch={false} href={n.href} className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-surface px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line transition hover:ring-brand-teal/60">
              <span className="flex min-w-0 items-center gap-2.5"><span aria-hidden="true" className="text-teal-ink"><LineIcon name={NOTICE_ICON[n.key] ?? (n.key.startsWith("game-") ? "game" : "bell")} className="h-[18px] w-[18px]" /></span><span className="min-w-0">{t(n.text, n.vars)}</span></span>
              <span className="shrink-0 text-xs font-semibold text-teal-ink">{t(n.cta)}</span>
            </Link>
          ))}
        </section>
      )}

      {/* Question of the Day: one small strip that opens on demand */}
      <div className="mt-4"><Suspense fallback={null}><QotdCard actor={actor} /></Suspense></div>
      {/* my newest certificate: one small line */}
      <Suspense fallback={null}><LatestCertificate actor={actor} /></Suspense>
    </AppShell>
  );
}
