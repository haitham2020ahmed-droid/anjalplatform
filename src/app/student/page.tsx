import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentHome } from "@/server/student/student-home";
import { myWorkView } from "@/server/student/program-work";
import { StudentTour } from "@/components/student/student-tour";
import { LatestCertificate } from "@/components/student/latest-certificate";
import { HomeTiles, withoutTilePages } from "@/components/student/home-tiles";
import { LiteriseLogo } from "@/components/brand/literise-logo";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { HERO_TITLE, BTN_PRIMARY } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { JoinLive } from "@/components/game/join-live";
import { Suspense } from "react";
import { QotdCard } from "@/components/motivation/qotd-card";

export const metadata = { title: "Home" };

/** the small line icon in front of each notice (no emoji) */
const NOTICE_ICON: Record<string, LineIconName> = { diagnostic: "tests", exit: "ticket", "map-test": "map", respond: "writing", comments: "chat" };

/**
 * Student Home — calm and organised for every age (Grades 2–12): the Literise header and my name; the "Today" card
 * (Start / Continue and how far the work is); one grid of main tiles (My Work, MAP, Curriculum Map, Second Chance,
 * ReadMaster / ReadRise, Fluency Coach, Writing, My Tests), each opening its page; then short notices (never a page
 * that is already a tile), the compact Question of the Day and my newest certificate. Avatar, coins and badge sit
 * next to my name in the top bar. No support-level wording anywhere. All reads: src/server/student/student-home.ts.
 */
export default async function StudentHomePage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, h] = await Promise.all([getT(), studentHome(repo, actor)]);
  const first = String(me.displayName ?? "").trim().split(/\s+/)[0] || String(me.displayName ?? "");
  const { progress: prog, toDo, cont, allDone } = myWorkView(h.work, h.last);
  const notices = withoutTilePages(h.notices);
  return (
    <AppShell name={String(me.displayName)}>
      <StudentTour />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500"><LiteriseLogo size="sm" className="normal-case tracking-normal" /><span aria-hidden="true">·</span>{t("Student")}</p>
          <h1 id="hello" data-testid="welcome" className={`mt-2 ${HERO_TITLE}`}>{t("Hello, {name}!", { name: first })}</h1>
          <p className="mt-1 text-base text-slate-600">{h.testsToDo > 0 ? t("You have {y} tests waiting.", { y: h.testsToDo }) : t("Ready to learn something new today?")}</p>
        </div>
        <JoinLive />
      </header>

      {/* Today: what to do now */}
      <section id="my-work" data-tour="my-work" aria-labelledby="today-h" className="mt-6 rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200/80">
        <div className="flex flex-wrap items-center gap-4">
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-navy/[0.06] text-brand-navy"><LineIcon name="play" /></span>
          <div className="min-w-0 flex-1 basis-48">
            <h2 id="today-h" className="flex flex-wrap items-center gap-2 text-lg font-semibold text-brand-navy">{t("Today")}{toDo > 0 && <span data-testid="my-work-todo" className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{t("{n} to do", { n: toDo })}</span>}</h2>
            {cont ? <p className="truncate text-sm text-slate-600">{t("Next")}: <bdi className="font-semibold text-slate-800">{cont.title}</bdi></p>
              : <p className="text-sm text-slate-600">{allDone ? t("All done for today!") : t("Your teacher will add work here soon.")}</p>}
          </div>
          {cont && (
            <Link prefetch={false} href={cont.href} data-testid="continue" title={cont.title} className={`${BTN_PRIMARY} min-h-11 w-full rounded-xl px-6 sm:w-auto`}>
              {h.last && cont.href === h.last.href ? t("Continue") : t("Start")}
            </Link>
          )}
        </div>
        {prog.total > 0 && (
          <div className="mt-4">
            <p data-testid="my-work-progress" className="mb-1.5 flex justify-between text-xs font-medium text-slate-500"><span>{t("{done} of {total} done", { done: prog.done, total: prog.total })}</span><span dir="ltr" className="tabular-nums">{prog.pct}%</span></p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done} aria-label={t("{done} of {total} done", { done: prog.done, total: prog.total })}>
              <div className="h-full rounded-full bg-brand-teal" style={{ width: `${prog.pct}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* the main pages: each once */}
      <div className="mt-6"><HomeTiles t={t} badges={{ work: toDo, tests: h.testsToDo, writing: h.writingToDo }} /></div>

      {notices.length > 0 && (
        <section aria-label={t("Also for you")} className="mt-6 grid gap-2 sm:grid-cols-2">
          {notices.map((n) => (
            <Link key={n.key} prefetch={false} href={n.href} className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-800 ring-1 ring-slate-200/80 transition hover:ring-brand-teal/60">
              <span className="flex min-w-0 items-center gap-2.5"><span aria-hidden="true" className="text-brand-teal"><LineIcon name={NOTICE_ICON[n.key] ?? (n.key.startsWith("game-") ? "game" : "bell")} className="h-[18px] w-[18px]" /></span><span className="min-w-0">{t(n.text, n.vars)}</span></span>
              <span className="shrink-0 text-xs font-semibold text-brand-teal">{t(n.cta)}</span>
            </Link>
          ))}
        </section>
      )}

      {/* Question of the Day: one small strip that opens on demand */}
      <div className="mt-6"><Suspense fallback={null}><QotdCard actor={actor} /></Suspense></div>
      {/* my newest certificate: one small line */}
      <Suspense fallback={null}><LatestCertificate actor={actor} /></Suspense>
    </AppShell>
  );
}
