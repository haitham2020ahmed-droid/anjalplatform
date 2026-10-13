import { Suspense } from "react";
import { headers } from "next/headers";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { PrintBox } from "./print/print-box";
import { SubmitFeedback } from "./ui/submit-feedback";
import { ComfortToggle } from "./ui/comfort-toggle";
import { NavProgress } from "./ui/nav-progress";
import { MenuButton, SideNav } from "./ui/side-nav";
import { JumpTo } from "./ui/jump-to";
import { FirstLoginTour, LangSwitch, StickyHome } from "./ui-kit";
import { navItemsFor, searchablePagesFor } from "./nav-items";
import { RewardChip } from "./motivation/reward-chip";
import { FeedbackButton } from "@/components/feedback/feedback-button";
import { LiteriseLogo } from "./brand/literise-logo";
import { SchoolLogo } from "./brand/school-logo";
import { ThemeToggle } from "./ui/theme-toggle";
import { getTheme } from "@/server/ui/theme";
import { getActor, HOME_BY_ROLE, repo } from "@/server/auth/next";
import type { Role } from "@/server/auth/rbac";
import type { NavCount } from "@/server/teacher/week-plan";
import { shellData } from "@/server/ui/shell-data";
import { needsTour } from "@/server/ui/prefs";
import { getT } from "@/i18n/server";
import { isContentPath } from "@/i18n/content-routes";
import { canSeeNafsCached } from "@/server/teacher/nafs-access";
import { matchReport } from "./teacher/report-catalog";
import { ReportBar } from "./teacher/report-bar";

const ROLE_NAME: Record<string, string> = { TEACHER: "Teacher", SCHOOL_ADMIN: "School admin", SUPER_ADMIN: "Platform admin", STUDENT: "Student", PARENT: "Parent" };

/**
 * Shared page frame (Literise D1). Top bar (sticky, white; night: the page colour): menu (phone) · the Al-Anjal school
 * logo · person · Day / Night · English | Arabic · sign out. Desktop: the role's short menu on a white rail (Literise
 * logo on top, line icons, the current page as a navy pill, "More" folded; numbers = waiting work); phone: the same
 * menu in a drawer. The interface language (menus, headings, buttons) follows the user's choice; page content is
 * never translated.
 */
export async function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const me = await getActor();   // cached for the request: no extra query
  const [{ t, lang }, theme] = await Promise.all([getT(), getTheme()]);
  // English learning content (passages, questions, feedback) keeps its own direction in Arabic mode
  let content = false, pathname = "", search = "";
  try { const h = await headers(); pathname = h.get("x-pathname") ?? ""; search = h.get("x-search") ?? ""; } catch { /* outside a request */ }
  if (lang === "ar") content = isContentPath(pathname);
  // the menu numbers and a student's menu flags are independent: read them at the same time (every page)
  // (started by requireActor, so it was read at the same time as the page's own data)
  const [countsR, flagsR] = me ? await shellData(repo, me.actor) : [null, null];
  const counts: Record<string, NavCount> = countsR ?? {};
  const role = String(me?.actor.role ?? "");
  // "/student/rti" in the counts = the student is in the RTI program (Tier 2/3): only then the RTI entry.
  // NAFS the same way: "/student/nafs" in the counts.
  // a teacher's NAFS flag = teaches a Grade 6 class (NAFS is for Grade 6 only)
  const flags = role === "TEACHER" ? { nafs: me ? await canSeeNafsCached(repo, me.actor).catch(() => false) : false }
    : flagsR ?? { rti: "/student/rti" in counts, nafs: "/student/nafs" in counts };
  const items = navItemsFor(role, flags).map((i) => ({ ...i, ...(counts[i.href] ?? {}) }));
  const staff = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(role);
  // a report page (the Reports catalogue): the report bar on top — class switcher, student, date range, Download, Send
  const report = staff && me ? matchReport(pathname, search) : null;
  const calm = role === "TEACHER";
  const home = HOME_BY_ROLE[role as Role] ?? "/";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  // the rail's top: the Literise logo (teachers: with their role under it); the school logo sits in the top bar
  const brand = (
    <a href={home} className="flex flex-col gap-1 rounded-xl px-1 py-1">
      <LiteriseLogo size="sm" />
      {calm && <span className="ps-8 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{t("Teacher")}</span>}
    </a>
  );
  const sideNav = items.length > 0;
  // on phones the drawer carries the extras, so the top bar keeps only the big buttons
  const drawerFooter = (
    <div className="flex flex-wrap items-center gap-2">
      <Suspense fallback={null}><NotificationBell /></Suspense>
      {role === "STUDENT" && <ComfortToggle />}
      {me && <FeedbackButton />}
      <LogoutButton label={t("Sign out")} />
    </div>
  );
  // the top bar keeps only the name, the language switch and Sign out (owner's spec): the rest lives in the side menu
  const extras = (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
      <Suspense fallback={<span className="inline-block h-8 w-8" aria-hidden="true" />}><NotificationBell /></Suspense>
      {staff && <PrintBox />}
      {role === "STUDENT" && <ComfortToggle />}
      {me && <FeedbackButton />}
    </div>
  );
  const finder = sideNav ? <JumpTo items={[...items, ...searchablePagesFor(role, flags).filter((p) => !items.some((i) => i.href === p.href))]} people={staff} /> : null;
  return (
    <div className={`page-bg role-${role.toLowerCase() || "guest"} min-h-screen text-ink ${role === "STUDENT" ? "theme-calm" : calm ? "theme-calm" : "theme-playful"}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-navy focus:px-4 focus:py-2 focus:font-semibold focus:text-white">{t("Skip to content")}</a>
      <Suspense fallback={null}><NavProgress /></Suspense>
      <Suspense fallback={null}><SubmitFeedback /></Suspense>
      {sideNav && <SideNav items={items} brand={brand} footer={drawerFooter} tools={finder} extras={extras} variant={calm ? "calm" : "default"} />}
      <div className={sideNav ? "lg:ps-64" : ""}>
        <header className="sticky top-0 z-20 border-b border-line bg-topbar/95 backdrop-blur-md print:hidden">
          <div className="mx-auto flex min-h-14 max-w-7xl min-w-0 items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-6">
            {sideNav && <MenuButton label={t("Open the menu")} />}
            <a href={home} className="flex min-w-0 items-center gap-3 rounded-lg" aria-label={t("Home")}>
              <SchoolLogo size="sm" className="hidden md:inline-flex" />
              <SchoolLogo variant="mark" className="h-9 w-auto md:hidden" />
              {!sideNav && <span className="hidden border-s border-line ps-3 md:block"><LiteriseLogo size="sm" /></span>}
              {sideNav && <span className="hidden border-s border-line ps-3 sm:block lg:hidden"><LiteriseLogo size="sm" /></span>}
            </a>
            <div className="flex-1" />
            {/* students: avatar + coins + badge next to the name; staff: initials and name */}
            {role === "STUDENT" && me?.actor.studentId ? (
              <Suspense fallback={<span className="inline-block h-10 w-20" aria-hidden="true" />}><RewardChip studentId={me.actor.studentId} name={name} /></Suspense>
            ) : (
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[#9b8bdb] text-xs font-bold text-[#1d2160]">{initials || "•"}</span>
                <span className="hidden leading-tight sm:block"><bdi className="block max-w-[12rem] truncate text-sm font-semibold text-ink">{name}</bdi><span className="block text-xs text-muted">{ROLE_NAME[role] ? t(ROLE_NAME[role]) : ""}</span></span>
              </span>
            )}
            <span className="shrink-0"><ThemeToggle initial={theme} /></span>
            <span className="shrink-0"><LangSwitch /></span>
            <span className={sideNav ? "hidden sm:block" : "block"}><LogoutButton label={t("Sign out")} /></span>
          </div>
        </header>
        <main id="main" tabIndex={-1} {...(content ? { "data-content": "", lang: "en" } : {})} className={`animate-fade-up mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-8 print:max-w-none print:p-0${report ? " has-report-bar" : ""}`}>
          {report && me && <ReportBar actor={me.actor} report={report.report} at={report.at} search={search} />}
          {children}
        </main>
      </div>
      {me && <FirstLoginTour role={role} open={needsTour(me.user, role)} />}
    </div>
  );
}
