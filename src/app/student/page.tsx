import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentHome, type StudentHome } from "@/server/student/student-home";
import { StudentTour } from "@/components/student/student-tour";
import { BigTile, EmptyState, SourceTag, StatusPill, TileGroup, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit";
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
const FIRST_ROWS = 8;
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

/** The "From" tag of one My Work row: Curriculum / MAP / NAFS / RTI / Grammar / Custom, or Reteach after a test. */
function From({ r, t }: { r: Row; t: TFn }) {
  return r.reteach ? <SourceTag source="CUSTOM" label={t("Reteach")} /> : <SourceTag source={r.sourceKey} />;
}

/** One My Work row as a table row (iPad / desktop). */
function WorkRow({ r, t }: { r: Row; t: TFn }) {
  return (
    <tr data-testid="my-work-row" data-source={r.reteach ? "RETEACH" : r.sourceKey} className="border-t border-slate-100">
      <td className="py-3 pe-3 font-semibold text-brand-navy"><bdi>{r.skill}</bdi>{r.overdue && r.status !== "Done" && <span className="ms-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{t("Late")}</span>}{r.dueAt && r.status !== "Done" && !r.overdue && <span className="ms-2 text-xs font-normal text-slate-500">{t("Due {date}", { date: day(r.dueAt) })}</span>}</td>
      <td className="py-3 pe-3"><From r={r} t={t} /></td>
      <td className="py-3 pe-3"><StatusPill status={STATUS[r.status]} /></td>
      <td className="py-3 text-end"><span className="inline-flex flex-wrap items-center justify-end gap-2"><Link prefetch={false} href={r.href} className={r.status === "Done" ? BTN_SECONDARY : BTN_PRIMARY}>{t(r.action)}</Link>{r.skillId && <PlayMenu skillId={r.skillId} skill={r.skill} />}</span></td>
    </tr>
  );
}

/** The same row as a card (phone). */
function WorkCard({ r, t }: { r: Row; t: TFn }) {
  return (
    <li data-source={r.reteach ? "RETEACH" : r.sourceKey} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <p className="font-semibold text-brand-navy"><bdi>{r.skill}</bdi></p>
      <div className="mt-2 flex flex-wrap items-center gap-2"><From r={r} t={t} /><StatusPill status={STATUS[r.status]} />{r.overdue && r.status !== "Done" && <span className="text-xs font-semibold text-red-700">{t("Late")}</span>}</div>
      <div className="mt-3 flex gap-2"><Link prefetch={false} href={r.href} className={`${r.status === "Done" ? BTN_SECONDARY : BTN_PRIMARY} flex-1`}>{t(r.action)}</Link>{r.skillId && <span className="flex-1"><PlayMenu skillId={r.skillId} skill={r.skill} full /></span>}</div>
    </li>
  );
}

function WorkTable({ rows, t }: { rows: Row[]; t: TFn }) {
  return (
    <>
      <table className="hidden w-full text-start md:table">
        <thead><tr className="text-sm text-slate-500">
          <th scope="col" className="pb-2 pe-3 text-start font-semibold">{t("Skill")}</th>
          <th scope="col" className="pb-2 pe-3 text-start font-semibold">{t("From")}</th>
          <th scope="col" className="pb-2 pe-3 text-start font-semibold">{t("Status")}</th>
          <th scope="col" className="pb-2 text-end font-semibold"><span className="sr-only">{t("Start")}</span></th>
        </tr></thead>
        <tbody>{rows.map((r) => <WorkRow key={r.assignmentId} r={r} t={t} />)}</tbody>
      </table>
      <ul className="grid gap-3 md:hidden">{rows.map((r) => <WorkCard key={r.assignmentId} r={r} t={t} />)}</ul>
    </>
  );
}

/**
 * 🏠 Student Home (UI reorg Phase 2), top to bottom:
 *   A welcome line + "Continue where you left off" · B My Work (one row per skill, source tag, status, Start) ·
 *   C Reading · D My Progress · E Programs (RTI only for students in Tier 2/3).
 * All reads: src/server/student/student-home.ts (bounded; ~30 queries).
 */
export default async function StudentHomePage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, h] = await Promise.all([getT(), studentHome(repo, actor)]);
  const first = String(me.displayName ?? "").trim().split(/\s+/)[0] || String(me.displayName ?? "");
  const open = h.work.filter((r) => r.status !== "Done");
  const done = h.work.filter((r) => r.status === "Done");
  const late = open.some((r) => r.overdue);
  const cont = h.last ? { href: h.last.href, title: h.last.title } : open[0] ? { href: open[0].href, title: open[0].skill } : null;
  return (
    <AppShell name={String(me.displayName)}>
      <StudentTour />
      {/* A. welcome + continue */}
      <section aria-labelledby="hello" className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-7">
        <h1 id="hello" data-testid="welcome" className="text-2xl font-semibold leading-snug text-brand-navy sm:text-3xl">
          {t("Hello, {name} — you have {x} skills to work on and {y} tests waiting.", { name: first, x: h.toDo, y: h.testsToDo })}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {cont ? (
            <Link prefetch={false} href={cont.href} data-testid="continue" className={`${BTN_PRIMARY} min-h-12 max-w-full px-6 text-lg`}>
              <span aria-hidden="true">▶</span><span className="truncate">{t("Continue where you left off")}: <bdi>{cont.title}</bdi></span>
            </Link>
          ) : <p className="text-slate-600">{t("Pick something to read below, or wait for new work from your teacher.")}</p>}
          <JoinLive />
        </div>
      </section>
      {/* ☀️ Question of the Day (Games Part 3): one small card under the welcome line */}
      <Suspense fallback={null}><QotdCard actor={actor} /></Suspense>

      {h.notices.length > 0 && (
        <section aria-label={t("Also for you")} className="mt-4 grid gap-2 sm:grid-cols-2">
          {h.notices.map((n) => (
            <Link key={n.key} prefetch={false} href={n.href} className={`lift flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-3 font-semibold ring-1 ${n.urgent ? "bg-amber-50 text-amber-950 ring-amber-200" : "bg-white text-brand-navy ring-slate-200"}`}>
              <span className="min-w-0"><span aria-hidden="true" className="me-2">{n.icon}</span>{t(n.text, n.vars)}</span>
              <span className="shrink-0 rounded-xl bg-brand-navy px-3 py-1.5 text-sm text-white">{t(n.cta)}</span>
            </Link>
          ))}
        </section>
      )}

      {/* B. My Work — the most important card */}
      <section id="my-work" data-tour="my-work" aria-labelledby="my-work-h" className="mt-6 scroll-mt-24 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-brand-navy/15 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden="true" className="relative grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-3xl ring-1 ring-sky-100">📘
            {h.toDo > 0 && <span dir="ltr" data-testid="my-work-badge" className={`absolute -end-2 -top-2 min-w-7 rounded-full px-1.5 text-center text-sm font-bold leading-7 text-white ring-2 ring-white ${late ? "bg-red-600" : "bg-sky-600"}`}>{h.toDo > 99 ? "99+" : h.toDo}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="my-work-h" className="text-2xl font-semibold text-brand-navy">{t("My Work")}</h2>
            <p className="text-sm text-slate-600">{t("Everything from your teacher, in one place. Tap Start.")}</p>
          </div>
          {h.toDo > 0 && <span className="sr-only">{t("{n} to do", { n: h.toDo })}</span>}
        </div>
        <div className="mt-4">
          {open.length ? (
            <>
              <WorkTable rows={open.slice(0, FIRST_ROWS)} t={t} />
              {open.length > FIRST_ROWS && (
                <details className="mt-2">
                  <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">{t("Show all ({n})", { n: open.length })}</summary>
                  <div className="mt-2"><WorkTable rows={open.slice(FIRST_ROWS)} t={t} /></div>
                </details>
              )}
            </>
          ) : (
            <EmptyState compact title={done.length ? "No work right now — great job!" : "Nothing here yet"} text="Your teacher will add work here soon." />
          )}
        </div>
        {done.length > 0 && (
          <details id="my-work-done" className="mt-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">{t("Done ({n})", { n: done.length })}</summary>
            <div className="mt-2"><WorkTable rows={done} t={t} /></div>
          </details>
        )}
      </section>

      {/* C. Reading */}
      <TileGroup title="Reading" icon="📖" id="g-reading">
        <BigTile href="/student/readmaster" icon="⭐" label="ReadMaster" hint="All the articles for your grade" />
        <BigTile href="/student/readrise" icon={<ReadRiseIcon size={44} />} label="ReadRise" hint={h.readRiseLevel !== null ? t("ReadRise Level (estimate): {n}", { n: h.readRiseLevel }) : "Articles on every topic"} />
        <BigTile href="/student/fluency-coach" icon={<FluencyCoachIcon size={44} />} label="Fluency Coach" hint="Read aloud and get feedback" />
      </TileGroup>

      {/* D. My Progress */}
      <TileGroup title="My Progress" icon="📈" id="g-progress">
        <BigTile href="/student/plans" icon="🗂️" label="My Plans" hint="My plans and my MAP results" tour="plans" />
        <BigTile href="/student/tests" icon="📝" label="My Tests" hint="Tests to do and finished tests" badge={h.testsToDo} tour="tests" />
        <BigTile href="/student/reports" icon="📊" label="My Reports" hint="All my reports in one place" />
      </TileGroup>

      {/* E. Programs */}
      <TileGroup title="Programs" icon="🧭" id="g-programs" cols={h.rti ? 3 : 2}>
        <BigTile href="/student/curriculum" icon="🧭" label="Curriculum Map" hint="Units and text sets of my grade" />
        {h.rti && <BigTile href="/student/rti" icon="🛟" label="RTI Program" hint="My skills for this week" />}
      </TileGroup>
    </AppShell>
  );
}
