import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { maybeRunDaily } from "@/server/insights/daily";
import { scanAlerts } from "@/server/insights/alerts";
import { runAfterResponse } from "@/server/lib/after-response";
import { teacherHomeData } from "@/server/teacher/home";
import { AddStudentButton, SkillFinder } from "@/components/teacher/home-widgets";
import { ShortcutRow } from "@/components/teacher/home-shortcuts";
import { AssignHostAll } from "./assign-host-all";
import { teacherHomeSummary, type TeacherHomeSummary } from "@/server/teacher/needs-attention";
import { canSeeNafsCached } from "@/server/teacher/nafs-access";
import { writingToGrade } from "@/server/writing/locked";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { StarGlyph } from "@/components/skills/skill-star";
import { noticeSeen, STARS_NOTICE } from "@/server/skills/notices";
import { dismissStarsNoticeAction } from "./stars-notice-actions";

export const metadata = { title: "Teacher Home" };

/** Needs attention rows shown before "Show all (N)". */
const FIRST_ROWS = 5;

/**
 * 🏠 Teacher Home (owner r67), top to bottom: a row of SMALL shortcuts to the most used tools (My classes, Assign,
 * Students' My Work, Reports, Early warning, MAP, Learn, NAFS for Grade 6 teachers, Assigned — one line, ‹ › when it
 * does not fit) → Needs attention (compact one-line rows: name · grade · reason · small button; 5 shown, "Show all (N)"
 * opens the rest in a scrolling box) → Find a skill and assign it → the numbers at a glance. Data:
 * src/server/teacher/needs-attention.ts and home.ts (own classes only, bounded); nothing waits for the background jobs.
 * Needs attention links: a stuck student → Create Plan (the skills filled in); no practice → the student's profile,
 * which opens on "No practice yet — assign a skill" with an Assign button; "+N more" → the profile's skills.
 */
export default async function TeacherHome({ searchParams }: { searchParams?: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const sp = (await searchParams) ?? {};
  // the daily learning job and the student-alert scan: AFTER the response (the page never waits for them),
  // at most once a day / every 3 hours — as on the admin home
  const schoolId = actor.schoolId;
  if (schoolId) runAfterResponse("teacher.daily", async () => {
    await maybeRunDaily(repo, schoolId).catch(() => false);
    await scanAlerts(repo, schoolId).catch(() => 0);
  });
  const me = (await getActor())!.user;
  // the NAFS shortcut: the same request-cached answer the menu uses (no extra read)
  const nafsP = canSeeNafsCached(repo, actor).catch(() => false);
  const [{ t }, h, sum, toGrade, seen] = await Promise.all([
    getT(),
    teacherHomeData(repo, actor, sp.classId ?? null).catch(() => teacherHomeData(repo, actor, null)),
    teacherHomeSummary(repo, actor).catch(() => ({ students: 0, workThisWeek: 0, needsAttention: 0, list: [] as TeacherHomeSummary["list"] })),
    writingToGrade(repo, actor).catch(() => 0),
    noticeSeen(repo, actor.userId, STARS_NOTICE),
  ]);
  const nafs = await nafsP;
  const k = h.klass;
  const gradeOf = new Map(h.classes.map((c) => [c.id, c.grade]));
  const shortcuts: { href: string; label: string; line: LineIconName }[] = [
    { href: "/teacher/students", label: "My classes", line: "users" },
    { href: "#find-skill", label: "Assign", line: "plus" },
    { href: "/teacher/progress", label: "Students' My Work", line: "work" },
    { href: "/teacher/reports", label: "Reports", line: "chart" },
    { href: "/teacher/reports/early-warning", label: "Early warning", line: "alert" },
    { href: "/teacher/map-center", label: "MAP", line: "target" },
    { href: "/teacher/learn", label: "Learn", line: "learn" },
    ...(nafs ? [{ href: "/teacher/nafs", label: "NAFS", line: "flag" as LineIconName }] : []),
    { href: "/teacher/assigned", label: "Assigned", line: "inbox" },
    { href: "/teacher/class-signin", label: "Class sign-in", line: "qr" },
  ];
  const cards: { label: string; value: number; line: LineIconName; alert?: boolean }[] = [
    { label: "My students", value: sum.students, line: "users" },
    { label: "Work sent this week", value: sum.workThisWeek, line: "send" },
    { label: "Needs attention", value: sum.needsAttention, line: "alert", alert: sum.needsAttention > 0 },
    { label: "Writing to grade", value: toGrade, line: "pen" },
  ];
  const small = "inline-flex h-7 shrink-0 items-center rounded-md bg-white px-2.5 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  return (
    <AppShell name={String(me.displayName)}>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{t("Hello, {name}", { name: String(me.displayName) })}</p>
          <h1 className="text-2xl text-ink">{t("Home")}{k && <span className="ms-2 text-sm font-normal text-muted"><bdi>{k.name}</bdi> · {t("Grade {n}", { n: k.grade })}</span>}</h1>
        </div>
        {k && <div className="w-full sm:w-44"><AddStudentButton classId={k.id} className={k.name} /></div>}
      </header>

      {/* the most used tools: small icon + label shortcuts, one line (‹ › when they do not fit) */}
      <ShortcutRow label={t("Shortcuts")} prev={t("Previous")} next={t("Next")}>
        {shortcuts.map((x) => (
          <Link key={x.href} prefetch={false} href={x.href} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line hover:ring-brand-teal">
            <span aria-hidden="true" className="text-muted"><LineIcon name={x.line} className="h-4 w-4" /></span>{t(x.label)}
          </Link>
        ))}
      </ShortcutRow>

      {!seen && (
        <section data-testid="stars-notice" aria-label={t("New: skill stars")} className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <span className="inline-flex items-center gap-1"><StarGlyph status="NOT_STARTED" /><StarGlyph status="IN_PROGRESS" /><StarGlyph status="MASTERED" /><StarGlyph status="NEXT_LEVEL" /><StarGlyph status="NEEDS_REVIEW" /></span>
          <p className="min-w-0 flex-1"><b>{t("New: skill stars")}</b> — {t("every skill now has ONE status for each student, the same on every page. A star needs 30+ questions with mastery; tests never change it.")}</p>
          <Link prefetch={false} href="/guide/skill-stars" className={small}>{t("Skill stars guide")}</Link>
          <form action={dismissStarsNoticeAction}><button className={small}>{t("Got it")}</button></form>
        </section>
      )}

      <section id="needs-attention" aria-labelledby="na-h" className="group/na mt-4 rounded-xl bg-surface shadow-card ring-1 ring-line">
        <h2 id="na-h" className="flex items-center gap-2 border-b border-line px-3 py-2 text-base font-semibold text-ink">
          <LineIcon name="alert" className="h-4 w-4 text-rose-600" />{t("Needs attention")}
          {sum.list.length > 0 && <span className="rounded-full bg-rose-50 px-1.5 text-xs font-semibold tabular-nums text-rose-700 ring-1 ring-rose-200" dir="ltr">{sum.list.length}</span>}
          <span className="ms-auto hidden text-xs font-normal text-muted sm:inline">{t("No practice for 7 days or more · stuck on a skill · ◐ no progress for 7 days · 50 questions without mastery · new 🔄.")}</span>
        </h2>
        {sum.list.length === 0 ? <p className="px-3 py-2 text-sm text-slate-600">{t("Everyone is on track.")}</p> : (
          // compact one-line rows (name · grade · reason · small button): the first 5; "Show all" opens the rest in a
          // box the teacher scrolls (mouse, touch or keyboard: the box takes focus)
          <div role="region" aria-label={t("Needs attention")} tabIndex={0} className="max-h-[15rem] overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
            <ul className="divide-y divide-slate-100">
              {sum.list.map((r, ix) => (
                <li key={r.studentId} className={`${ix >= FIRST_ROWS ? "hidden group-has-[:checked]/na:flex" : "flex"} items-center justify-between gap-2 px-3 py-1 text-[13px] leading-5`}>
                  <p className="min-w-0 flex-1 truncate">
                    <Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link>
                    <span className="ms-1.5 text-xs text-slate-500">{gradeOf.has(r.classId) ? t("Grade {n}", { n: gradeOf.get(r.classId)! }) : <bdi>{r.className}</bdi>}</span>
                    <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                    {r.stars && r.stars.length > 0 && <span data-testid="na-star" className="me-1.5 inline-flex items-center gap-1 text-slate-700"><StarGlyph status={r.stars[0].kind === "REVIEW" ? "NEEDS_REVIEW" : "IN_PROGRESS"} size={14} />{r.stars[0].kind === "REVIEW" ? t("Needs review: {skill}", { skill: r.stars[0].skill }) : r.stars[0].kind === "NO_MASTERY" ? t("50 questions without mastery: {skill}", { skill: r.stars[0].skill }) : t("No progress for {n} days: {skill}", { n: r.stars[0].days, skill: r.stars[0].skill })}{r.stars.length > 1 && <span className="ms-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t("+{n} more", { n: r.stars.length - 1 })}</span>}</span>}
                    {r.stuck.length > 0 && <span className="text-slate-600" title={r.stuck.map((x) => `${x.skill} (${x.questions}, ${x.score}%)`).join(" · ")}>{t("Stuck on")}: {r.stuck[0].skill} <span className="text-slate-400">({r.stuck[0].score}%)</span>{r.stuck.length > 1 && <Link prefetch={false} href={`/teacher/students/${r.studentId}#skills`} className="ms-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600 hover:underline">{t("+{n} more", { n: r.stuck.length - 1 })}</Link>}</span>}
                    {r.stuck.length === 0 && !r.stars?.length && <span className="text-slate-600">{r.neverPractised ? t("Has not practised yet") : t("No practice for {n} days", { n: r.idleDays ?? 0 })}</span>}
                  </p>
                  {r.stars?.[0]?.kind === "NO_MASTERY"
                    ? <Link prefetch={false} href={`/teacher/rti-plan?classId=${r.classId}&who=student&sid=${r.studentId}`} className={small}>{t("RTI plan")}</Link>
                    : r.stars?.length && r.stars[0].skillId
                    ? <Link prefetch={false} href={`/teacher/plans?${new URLSearchParams([["tab", "custom"], ["classId", r.classId], ["who", "student"], ["sid", r.studentId], ...r.stars.filter((x) => x.skillId).map((x) => ["add", x.skillId!] as [string, string])])}`} className={small}>{t("Create Plan")}</Link>
                    : r.stuck.length > 0
                    ? <Link prefetch={false} href={`/teacher/plans?${new URLSearchParams([["tab", "custom"], ["classId", r.classId], ["who", "student"], ["sid", r.studentId], ...r.stuck.map((x) => ["add", x.skillId] as [string, string])])}`} className={small}>{t("Create Plan")}</Link>
                    : <Link prefetch={false} href={`/teacher/students/${r.studentId}${r.neverPractised ? "#start" : ""}`} className={small}>{t("Open")}</Link>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {sum.list.length > FIRST_ROWS && <p className="border-t border-slate-100 px-3 py-1.5"><label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-teal has-[:focus-visible]:underline"><input type="checkbox" className="peer sr-only" data-na-toggle /> <span className="group-has-[:checked]/na:hidden">{t("Show all ({n})", { n: sum.list.length })}</span><span className="hidden group-has-[:checked]/na:inline">{t("Show fewer")}</span></label></p>}
      </section>

      {k && <div id="find-skill" className="mt-4 scroll-mt-20"><SkillFinder classGrade={k.grade} noCurriculum={h.noCurriculum ? h.noCurriculumMessage : null} canAssign={actor.role === "TEACHER"} /></div>}
      {k && <AssignHostAll classId={k.id} className={k.name} students={h.students} />}
      {!k && <div className="mt-4"><EmptyState icon="🏫" title="No students in this class yet" text="Ask the school admin to add your class." action={{ href: "/guide", label: "Help" }} /></div>}

      <section aria-label={t("At a glance")} className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${c.alert ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-surface-2 text-ink-2 ring-line"}`}><LineIcon name={c.line} className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span dir="ltr" className={`block font-display text-xl leading-none tabular-nums ${c.alert ? "text-rose-700" : "text-ink"}`}>{c.value}</span>
                <span className="block truncate text-xs font-medium text-ink-2">{t(c.label)}</span>
              </span>
            </>
          );
          // the numbers are not links to pages (the shortcuts and the menu have them); "Needs attention" jumps to its list
          return c.alert
            ? <a key={c.label} href="#needs-attention" className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2 shadow-card ring-1 ring-rose-200 hover:ring-rose-300">{body}</a>
            : <div key={c.label} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2 shadow-card ring-1 ring-line">{body}</div>;
        })}
      </section>
    </AppShell>
  );
}
