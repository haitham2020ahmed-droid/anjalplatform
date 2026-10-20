import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import type { Actor } from "@/server/auth/rbac";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";
import { maybeRunDaily } from "@/server/insights/daily";
import { scanAlerts } from "@/server/insights/alerts";
import { adminHomeCounts, mapShortAreas } from "@/server/admin/home-data";
import { runAfterResponse } from "@/server/lib/after-response";
import { memoryHigh, runHeavy } from "@/server/monitoring/memory";
import { ClassRows } from "@/components/home/class-rows";
import { classesAtAGlance } from "@/server/insights/overview";
import { connectionsKept } from "@/server/admin/connections";
import { teacherFollowupForHome, type teacherFollowup } from "@/server/insights/teacher-followup";
import { ADMIN_TOOLS, ALL_TOOLS_HREF } from "@/components/admin-tools";
import { adminMayUse } from "@/server/admin/tools";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { urgentUnhandledCount } from "@/server/insights/early-warning";
import { schoolWeekInReview } from "@/server/insights/week-in-review";

export const metadata = { title: "Administration" };

type Follow = Awaited<ReturnType<typeof teacherFollowup>>["rows"];

/**
 * Admin Home (Literise D1 look: calm line icons, no emoji), top to bottom: a short welcome · the school at a glance
 * (4 numbers) · Needs your attention (≤ 3 chips, only when something waits for the admin) · shortcuts · Teacher
 * follow-up · Classes at a glance (folded).
 *
 * Streamed (Update 57): the frame (greeting, shortcuts) is sent at once; the numbers, the follow-up and the classes
 * each arrive on their own behind a loader (Suspense), side by side — no section waits for another. The MAP readiness
 * of the bank (the slow part) is never built while the admin waits: the last answer is shown and a new one is built
 * after the response (src/server/admin/home-data.ts); the same for the Connections check (it builds the MAP pools too).
 * The daily job and the alert scan also run after the response.
 */
export default async function AdminHome() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  // the daily learning job (decay, misconceptions, profiles, advice outcomes, digests): once a day, in the background
  runAfterResponse("admin.daily", () => maybeRunDaily(repo, actor.schoolId).catch(() => false));
  const schoolId = actor.schoolId;
  if (schoolId && !memoryHigh()) runAfterResponse("admin.alert_scan", () => runHeavy(() => scanAlerts(repo, schoolId)).catch(() => 0));
  const now = new Date();
  const [{ t, lang }, me] = await Promise.all([getT(), getActor()]);
  const name = String(me!.user.displayName);

  const hour = (now.getUTCHours() + 3) % 24;
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" });
  // read side by side from the start; each section awaits only its own part
  const follow = teacherFollowupForHome(repo, actor, now).catch(() => ({ rows: [] as Follow }));
  // the shortcuts this admin may use (the same rule as the All Admin Tools page)
  const mayUse = new Set(ADMIN_TOOLS.filter((x) => adminMayUse(actor, x)).map((x) => x.href.split("?")[0]));
  const may = (href: string) => !ADMIN_TOOLS.some((x) => x.href.split("?")[0] === href.split("?")[0]) || mayUse.has(href.split("?")[0]);
  const shortcut = "flex min-h-10 items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-ink ring-1 ring-line hover:ring-brand-teal";
  const ico = (n: LineIconName) => <span aria-hidden="true" className="text-muted"><LineIcon name={n} className="h-[18px] w-[18px]" /></span>;
  return (
    <AppShell name={name}>
      <header className="mb-4">
        <p className="text-sm text-muted">{today}</p>
        <h1 className="text-3xl text-ink">{t(greet)}, <bdi>{name.split(" ")[0]}</bdi></h1>
      </header>

      <Suspense fallback={<GlanceLoading label={t("Loading…")} />}>
        <Glance actor={actor} now={now} follow={follow} t={t} />
      </Suspense>

      <section aria-label={t("Shortcuts")} className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Link prefetch={false} href="/teacher/reports/early-warning" className={shortcut}>{ico("alert")}{t("Early Warning")}</Link>
        {may("/admin/coverage") && <Link prefetch={false} href="/admin/coverage" className={shortcut}>{ico("chart")}{t("Coverage Report")}</Link>}
        {may("/admin/item-quality") && <Link prefetch={false} href="/admin/item-quality" className={shortcut}>{ico("search")}{t("Question Check")}</Link>}
        {actor.role === "SCHOOL_ADMIN" && <Link prefetch={false} href="/admin/questions/load" className={shortcut}>{ico("download")}{t("Load new questions")}</Link>}
        <Link prefetch={false} href="/admin/users?role=TEACHER" className={shortcut}>{ico("teacher")}{t("Add a teacher")}</Link>
        <Link prefetch={false} href="/teacher/assigned" className={shortcut}>{ico("inbox")}{t("Assigned")}</Link>
        <Link prefetch={false} href={ALL_TOOLS_HREF} className={shortcut}>{ico("tools")}{t("All Admin Tools")}</Link>
      </section>

      {/* Week in Review (new): 3 headline numbers for the whole school, this rolling week. One slim card, no
         links, so it stays out of the way — a loader shaped the same so nothing jumps when it arrives. */}
      <Suspense fallback={<WeekLoading label={t("Loading…")} />}>
        <WeekInReviewCard actor={actor} now={now} t={t} />
      </Suspense>

      <Suspense fallback={<BlockLoading label={t("Loading…")} title={t("Teacher follow-up")} />}>
        <FollowUp follow={follow} now={now} t={t} />
      </Suspense>

      <Suspense fallback={<BlockLoading label={t("Loading…")} title={t("Classes at a glance")} />}>
        <Classes actor={actor} t={t} />
      </Suspense>
    </AppShell>
  );
}

/** Loader shaped like the 4 numbers and the attention chips. */
function GlanceLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="animate-pulse motion-reduce:animate-none">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[6.25rem] rounded-[1.25rem] bg-surface p-4 ring-1 ring-line"><div className="h-8 w-16 rounded bg-surface-2" /><div className="mt-4 h-3 w-24 rounded bg-surface-2" /></div>)}
      </div>
    </div>
  );
}
/** Loader shaped like the Week in Review card (one slim row, 3 numbers). */
function WeekLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="mt-5 animate-pulse rounded-xl bg-surface px-3 py-2 shadow-card ring-1 ring-line motion-reduce:animate-none" aria-hidden="true">
      <div className="mb-2 h-3 w-32 rounded bg-surface-2" />
      <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 rounded bg-surface-2" />)}</div>
    </div>
  );
}
/** Loader of a folded / list section (title + a few grey lines). */
function BlockLoading({ label, title }: { label: string; title: string }) {
  return (
    <section role="status" aria-label={label} className="mt-5 rounded-[1.25rem] bg-surface p-4 shadow-card ring-1 ring-line">
      <p className="text-base font-semibold text-ink">{title}</p>
      <div className="mt-3 space-y-2 animate-pulse motion-reduce:animate-none" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="h-3 rounded bg-surface-2" style={{ width: `${90 - i * 20}%` }} />)}</div>
    </section>
  );
}

/** The school at a glance (4 numbers) and what waits for the admin's decision (≤ 3 chips, most urgent first). */
async function Glance({ actor, now, follow, t }: { actor: Actor; now: Date; follow: Promise<{ rows: Follow }>; t: TFn }) {
  const [c, short, urgentOld, conn, f] = await Promise.all([
    adminHomeCounts(repo, actor, now),
    mapShortAreas(repo, actor), // the kept answer; never built while the admin waits
    urgentUnhandledCount(repo, actor.schoolId!, now).catch(() => 0), // early warning: urgent, not handled for 7+ days
    connectionsKept(repo, actor), // the kept check (it builds the MAP pools): never built while the admin waits
    follow,
  ]);
  const practised = Math.min(c.active, c.students);
  const weak = conn ? conn.stages.flatMap((st) => st.checks.filter((x) => x.health === "BAD")).length : 0;
  const attention = [
    { href: "/teacher/reports/early-warning", icon: "alert" as LineIconName, title: "Urgent students not handled for 7+ days", n: urgentOld },
    { href: "/admin/report-approvals", icon: "inbox" as LineIconName, title: "Family reports to approve", n: c.reportsWaiting },
    { href: "/admin/questions?status=UNDER_REVIEW", icon: "clock" as LineIconName, title: "Questions waiting for approval", n: c.waiting },
    { href: "/admin/questions/requests", icon: "pen" as LineIconName, title: "Teacher requests", n: c.deletions },
    { href: "/admin/question-flags", icon: "flag" as LineIconName, title: "Flagged questions", n: c.flags },
    { href: "/admin/bank-gaps", icon: "alert" as LineIconName, title: "MAP areas short of questions", n: short?.length ?? 0 },
    { href: "/admin/connections", icon: "link" as LineIconName, title: "Connections to fix", n: weak },
  ].filter((a) => a.n > 0).slice(0, 3);
  const pending = c.waiting + c.reportsWaiting + c.deletions + c.flags;
  const cards = [
    { href: "/admin/teachers", label: "Teachers", value: String(f.rows.length), icon: "teacher" as LineIconName },
    { href: "/admin/users", label: "Students", value: String(c.students), icon: "users" as LineIconName },
    { href: "/admin/analytics", label: "Activity this week", value: c.students ? `${Math.round((100 * practised) / c.students)}%` : "—", icon: "growth" as LineIconName },
    { href: attention[0]?.href ?? "/admin/report-approvals", label: "Pending approvals", value: String(pending), icon: "clock" as LineIconName, alert: pending > 0 },
  ];
  return (
    <>
      <section aria-label={t("School at a glance")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((x) => (
          <Link key={x.label} prefetch={false} href={x.href} className="rounded-[1.25rem] bg-surface p-4 shadow-card ring-1 ring-line hover:ring-brand-teal">
            <span className="flex items-center justify-between"><span dir="ltr" className={`font-display text-[2.25rem] leading-none tabular-nums ${x.alert ? "text-amber-700" : "text-ink"}`}>{x.value}</span><span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-line"><LineIcon name={x.icon} className="h-[18px] w-[18px]" /></span></span>
            <span className="mt-2 block text-sm font-semibold text-ink-2">{t(x.label)}</span>
          </Link>
        ))}
      </section>
      {attention.length > 0 && (
        <section aria-label={t("Needs your attention")} className="mt-4 flex flex-wrap gap-2">
          {attention.map((a) => <Link key={a.href} prefetch={false} href={a.href} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-50 px-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"><LineIcon name={a.icon} className="h-4 w-4" />{t(a.title)} · {a.n}</Link>)}
        </section>
      )}
    </>
  );
}

/** 3 headline numbers for the whole school, this rolling week (same window as "Activity this week" above). */
async function WeekInReviewCard({ actor, now, t }: { actor: Actor; now: Date; t: TFn }) {
  const wk = await schoolWeekInReview(repo, actor, now).catch(() => ({ questions: 0, minutes: 0, skills: 0 }));
  return (
    <section aria-label={t("This week, the school")} className="mt-5 rounded-xl bg-surface px-3 py-2 shadow-card ring-1 ring-line">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink"><LineIcon name="growth" className="h-4 w-4 text-muted" />{t("This week, the school")}</h2>
      <div className="grid grid-cols-3 gap-2 text-center" dir="ltr">
        <div><span className="block font-display text-lg leading-none tabular-nums text-ink">{wk.questions}</span><span className="block text-xs text-ink-2">{t("Questions answered")}</span></div>
        <div><span className="block font-display text-lg leading-none tabular-nums text-ink">{wk.minutes}</span><span className="block text-xs text-ink-2">{t("Minutes practised")}</span></div>
        <div><span className="block font-display text-lg leading-none tabular-nums text-ink">{wk.skills}</span><span className="block text-xs text-ink-2">{t("Skills practised")}</span></div>
      </div>
    </section>
  );
}

/** Teacher follow-up: green = active (work sent in the last 7 days) · amber = slowing (nothing for 7+ days) · red = sent nothing in 30 days. */
async function FollowUp({ follow, now, t }: { follow: Promise<{ rows: Follow }>; now: Date; t: TFn }) {
  const f = await follow;
  const statusOf = (r: Follow[number]) => r.assignments30 === 0 ? "RED" : !r.lastAssignment || now.getTime() - new Date(r.lastAssignment).getTime() > 7 * 86_400_000 ? "ORANGE" : "GREEN";
  const FOLLOW = { GREEN: ["bg-emerald-500", "Active"], ORANGE: ["bg-amber-500", "Slowing"], RED: ["bg-rose-500", "Sent nothing"] } as const;
  const order = { RED: 0, ORANGE: 1, GREEN: 2 } as const;
  const teachers = f.rows.map((r) => ({ r, st: statusOf(r) as keyof typeof FOLLOW })).sort((a, b) => order[a.st] - order[b.st] || a.r.name.localeCompare(b.r.name));
  return (
    // compact one-line rows (as the Teacher Home's Needs attention): the first 5, "Show all (N)" opens the rest in a
    // box that scrolls; each teacher opens their assigned work (Assigned, filtered by the teacher)
    <section aria-labelledby="follow-h" className="group/fu mt-5 rounded-xl bg-surface shadow-card ring-1 ring-line">
      <h2 id="follow-h" className="flex items-center gap-2 border-b border-line px-3 py-2 text-base font-semibold text-ink"><LineIcon name="teacher" className="h-4 w-4 text-muted" />{t("Teacher follow-up")}</h2>
      {teachers.length === 0 ? <p className="px-3 py-2 text-sm text-ink-2">{t("No teachers yet.")}</p> : (
        <div role="region" aria-label={t("Teacher follow-up")} tabIndex={0} className="max-h-[15rem] overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
          <ul className="divide-y divide-line">
            {teachers.map(({ r, st }, ix) => (
              <li key={r.userId} className={`${ix >= 5 ? "hidden group-has-[:checked]/fu:flex" : "flex"} items-center justify-between gap-2 px-3 py-1 text-[13px] leading-5`}>
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${FOLLOW[st][0]}`} /><bdi className="font-semibold text-ink">{r.name}</bdi> <span className="truncate text-xs text-muted">· {r.classes.join(", ") || "—"}</span></span>
                <span className="hidden shrink-0 text-xs text-ink-2 sm:inline">{t(FOLLOW[st][1])} · {t("{n} sent in 30 days", { n: r.assignments30 })}{r.lastAssignment ? ` · ${t("last")} ${r.lastAssignment.slice(0, 10)}` : ""}</span>
                <Link prefetch={false} href={`/teacher/assigned?teacher=${encodeURIComponent(r.userId)}`} className="inline-flex h-7 shrink-0 items-center rounded-md bg-surface px-2.5 text-xs font-semibold text-brand-navy ring-1 ring-line hover:ring-brand-teal">{t("Assigned")}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {teachers.length > 5 && <p className="border-t border-line px-3 py-1.5"><label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-teal has-[:focus-visible]:underline"><input type="checkbox" className="peer sr-only" /> <span className="group-has-[:checked]/fu:hidden">{t("Show all ({n})", { n: teachers.length })}</span><span className="hidden group-has-[:checked]/fu:inline">{t("Show fewer")}</span></label></p>}
    </section>
  );
}

/** Classes at a glance (folded). */
async function Classes({ actor, t }: { actor: Actor; t: TFn }) {
  const rows = await classesAtAGlance(repo, actor);
  if (!rows.length) return null;
  return (
    <details className="mt-5 rounded-[1.25rem] bg-surface p-4 shadow-card ring-1 ring-line sm:px-6">
      <summary className="min-h-10 cursor-pointer content-center text-base font-semibold text-ink">{t("Classes at a glance")}</summary>
      <div className="mt-3 overflow-x-auto"><ClassRows rows={rows} admin /></div>
    </details>
  );
}
