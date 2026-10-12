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

export const metadata = { title: "Administration" };


/**
 * 🏠 Admin Home, top to bottom: a short welcome band with ONE primary action (Open School) · the school at a glance
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
  const { t, lang } = await getT();
  // every count of the page in one round trip; the alert scan runs after the page is sent (Update 42B)
  const { waiting, deletions, students, active, alertsOpen, flags, reportsWaiting, short, rows, conn } = await adminHomeData(repo, actor);
  const tools = ADMIN_TOOLS.filter((x) => adminMayUse(actor, x));
  const canSchool = tools.some((x) => x.href === "/admin/school");

  const now = new Date();
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
    { href: "/admin/report-approvals", icon: "📨", title: "Family reports to approve", n: reportsWaiting },
    { href: "/admin/questions?status=UNDER_REVIEW", icon: "⏳", title: "Questions waiting for approval", n: waiting },
    { href: "/admin/questions/requests", icon: "✏️", title: "Teacher requests", n: deletions },
    { href: "/admin/question-flags", icon: "🚩", title: "Flagged questions", n: flags },
    { href: "/admin/bank-gaps", icon: "🕳", title: "MAP areas short of questions", n: short.length },
    { href: "/admin/connections", icon: "🔌", title: "Connections to fix", n: weak },
  ].filter((a) => a.n > 0).slice(0, 3);

  // 🧑‍🏫 teacher follow-up: 🟢 active (work sent in the last 7 days) · 🟠 slowing (nothing for 7+ days) · 🔴 sent nothing in 30 days
  const follow = await teacherFollowupForHome(repo, actor, now).catch(() => ({ rows: [] as Awaited<ReturnType<typeof teacherFollowup>>["rows"] }));
  const statusOf = (r: (typeof follow.rows)[number]) => r.assignments30 === 0 ? "RED" : !r.lastAssignment || now.getTime() - new Date(r.lastAssignment).getTime() > 7 * 86_400_000 ? "ORANGE" : "GREEN";
  const FOLLOW = { GREEN: ["🟢", "Active"], ORANGE: ["🟠", "Slowing"], RED: ["🔴", "Sent nothing"] } as const;
  const order = { RED: 0, ORANGE: 1, GREEN: 2 } as const;
  const teachers = follow.rows.map((r) => ({ r, st: statusOf(r) as keyof typeof FOLLOW })).sort((a, b) => order[a.st] - order[b.st] || a.r.name.localeCompare(b.r.name));
  const pending = waiting + reportsWaiting + deletions + flags;
  const cards = [
    { href: "/admin/teachers", label: "Teachers", value: String(follow.rows.length), icon: "🧑‍🏫" },
    { href: "/admin/users", label: "Students", value: String(students), icon: "👥" },
    { href: "/admin/analytics", label: "Activity this week", value: students ? `${Math.round((100 * practised) / students)}%` : "—", icon: "📈" },
    { href: attention[0]?.href ?? "/admin/report-approvals", label: "Pending approvals", value: String(pending), icon: "⏳", alert: pending > 0 },
  ];
  const shortcut = "flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-navy shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal";
  return (
    <AppShell name={String(me.displayName)}>
      <header className="mb-4">
        <p className="text-sm text-slate-500">{today}</p>
        <h1 className="text-3xl font-semibold text-brand-navy">{t(greet)}, <bdi>{String(me.displayName).split(" ")[0]}</bdi></h1>
      </header>

      <section aria-label={t("School at a glance")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} prefetch={false} href={c.href} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal">
            <span className="flex items-center justify-between"><span dir="ltr" className={`text-3xl font-semibold tabular-nums ${c.alert ? "text-amber-700" : "text-brand-navy"}`}>{c.value}</span><span aria-hidden="true" className="text-xl">{c.icon}</span></span>
            <span className="mt-1 block text-sm font-semibold text-slate-600">{t(c.label)}</span>
          </Link>
        ))}
      </section>

      {attention.length > 0 && (
        <section aria-label={t("Needs your attention")} className="mt-4 flex flex-wrap gap-2">
          {attention.map((a) => <Link key={a.href} prefetch={false} href={a.href} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-50 px-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">{a.icon}</span>{t(a.title)} · {a.n}</Link>)}
        </section>
      )}

      <section aria-label={t("Shortcuts")} className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Link prefetch={false} href="/admin/coverage" className={shortcut}><span aria-hidden="true">📊</span>{t("Coverage Report")}</Link>
        <Link prefetch={false} href="/admin/item-quality" className={shortcut}><span aria-hidden="true">🔬</span>{t("Question Check")}</Link>
        {actor.role === "SCHOOL_ADMIN" && <Link prefetch={false} href="/admin/questions/load" className={shortcut}><span aria-hidden="true">⬇️</span>{t("Load new questions")}</Link>}
        <Link prefetch={false} href="/admin/users?role=TEACHER" className={shortcut}><span aria-hidden="true">➕</span>{t("Add a teacher")}</Link>
        <Link prefetch={false} href={ALL_TOOLS_HREF} className={shortcut}><span aria-hidden="true">🧰</span>{t("All Admin Tools")}</Link>
      </section>

      <section aria-labelledby="follow-h" className="mt-5 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <h2 id="follow-h" className="border-b px-4 py-3 text-lg font-semibold text-brand-navy">🧑‍🏫 {t("Teacher follow-up")}</h2>
        {teachers.length === 0 ? <p className="p-4 text-sm text-slate-600">{t("No teachers yet.")}</p> : (
          <ul className="divide-y divide-slate-100">
            {teachers.map(({ r, st }) => (
              <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0"><span aria-hidden="true">{FOLLOW[st][0]}</span> <bdi className="font-semibold text-slate-900">{r.name}</bdi> <span className="text-slate-500">· {r.classes.join(", ") || "—"}</span></span>
                <span className="text-slate-600">{t(FOLLOW[st][1])} · {t("{n} sent in 30 days", { n: r.assignments30 })}{r.lastAssignment ? ` · ${t("last")} ${r.lastAssignment.slice(0, 10)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rows.length > 0 && (
        <details className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:px-6">
          <summary className="min-h-10 cursor-pointer content-center text-base font-semibold text-brand-navy">{t("Classes at a glance")}</summary>
          <div className="mt-3 overflow-x-auto"><ClassRows rows={rows} admin /></div>
        </details>
      )}
    </AppShell>
  );
}
