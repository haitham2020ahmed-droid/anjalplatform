import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentHome, type StudentHome } from "@/server/student/student-home";
import { workProgress } from "@/server/student/program-work";
import { hasNafsPlan } from "@/server/student/menu-flags";
import { rewardChip } from "@/server/motivation/coins";
import { StudentTour } from "@/components/student/student-tour";
import { LatestCertificate } from "@/components/student/latest-certificate";
import { Avatar } from "@/components/motivation/avatar";
import { BigTile, EmptyState, HERO_TITLE, PageHero, SourceTag, StatusPill, TileGroup, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit";
import { FluencyCoachIcon } from "@/components/fluency/coach-icon";
import { ReadRiseIcon } from "@/components/readrise/readrise-icon";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";
import { PlayMenu } from "@/components/game/play-menu";
import { JoinLive } from "@/components/game/join-live";
import { Suspense } from "react";
import { QotdCard } from "@/components/motivation/qotd-card";

export const metadata = { title: "Home" };

type Row = StudentHome["work"][number];
const STATUS: Record<Row["status"], "NOT_STARTED" | "IN_PROGRESS" | "DONE"> = { "Not started": "NOT_STARTED", "In progress": "IN_PROGRESS", Done: "DONE" };
/** the first rows of My Work are shown; the rest open with "Show all" (the page stays short) */
const FIRST_ROWS = 6;
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
/** soft row colour per program (Curriculum blue, MAP green, RTI orange, Grammar purple, NAFS teal) */
const SOFT: Record<string, string> = { CURRICULUM: "bg-blue-50/70 ring-blue-100 border-blue-300", MAP: "bg-green-50/70 ring-green-100 border-green-300", RTI: "bg-orange-50/70 ring-orange-100 border-orange-300", GRAMMAR: "bg-purple-50/70 ring-purple-100 border-purple-300", NAFS: "bg-teal-50/70 ring-teal-100 border-teal-300", CUSTOM: "bg-slate-50 ring-slate-100 border-slate-300" };

/** One My Work row: the skill, its small colored program chip (MAP / RTI / Curriculum / NAFS / Grammar), status, one button. */
function WorkCard({ r, t }: { r: Row; t: TFn }) {
  return (
    <li data-testid="my-work-row" data-source={r.reteach ? "RETEACH" : r.sourceKey} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-s-4 p-4 ring-1 transition hover:shadow-card ${SOFT[r.sourceKey] ?? SOFT.CUSTOM}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-navy"><bdi>{r.skill}</bdi></p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {r.reteach ? <SourceTag source="CUSTOM" label={t("Reteach")} /> : <SourceTag source={r.sourceKey} icon />}
          <StatusPill status={STATUS[r.status]} />
          {r.overdue && r.status !== "Done" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{t("Late")}</span>}
          {r.dueAt && r.status !== "Done" && !r.overdue && <span className="text-xs text-slate-500">{t("Due {date}", { date: day(r.dueAt) })}</span>}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        <Link prefetch={false} href={r.href} className={`${BTN_SECONDARY} rounded-2xl`}>{t(r.action)}</Link>
        {r.skillId && <PlayMenu skillId={r.skillId} skill={r.skill} />}
      </span>
    </li>
  );
}

/**
 * 🏠 Student Home — one goal: "Your work for today".
 *   A welcome band (PageHero) with my avatar + Join Live · ☀️ Question of the Day · "Also for you" notices
 *   B My Work: a progress bar ("3 of 5 done"), ONE primary button "Continue", the rows (each with its program chip),
 *     a friendly empty state; finished rows fold away · 📜 my newest certificate (one small line)
 *   C Reading · D Programs (MAP, Curriculum Map; RTI only for Tier 2/3; NAFS only with a NAFS plan) · E My Progress
 * All reads: src/server/student/student-home.ts (bounded).
 */
export default async function StudentHomePage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sid = actor.studentId!;
  const [{ t }, h, chip, nafs] = await Promise.all([getT(), studentHome(repo, actor), rewardChip(repo, sid).catch(() => null), hasNafsPlan(repo, sid).catch(() => false)]);
  const first = String(me.displayName ?? "").trim().split(/\s+/)[0] || String(me.displayName ?? "");
  const open = h.work.filter((r) => r.status !== "Done");
  const done = h.work.filter((r) => r.status === "Done");
  const prog = workProgress(h.work);
  const cont = h.last ? { href: h.last.href, title: h.last.title } : open[0] ? { href: open[0].href, title: open[0].skill } : null;
  const programs = 2 + (h.rti ? 1 : 0) + (nafs ? 1 : 0);
  return (
    <AppShell name={String(me.displayName)}>
      <StudentTour />
      {/* A. welcome */}
      <PageHero tone="student" titleId="hello"
        title={<h1 id="hello" data-testid="welcome" className={HERO_TITLE}>{t("Hello, {name}!", { name: first })} <span aria-hidden="true">👋</span></h1>}
        subtitle={h.testsToDo > 0 ? t("You have {y} tests waiting.", { y: h.testsToDo }) : t("Ready to learn something new today?")}
        lead={chip ? <Link prefetch={false} href="/student/avatar" aria-label={t("My avatar")} className="grid h-20 w-20 place-items-center rounded-full bg-white/90 shadow-card ring-4 ring-white/70 transition hover:scale-105 motion-reduce:hover:scale-100"><Avatar avatar={chip.avatar} size={64} /></Link> : null}
        actions={<JoinLive />} />
      {/* ☀️ Question of the Day (Games Part 3): one small card under the welcome line */}
      <Suspense fallback={null}><QotdCard actor={actor} /></Suspense>

      {h.notices.length > 0 && (
        <section aria-label={t("Also for you")} className="mt-4 grid gap-2 sm:grid-cols-2">
          {h.notices.map((n) => (
            <Link key={n.key} prefetch={false} href={n.href} className={`lift flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-3 font-semibold shadow-card ring-1 ${n.urgent ? "bg-gradient-to-r from-amber-50 to-white text-amber-950 ring-amber-200" : "bg-white text-brand-navy ring-slate-200/80"}`}>
              <span className="min-w-0"><span aria-hidden="true" className="me-2">{n.icon}</span>{t(n.text, n.vars)}</span>
              <span className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-sm text-brand-navy ring-1 ring-slate-300">{t(n.cta)}</span>
            </Link>
          ))}
        </section>
      )}

      {/* B. My Work — the one goal of the page */}
      <section id="my-work" data-tour="my-work" aria-labelledby="my-work-h" className="mt-6 scroll-mt-24 rounded-[1.75rem] bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-7">
        <div className="flex flex-wrap items-center gap-4">
          <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-100 to-violet-100 text-3xl shadow-card">📘</span>
          <div className="min-w-0 flex-1 basis-48">
            <h2 id="my-work-h" className="text-2xl font-semibold text-brand-navy">{t("Your work for today")}</h2>
            {prog.total > 0 && <p data-testid="my-work-progress" className="text-sm font-semibold text-slate-600">{t("{done} of {total} done", { done: prog.done, total: prog.total })}{prog.done === prog.total && <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-900"><span aria-hidden="true">🌟</span>{t("All done for today!")}</span>}</p>}
          </div>
          {cont && (
            <Link prefetch={false} href={cont.href} data-testid="continue" title={cont.title} className={`${BTN_PRIMARY} min-h-14 w-full rounded-2xl px-8 text-lg sm:w-auto`}>
              <span aria-hidden="true">▶</span>{t("Continue")}
            </Link>
          )}
        </div>
        {prog.total > 0 && (
          <div className="bar-track mt-4 h-3.5 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done} aria-label={t("{done} of {total} done", { done: prog.done, total: prog.total })}>
            <div className="bar-fill h-full rounded-full" style={{ width: `${prog.pct}%` }} />
          </div>
        )}
        {cont && h.last && <p className="mt-2 truncate text-sm text-slate-500">{t("Continue where you left off")}: <bdi>{cont.title}</bdi></p>}
        <div className="mt-4">
          {open.length ? (
            <>
              <ul className="grid gap-3">{open.slice(0, FIRST_ROWS).map((r) => <WorkCard key={r.assignmentId} r={r} t={t} />)}</ul>
              {open.length > FIRST_ROWS && (
                <details className="mt-3">
                  <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">{t("Show all ({n})", { n: open.length })}</summary>
                  <ul className="mt-2 grid gap-3">{open.slice(FIRST_ROWS).map((r) => <WorkCard key={r.assignmentId} r={r} t={t} />)}</ul>
                </details>
              )}
            </>
          ) : (
            <EmptyState compact icon={done.length ? "🎉" : "🌈"} title={done.length ? "No work right now — great job!" : "Nothing here yet"} text="Your teacher will add work here soon. Pick something to read below!" />
          )}
        </div>
        {done.length > 0 && (
          <details id="my-work-done" className="mt-4 rounded-2xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-emerald-900"><span aria-hidden="true">✅</span>{t("Done ({n})", { n: done.length })}</summary>
            <ul className="mt-2 grid gap-3">{done.map((r) => <WorkCard key={r.assignmentId} r={r} t={t} />)}</ul>
          </details>
        )}
      </section>
      {/* 📜 my newest certificate: one small line */}
      <Suspense fallback={null}><LatestCertificate actor={actor} /></Suspense>

      {/* C. Reading */}
      <TileGroup title="Reading" icon="📖" id="g-reading">
        <BigTile href="/student/readmaster" icon="⭐" label="ReadMaster" hint="All the articles for your grade" tone="sun" />
        <BigTile href="/student/readrise" icon={<ReadRiseIcon size={44} />} label="ReadRise" hint={h.readRiseLevel !== null ? t("ReadRise Level (estimate): {n}", { n: h.readRiseLevel }) : "Articles on every topic"} tone="violet" />
        <BigTile href="/student/fluency-coach" icon={<FluencyCoachIcon size={44} />} label="Fluency Coach" hint="Read aloud and get feedback" tone="rose" />
      </TileGroup>

      {/* D. Programs */}
      <TileGroup title="Programs" icon="🧭" id="g-programs" cols={programs >= 4 ? 4 : programs === 3 ? 3 : 2}>
        <BigTile href="/student/map" icon="🗺️" label="MAP" hint="My MAP scores and my goal" tour="plans" tone="map" />
        <BigTile href="/student/curriculum" icon="🧭" label="Curriculum Map" hint="Units and text sets of my grade" tone="curriculum" />
        {h.rti && <BigTile href="/student/rti" icon="🛟" label="RTI Program" hint="My skills for this week" tone="rti" />}
        {nafs && <BigTile href="/student/nafs" icon="🎯" label="NAFS" hint="My NAFS plan" tone="nafs" />}
      </TileGroup>

      {/* E. My Progress */}
      <TileGroup title="My Progress" icon="📈" id="g-progress" cols={2}>
        <BigTile href="/student/tests" icon="📝" label="My Tests" hint="Tests to do and finished tests" badge={h.testsToDo} tour="tests" tone="sky" />
        <BigTile href="/student/reports" icon="📊" label="My Reports" hint="All my reports in one place" tone="violet" />
      </TileGroup>
    </AppShell>
  );
}
