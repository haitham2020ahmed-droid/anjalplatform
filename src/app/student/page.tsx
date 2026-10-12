import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentHome } from "@/server/student/student-home";
import { MyWorkList } from "@/components/student/my-work-list";
import { myWorkView } from "@/server/student/program-work";
import { rewardChip } from "@/server/motivation/coins";
import { StudentTour } from "@/components/student/student-tour";
import { LatestCertificate } from "@/components/student/latest-certificate";
import { Avatar } from "@/components/motivation/avatar";
import { HERO_TITLE, PageHero, BTN_PRIMARY } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { JoinLive } from "@/components/game/join-live";
import { Suspense } from "react";
import { QotdCard } from "@/components/motivation/qotd-card";

export const metadata = { title: "Home" };

/**
 * 🏠 Student Home — one big "Today" card: what to do now (Start / Continue), how far the work is (progress bar) and
 * the next few tasks; ☀️ Question of the Day; my newest certificate. Avatar, coins and badge sit next to my name in
 * the top bar. The full list is My Work (/student/work); reading is ReadMaster / ReadRise. No support-level wording anywhere.
 * All reads: src/server/student/student-home.ts (bounded).
 */
export default async function StudentHomePage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sid = actor.studentId!;
  const [{ t }, h, chip] = await Promise.all([getT(), studentHome(repo, actor), rewardChip(repo, sid).catch(() => null)]);
  const first = String(me.displayName ?? "").trim().split(/\s+/)[0] || String(me.displayName ?? "");
  const { open, progress: prog, toDo, cont, allDone } = myWorkView(h.work, h.last);
  return (
    <AppShell name={String(me.displayName)}>
      <StudentTour />
      <PageHero tone="student" titleId="hello"
        title={<h1 id="hello" data-testid="welcome" className={HERO_TITLE}>{t("Hello, {name}!", { name: first })} <span aria-hidden="true" className="playful">👋</span></h1>}
        subtitle={h.testsToDo > 0 ? t("You have {y} tests waiting.", { y: h.testsToDo }) : t("Ready to learn something new today?")}
        lead={chip ? <Link prefetch={false} href="/student/avatar" aria-label={t("My avatar")} className="grid h-16 w-16 place-items-center rounded-full bg-white/90 shadow-card ring-4 ring-white/70"><Avatar avatar={chip.avatar} size={52} /></Link> : null}
        actions={<JoinLive />} />

      {/* ☀️ the big Today card */}
      <section id="my-work" data-tour="my-work" aria-labelledby="today-h" className="mt-5 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span aria-hidden="true" className="playful grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-100 to-violet-100 text-2xl">☀️</span>
          <div className="min-w-0 flex-1 basis-48">
            <h2 id="today-h" className="flex flex-wrap items-center gap-2 text-xl font-semibold text-brand-navy">{t("Today")}{toDo > 0 && <span data-testid="my-work-todo" className="rounded-full bg-brand-navy px-2.5 py-0.5 text-sm font-semibold text-white">{t("{n} to do", { n: toDo })}</span>}</h2>
            {cont ? <p className="truncate text-sm text-slate-600">{t("Next")}: <bdi className="font-semibold text-slate-800">{cont.title}</bdi></p>
              : <p className="text-sm text-slate-600">{allDone ? t("All done for today!") : t("Your teacher will add work here soon.")}</p>}
          </div>
          {cont && (
            <Link prefetch={false} href={cont.href} data-testid="continue" title={cont.title} className={`${BTN_PRIMARY} min-h-12 w-full rounded-2xl px-8 text-base sm:w-auto`}>
              <span aria-hidden="true">▶</span>{h.last && cont.href === h.last.href ? t("Continue") : t("Start")}
            </Link>
          )}
        </div>
        {prog.total > 0 && (
          <div className="mt-4">
            <p data-testid="my-work-progress" className="mb-1 text-sm font-semibold text-slate-600">{t("{done} of {total} done", { done: prog.done, total: prog.total })}{allDone && <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-900"><span aria-hidden="true">🌟</span>{t("All done for today!")}</span>}</p>
            <div className="bar-track h-3 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done} aria-label={t("{done} of {total} done", { done: prog.done, total: prog.total })}>
              <div className="bar-fill h-full rounded-full" style={{ width: `${prog.pct}%` }} />
            </div>
          </div>
        )}
        {open.length > 0 && <div className="mt-4"><MyWorkList open={open.slice(0, 3)} done={[]} t={t} first={3} /></div>}
        <p className="mt-3"><Link prefetch={false} href="/student/work" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-teal underline">{t("All my work")} →</Link></p>
      </section>

      {h.notices.length > 0 && (
        <section aria-label={t("Also for you")} className="mt-4 grid gap-2 sm:grid-cols-2">
          {h.notices.map((n) => (
            <Link key={n.key} prefetch={false} href={n.href} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy shadow-sm ring-1 ring-slate-200/80">
              <span className="min-w-0"><span aria-hidden="true" className="me-2">{n.icon}</span>{t(n.text, n.vars)}</span>
              <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs ring-1 ring-slate-300">{t(n.cta)}</span>
            </Link>
          ))}
        </section>
      )}

      {/* ☀️ Question of the Day */}
      <div className="mt-4"><Suspense fallback={null}><QotdCard actor={actor} /></Suspense></div>
      {/* 📜 my newest certificate: one small line */}
      <Suspense fallback={null}><LatestCertificate actor={actor} /></Suspense>
    </AppShell>
  );
}
