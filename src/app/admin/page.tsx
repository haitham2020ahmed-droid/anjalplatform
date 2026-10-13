import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { maybeRunDaily } from "@/server/insights/daily";
import { adminHomeData } from "@/server/admin/home-data";
import { runAfterResponse } from "@/server/lib/after-response";
import { adminMayUse } from "@/server/admin/tools";
import { ClassRows } from "@/components/home/class-rows";
import { teacherFollowupForHome, type teacherFollowup } from "@/server/insights/teacher-followup";
import { ADMIN_TOOLS, ALL_TOOLS_HREF } from "@/components/admin-tools";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { urgentUnhandledCount } from "@/server/insights/early-warning";

export const metadata = { title: "Administration" };


/**
 * Admin Home (Literise D1 look: calm line icons, no emoji), top to bottom: a short welcome band with ONE primary action (Open School) · the school at a glance
 * (4 numbers) · Needs your attention (≤ 3 cards, only when something waits for the admin) · the five sections of the
 * menu (School, Content, Assessments & Programs, Reports, Settings): a plain one-line blurb and ≤ 6 working tools each
 * (one icon per tile, no section icons) + "More" → All Admin Tools · Classes at a glance (folded).
 * The tools live in src/components/admin-tools.ts; every one opens a working page (tests/admin-review.test.ts).
 */
export default async function AdminHome() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  // the daily learning job (decay, misconceptions, profiles, advice outcomes, digests): once a day, in the background
  runAfterResponse("admin.daily", () => maybeRunDaily(repo, actor.schoolId).catch(() => false));
  const me = (await getActor())!.user;
  const now = new Date();
  // every count of the page in one round trip, the teacher follow-up beside it; the alert scan runs after the page is sent (Update 42B)
  const [{ t, lang }, { waiting, deletions, students, active, alertsOpen, flags, reportsWaiting, short, rows, conn }, urgentOld, follow] = await Promise.all([
    getT(),
    adminHomeData(repo, actor),
    urgentUnhandledCount(repo, actor.schoolId!, now).catch(() => 0), // early warning: urgent, not handled for 7+ days
    teacherFollowupForHome(repo, actor, now).catch(() => ({ rows: [] as Awaited<ReturnType<typeof teacherFollowup>>["rows"] })),
  ]);
  const tools = ADMIN_TOOLS.filter((x) => adminMayUse(actor, x));
  const canSchool = tools.some((x) => x.href === "/admin/school");

  const hour = (now.getUTCHours() + 3) % 24;
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" });
  const practised = Math.min(active, students);
  const glance = [
    { href: "/admin/users", label: "Students", value: String(students), tone: "text-brand-navy" },
    { href: "/admin/department", label: "Classes", value: String(rows.length), tone: "text-brand-navy" },
    { href: "/admin/department", label: "Practised this week", value: students ? `${Math.round((100 * practised) / students)}%` : "—", tone: "text-brand-navy" },
    { href: "/teacher/alerts", label: "Alerts not handled", value: String(alertsOpen), tone: alertsOpen ? "text-red-700" : "text-emerald-700" },
  ];
  // only what waits for the admin's decision, most urgent first, at most three
  const weak = conn ? conn.stages.flatMap((st) => st.checks.filter((c) => c.health === "BAD")).length : 0;
  const attention = [
    { href: "/teacher/reports/early-warning", icon: "alert" as LineIconName, title: "Urgent students not handled for 7+ days", n: urgentOld },
    { href: "/admin/report-approvals", icon: "inbox" as LineIconName, title: "Family reports to approve", n: reportsWaiting },
    { href: "/admin/questions?status=UNDER_REVIEW", icon: "clock" as LineIconName, title: "Questions waiting for approval", n: waiting },
    { href: "/admin/questions/requests", icon: "pen" as LineIconName, title: "Teacher requests", n: deletions },
    { href: "/admin/question-flags", icon: "flag" as LineIconName, title: "Flagged questions", n: flags },
    { href: "/admin/bank-gaps", icon: "alert" as LineIconName, title: "MAP areas short of questions", n: short.length },
    { href: "/admin/connections", icon: "link" as LineIconName, title: "Connections to fix", n: weak },
  ].filter((a) => a.n > 0).slice(0, 3);

  // teacher follow-up: green = active (work sent in the last 7 days) · amber = slowing (nothing for 7+ days) · red = sent nothing in 30 days
  const statusOf = (r: (typeof follow.rows)[number]) => r.assignments30 === 0 ? "RED" : !r.lastAssignment || now.getTime() - new Date(r.lastAssignment).getTime() > 7 * 86_400_000 ? "ORANGE" : "GREEN";
  const FOLLOW = { GREEN: ["bg-emerald-500", "Active"], ORANGE: ["bg-amber-500", "Slowing"], RED: ["bg-rose-500", "Sent nothing"] } as const;
  const order = { RED: 0, ORANGE: 1, GREEN: 2 } as const;
  const teachers = follow.rows.map((r) => ({ r, st: statusOf(r) as keyof typeof FOLLOW })).sort((a, b) => order[a.st] - order[b.st] || a.r.name.localeCompare(b.r.name));
  const pending = waiting + reportsWaiting + deletions + flags;
  const cards = [
    { href: "/admin/teachers", label: "Teachers", value: String(follow.rows.length), icon: "teacher" as LineIconName },
    { href: "/admin/users", label: "Students", value: String(students), icon: "users" as LineIconName },
    { href: "/admin/analytics", label: "Activity this week", value: students ? `${Math.round((100 * practised) / students)}%` : "—", icon: "growth" as LineIconName },
    { href: attention[0]?.href ?? "/admin/report-approvals", label: "Pending approvals", value: String(pending), icon: "clock" as LineIconName, alert: pending > 0 },
  ];
  const shortcut = "flex min-h-10 items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-ink ring-1 ring-line hover:ring-brand-teal";
  const ico = (n: LineIconName) => <span aria-hidden="true" className="text-muted"><LineIcon name={n} className="h-[18px] w-[18px]" /></span>;
  return (
    <AppShell name={String(me.displayName)}>
      <header className="mb-4">
        <p className="text-sm text-muted">{today}</p>
        <h1 className="text-3xl text-ink">{t(greet)}, <bdi>{String(me.displayName).split(" ")[0]}</bdi></h1>
      </header>

      <section aria-label={t("School at a glance")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} prefetch={false} href={c.href} className="rounded-[1.25rem] bg-surface p-4 shadow-card ring-1 ring-line hover:ring-brand-teal">
            <span className="flex items-center justify-between"><span dir="ltr" className={`font-display text-[2.25rem] leading-none tabular-nums ${c.alert ? "text-amber-700" : "text-ink"}`}>{c.value}</span><span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-line"><LineIcon name={c.icon} className="h-[18px] w-[18px]" /></span></span>
            <span className="mt-2 block text-sm font-semibold text-ink-2">{t(c.label)}</span>
          </Link>
        ))}
      </section>

      {attention.length > 0 && (
        <section aria-label={t("Needs your attention")} className="mt-4 flex flex-wrap gap-2">
          {attention.map((a) => <Link key={a.href} prefetch={false} href={a.href} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-50 px-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"><LineIcon name={a.icon} className="h-4 w-4" />{t(a.title)} · {a.n}</Link>)}
        </section>
      )}

      <section aria-label={t("Shortcuts")} className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Link prefetch={false} href="/teacher/reports/early-warning" className={shortcut}>{ico("alert")}{t("Early Warning")}</Link>
        <Link prefetch={false} href="/admin/coverage" className={shortcut}>{ico("chart")}{t("Coverage Report")}</Link>
        <Link prefetch={false} href="/admin/item-quality" className={shortcut}>{ico("search")}{t("Question Check")}</Link>
        {actor.role === "SCHOOL_ADMIN" && <Link prefetch={false} href="/admin/questions/load" className={shortcut}>{ico("download")}{t("Load new questions")}</Link>}
        <Link prefetch={false} href="/admin/users?role=TEACHER" className={shortcut}>{ico("teacher")}{t("Add a teacher")}</Link>
        <Link prefetch={false} href={ALL_TOOLS_HREF} className={shortcut}>{ico("tools")}{t("All Admin Tools")}</Link>
      </section>

      <section aria-labelledby="follow-h" className="mt-5 rounded-[1.25rem] bg-surface shadow-card ring-1 ring-line">
        <h2 id="follow-h" className="flex items-center gap-2 border-b border-line px-4 py-3 text-xl text-ink"><LineIcon name="teacher" className="h-5 w-5 text-muted" />{t("Teacher follow-up")}</h2>
        {teachers.length === 0 ? <p className="p-4 text-sm text-ink-2">{t("No teachers yet.")}</p> : (
          <ul className="divide-y divide-line">
            {teachers.map(({ r, st }) => (
              <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${FOLLOW[st][0]}`} /><bdi className="font-semibold text-ink">{r.name}</bdi> <span className="text-muted">· {r.classes.join(", ") || "—"}</span></span>
                <span className="text-ink-2">{t(FOLLOW[st][1])} · {t("{n} sent in 30 days", { n: r.assignments30 })}{r.lastAssignment ? ` · ${t("last")} ${r.lastAssignment.slice(0, 10)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rows.length > 0 && (
        <details className="mt-5 rounded-[1.25rem] bg-surface p-4 shadow-card ring-1 ring-line sm:px-6">
          <summary className="min-h-10 cursor-pointer content-center text-base font-semibold text-ink">{t("Classes at a glance")}</summary>
          <div className="mt-3 overflow-x-auto"><ClassRows rows={rows} admin /></div>
        </details>
      )}
    </AppShell>
  );
}
