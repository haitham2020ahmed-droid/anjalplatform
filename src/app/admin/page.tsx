import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BigTile, TileGroup, EmptyState, PageHero, BTN_PRIMARY, type TileTone } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { maybeRunDaily } from "@/server/insights/daily";
import { adminHomeData } from "@/server/admin/home-data";
import { runAfterResponse } from "@/server/lib/after-response";
import { adminMayUse } from "@/server/admin/tools";
import { ClassRows } from "@/components/home/class-rows";
import { ADMIN_GROUPS, ADMIN_TOOLS, ALL_TOOLS_HREF } from "@/components/admin-tools";

export const metadata = { title: "Administration" };

/** one soft colour per section (calm: a dot before the heading and a light wash on its tiles) */
const GROUP_TONE: Record<string, TileTone> = { school: "sky", content: "violet", programs: "map", reports: "sun", settings: "slate" };

/**
 * 🏠 Admin Home (calm version), top to bottom: a short welcome band (PageHero) · the school at a glance (4 numbers) · Needs your
 * attention (≤ 3 cards, only when something waits for the admin) · the same five sections as the menu (School,
 * Content, Assessments & Programs, Reports, Settings), a few tiles each (one icon per tile, no section icons) +
 * "More" → All Admin Tools (every other admin page, searchable) · Classes at a glance (folded). The tools live in src/components/admin-tools.ts (no page was lost).
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
    { href: "/admin/questions/requests", icon: "🗑️", title: "Deletion requests", n: deletions },
    { href: "/admin/question-flags", icon: "🚩", title: "Flagged questions", n: flags },
    { href: "/admin/bank-gaps", icon: "🕳", title: "MAP areas short of questions", n: short.length },
    { href: "/admin/connections", icon: "🔌", title: "Connections to fix", n: weak },
  ].filter((a) => a.n > 0).slice(0, 3);

  return (
    <AppShell name={String(me.displayName)}>
      <PageHero tone="admin" eyebrow={today} title={<>{t(greet)}, <bdi>{String(me.displayName).split(" ")[0]}</bdi></>} subtitle={t("School administration")}>
        <h2 className="sr-only">{t("School at a glance")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {glance.map((x) => (
            <Link key={x.label} prefetch={false} href={x.href} className="hero-tile lift flex min-h-20 min-w-0 flex-col justify-center rounded-2xl px-4 py-3">
              <span dir="ltr" className={`block text-3xl font-semibold tabular-nums ${x.tone}`}>{x.value}</span>
              <span className="block truncate text-sm text-slate-600">{t(x.label)}</span>
            </Link>
          ))}
        </div>
      </PageHero>

      <section aria-labelledby="attention-h" className="mt-8">
        <h2 id="attention-h" className="mb-3 text-xl font-semibold text-brand-navy">{t("Needs your attention")}</h2>
        {attention.length === 0 ? <EmptyState compact icon="✅" title="Nothing needs your attention right now" /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((a) => (
              <Link key={a.href} prefetch={false} href={a.href} className="lift flex min-h-24 items-center gap-4 rounded-3xl bg-gradient-to-br from-amber-50 to-white p-4 shadow-card ring-1 ring-amber-200 hover:ring-amber-400">
                <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-3xl shadow-sm">{a.icon}</span>
                <span className="min-w-0">
                  <span className="block text-3xl font-semibold tabular-nums text-amber-800" dir="ltr">{a.n}</span>
                  <span className="block font-semibold text-slate-900">{t(a.title)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {ADMIN_GROUPS.map((g) => {
        const all = tools.filter((x) => x.group === g.key);
        const home = all.filter((x) => x.home);
        if (!home.length) return null;
        const more = all.length - home.length;
        return (
          <div key={g.key}>
            <TileGroup title={g.title} tone={GROUP_TONE[g.key]} cols={home.length > 4 ? 3 : 4} id={`g-${g.key}`}>
              {home.map((x) => <BigTile key={x.href} href={x.href} icon={x.icon} label={x.label} hint={x.hint} tone={GROUP_TONE[g.key]} />)}
            </TileGroup>
            {more > 0 && (
              <p className="mt-2 flex justify-end">
                <Link prefetch={false} href={`${ALL_TOOLS_HREF}#${g.key}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-brand-teal hover:bg-slate-100 hover:text-brand-navy">
                  {t("More: {n} tools", { n: more })} <span aria-hidden="true" className="rtl:rotate-180">→</span>
                </Link>
              </p>
            )}
          </div>
        );
      })}

      <div className="mt-8 flex justify-center">
        <Link prefetch={false} href={ALL_TOOLS_HREF} className={`${BTN_PRIMARY} min-h-12 rounded-2xl px-6`}>
          {t("All Admin Tools")}
        </Link>
      </div>

      {rows.length > 0 && (
        <details className="mt-8 rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-200/80 sm:px-6">
          <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold text-brand-navy">{t("Classes at a glance")}</summary>
          <div className="mt-3 overflow-x-auto"><ClassRows rows={rows} admin /></div>
        </details>
      )}
    </AppShell>
  );
}
