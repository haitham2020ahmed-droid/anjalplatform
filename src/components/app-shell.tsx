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
import { LiveSideNav, LiveSlot, ShellChrome, ShellLive } from "./shell/shell-live";
import { getTheme } from "@/server/ui/theme";
import { getActor, HOME_BY_ROLE, repo } from "@/server/auth/next";
import type { Role } from "@/server/auth/rbac";
import type { NavCount } from "@/server/teacher/week-plan";
import { shellData } from "@/server/ui/shell-data";
import { needsTour } from "@/server/ui/prefs";
import { getT } from "@/i18n/server";
import { isContentPath } from "@/i18n/content-routes";
import { canSeeNafsCached } from "@/server/teacher/nafs-access";
import { schemaGapsSeen } from "@/server/db/schema-errors";
import { matchReport } from "./teacher/report-catalog";
import { ReportBar } from "./teacher/report-bar";

const ROLE_NAME: Record<string, string> = { TEACHER: "Teacher", SCHOOL_ADMIN: "School admin", SUPER_ADMIN: "Platform admin", STUDENT: "Student", PARENT: "Parent" };

/**
 * ⚡ The sections whose layout (src/app/<section>/layout.tsx → <SectionFrame>) draws the frame once and keeps it while
 * the person moves between their pages; `BARE_PAGES` = their pages drawn without any frame. Every other page (practice,
 * quiz, notifications…) draws the whole frame itself through <AppShell>, as before.
 */
export const FRAMED_SECTIONS = ["/admin", "/teacher", "/student", "/parent"] as const;
export const BARE_PAGES = ["^/teacher/learn/[^/]+/print/?$", "^/student/writing/[^/]+/write/?$"];
export const isFramedPath = (path: string): boolean =>
  FRAMED_SECTIONS.some((p) => path === p || path.startsWith(`${p}/`)) && !BARE_PAGES.some((re) => new RegExp(re).test(path));

async function requestPath(): Promise<{ pathname: string; search: string }> {
  try { const h = await headers(); return { pathname: h.get("x-pathname") ?? "", search: h.get("x-search") ?? "" }; } catch { return { pathname: "", search: "" }; }
}

/**
 * Shared page frame (Literise D1). Top bar (sticky, white; night: the page colour): menu (phone) · the Al-Anjal school
 * logo · person · Day / Night · English | Arabic · sign out. Desktop: the role's short menu on a white rail (Literise
 * logo on top, line icons, the current page as a navy pill, "More" folded; numbers = waiting work); phone: the same
 * menu in a drawer. The interface language (menus, headings, buttons) follows the user's choice; page content is
 * never translated.
 *
 * Inside a framed section the section's layout already drew the frame: AppShell then draws only the page's own part
 * (report bar, content direction, the menu numbers / bell / coins of this page) — no second frame, nothing of the
 * frame sent again.
 */
export async function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const { pathname } = await requestPath();
  if (isFramedPath(pathname)) return <PageBody name={name} framed>{children}</PageBody>;
  return <ShellFrame name={name}><PageBody name={name}>{children}</PageBody></ShellFrame>;
}

/** The section layouts' frame: drawn once per section visit (signed out / password change pending: no frame, the page redirects). */
export async function SectionFrame({ children }: { children: React.ReactNode }) {
  const me = await getActor().catch(() => null);
  if (!me || me.user.mustChangePassword) return <>{children}</>;
  return <ShellFrame name={String(me.user.displayName)} section>{children}</ShellFrame>;
}

/**
 * The page's own part of the frame: the report bar (report pages), English content kept left-to-right in Arabic mode,
 * and — inside a framed section — this page's menu numbers, bell and coins chip for the kept frame (same short caches
 * as before, read side by side with the page's data: requireActor started them).
 */
async function PageBody({ name, framed = false, children }: { name: string; framed?: boolean; children: React.ReactNode }) {
  const me = await getActor();   // cached for the request: no extra query
  const [{ lang }, { pathname, search }] = await Promise.all([getT(), requestPath()]);
  // English learning content (passages, questions, feedback) keeps its own direction in Arabic mode
  const content = lang === "ar" && isContentPath(pathname);
  const role = String(me?.actor.role ?? "");
  const staff = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(role);
  // a report page (the Reports catalogue): the report bar on top — class switcher, student, date range, Download, Send
  const report = staff && me ? matchReport(pathname, search) : null;
  let live: React.ReactNode = null;
  if (framed && me) {
    const [counts] = await shellData(repo, me.actor);
    live = <ShellLive counts={counts ?? {}} bell={<Suspense fallback={<span className="inline-block h-8 w-8" aria-hidden="true" />}><NotificationBell /></Suspense>}
      chip={role === "STUDENT" && me.actor.studentId ? <Suspense fallback={<span className="inline-block h-10 w-20" aria-hidden="true" />}><RewardChip studentId={me.actor.studentId} name={name} /></Suspense> : undefined} />;
  }
  return (
    <div className={`animate-fade-up${report ? " has-report-bar" : ""}`} {...(content ? { "data-content": "", lang: "en" } : {})}>
      {report && me && <ReportBar actor={me.actor} report={report.report} at={report.at} search={search} />}
      {children}
      {live}
    </div>
  );
}

/** The frame itself (menu rail / drawer, top bar, main). `section` = drawn by a section layout and kept between pages. */
async function ShellFrame({ name, section = false, children }: { name: string; section?: boolean; children: React.ReactNode }) {
  const me = await getActor();   // cached for the request: no extra query
  const [{ t }, theme] = await Promise.all([getT(), getTheme()]);
  // the menu numbers and a student's menu flags are independent: read them at the same time (every page)
  // (started by requireActor, so it was read at the same time as the page's own data)
  const [countsR, flagsR] = me ? await shellData(repo, me.actor) : [null, null];
  const counts: Record<string, NavCount> = countsR ?? {};
  const role = String(me?.actor.role ?? "");
  // "/student/rti" in the counts = the student is in the RTI program (Tier 2/3): only then the RTI entry.
  // NAFS the same way: "/student/nafs" in the counts.
  // a teacher's NAFS flag = teaches a Grade 6 class (NAFS is for Grade 6 only)
  const admin = role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN";
  // admins: NAFS is found by name — only while its tables are in the database (an update not pushed: hidden)
  const flags = role === "TEACHER" || admin ? { nafs: me ? await canSeeNafsCached(repo, me.actor).catch(() => false) : false }
    : flagsR ?? { rti: "/student/rti" in counts, nafs: "/student/nafs" in counts };
  // 🧱 admins: a recent table/column is missing (the update's `npx prisma db push` did not run) → say so on every page
  const dbBehind = admin && (schemaGapsSeen().length > 0 || !flags.nafs);
  const base = navItemsFor(role, flags);
  const items = base.map((i) => ({ ...i, ...(counts[i.href] ?? {}) }));
  const staff = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(role);
  const calm = role === "TEACHER";
  const home = HOME_BY_ROLE[role as Role] ?? "/";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  // the bell and the coins chip: in a kept frame each page refreshes them (LiveSlot); else drawn here
  const slot = (k: "bell" | "chip", el: React.ReactNode) => (section ? <LiveSlot name={k}>{el}</LiveSlot> : el);
  const bell = (fallback: React.ReactNode) => slot("bell", <Suspense fallback={fallback}><NotificationBell /></Suspense>);
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
      {bell(null)}
      {role === "STUDENT" && <ComfortToggle />}
      {me && <FeedbackButton />}
      <LogoutButton label={t("Sign out")} />
    </div>
  );
  // the top bar keeps only the name, the language switch and Sign out (owner's spec): the rest lives in the side menu
  const extras = (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
      {bell(<span className="inline-block h-8 w-8" aria-hidden="true" />)}
      {staff && <PrintBox />}
      {role === "STUDENT" && <ComfortToggle />}
      {me && <FeedbackButton />}
    </div>
  );
  const finder = sideNav ? <JumpTo items={[...items, ...searchablePagesFor(role, flags).filter((p) => !items.some((i) => i.href === p.href))]} people={staff} /> : null;
  const navProps = { brand, footer: drawerFooter, tools: finder, extras, variant: (calm ? "calm" : "default") as "calm" | "default" };
  const top = (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-navy focus:px-4 focus:py-2 focus:font-semibold focus:text-white">{t("Skip to content")}</a>
      <Suspense fallback={null}><NavProgress /></Suspense>
      <Suspense fallback={null}><SubmitFeedback /></Suspense>
      {sideNav && (section ? <LiveSideNav items={base} counts={counts} {...navProps} /> : <SideNav items={items} brand={brand} footer={drawerFooter} tools={finder} extras={extras} variant={calm ? "calm" : "default"} />)}
    </>
  );
  const header = (
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
        {role === "STUDENT" && me?.actor.studentId ? slot("chip", (
          <Suspense fallback={<span className="inline-block h-10 w-20" aria-hidden="true" />}><RewardChip studentId={me.actor.studentId} name={name} /></Suspense>
        )) : (
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
  );
  const banner = dbBehind && (
    <p role="status" className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-950 ring-1 ring-amber-200 print:hidden">
      {t("The database needs an update: run npx prisma db push")} · <a href="/admin/system" className="font-semibold underline">{t("System check")}</a>
    </p>
  );
  return (
    <ShellChrome bare={section ? BARE_PAGES : []} rail={sideNav}
      className={`page-bg role-${role.toLowerCase() || "guest"} min-h-screen text-ink ${role === "STUDENT" ? "theme-calm" : calm ? "theme-calm" : "theme-playful"}`}
      top={top} header={header} banner={banner || null}
      mainClassName="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-8 print:max-w-none print:p-0"
      end={me && <FirstLoginTour role={role} open={needsTour(me.user, role)} />}>
      {children}
    </ShellChrome>
  );
}
