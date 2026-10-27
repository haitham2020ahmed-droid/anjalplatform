import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InfoTip, ReportHeader, ReportSummary } from "@/components/report-kit";
import { EmptyState } from "@/components/ui-kit";
import { SkillStar, StarLegend, StarLegendLine } from "@/components/skills/skill-star";
import { PrintButton } from "@/components/plans/print-button";
import { SourceBadges, SourceSelect } from "@/components/assign/source-select";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { cellDetail, classSkills, GRID_PLANS, gridOf, isGridPlan, isPractised, isStrand, type CellDetail, type ClassSkills, type GridPlan, type SkillsGrid, type TrendPoint } from "@/server/skills/skills-grid";
import { classReport, GROUP_LABEL, GROUP_ORDER, GROUP_RULE, sourceCards, type ClassReport, type SourceCard, type StudentGroup } from "@/server/skills/skills-report";
import { GUESS_RULE, GUESS_TIP, parseRange, rangePresets, TREND_ICON, TREND_RULE, TREND_WORD, type DateRange, type RangePreset, type Trend } from "@/server/skills/skills-trend";
import { defaultCycle, loadCycle } from "@/server/assessment-cycle/cycle";
import { skillPage, studentSkillsForTeacher, type SkillPage, type StudentSkillsView } from "@/server/skills/student-skills";
import { STRANDS, STRAND_LABEL, TAB_ICON, TAB_LABEL, type MySkillsTab } from "@/server/skills/my-skills";
import { safeIfBehind } from "@/server/db/schema-errors";
import { getT } from "@/i18n/server";
import { setStudentSkillGoalAction } from "../../stars-notice-actions";
import { ensureStarsMigration } from "@/server/skills/grid-fallback";
import { skillGoalOf, type SkillGoal } from "@/server/skills/status-extras";
import { closePlanAction, sendSkillsFamilyAction, skillActionAction } from "./actions";
import { agoOf, PLAN_RULE, planActions, planCards, planGrid, type PlanCard, type PlanGridView, type PlanStudentState } from "@/server/skills/skills-plans";
import { PLAN_TYPE_LABEL, type PlanType } from "@/server/skills/assigned-skills";
import { STAR_SYMBOL, TEACHER_WORD, teacherWordOf, type StarStatus } from "@/lib/skill-stars";
import { skillsClassSummary, skillsGridOneLine, skillsGridSummary, skillsPlanSummary, skillsPlansOneLine, skillsReportOneLine, skillsSourceOneLine, skillsSourceSummary, sourcePct } from "@/lib/report-summaries";
import type { Line } from "@/lib/report-summary";
import { ASSIGN_SOURCE_CLASS, ASSIGN_SOURCE_LABEL, isAssignSource, type AssignSource } from "@/lib/assign-source";
import { RichInline } from "@/components/rich-inline";

export const metadata = { title: "Student Skills" };

type SP = { classId?: string; plan?: string; weak?: string; student?: string; key?: string; strand?: string; page?: string; view?: string; skill?: string; tab?: string; src?: string; msg?: string; print?: string; from?: string; to?: string; /** r84: the opened plan (Plans tab) */ pid?: string };
type Tab = "grid" | "plans" | "source" | "report";
const day = (v: string | null) => (v ? v.slice(0, 10) : "—");
const tabBtn = (on: boolean) => `inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"}`;

/**
 * ⭐ Reports → Student Skills (owner r68 spec C; r74: ONLY the skills the teacher ASSIGNED, from every source):
 *   Skills grid (default): students × assigned skills with the star icons and a source badge under each skill name;
 *     filters class, Source (All sources · MAP · NAFS · Curriculum · Grammar · RTI), strand, "skills most of the class
 *     hasn't mastered"; "—" = not assigned to that student; a cell opens its detail; a column opens the Skill page; a
 *     name opens the Student view; paginated; Print (badges printed too).
 *   By source: one card per source (skills, questions answered, accuracy, stars, need support, weakest skill); a card
 *     opens the star grid of that source only.
 *   Class report: 4 numbers, one line (strongest / weakest skill, weakest source), 3 named groups, ≤ 5 action points
 *     with buttons, a simple table; Print fits one A4 page.
 *   Skill / Student: as before (the student view lists only the student's assigned skills, with their sources).
 * Every tab uses the Class filter. The class data is read ONCE (classSkills) and each tab is computed from it.
 * r84 (owner): Skills Grid · Plans · By source · Class report. PLANS no longer add Skills Grid columns: the Plans tab has
 *   one card per live plan (achievement, finished / need support / not started, last activity, Active / Finished, Close
 *   plan → the collapsed Finished plans) and a card opens that plan's own star grid with its summary and action plan. By
 *   source and the Class report count every assigned pair once, plans included (a line per source and per plan).
 * r75: every tab has "In one line" on top and its summary (+ action plan) at the end; the optional From – To (presets:
 *   This month · Last month · This term; empty = Whole year) applies to all three tabs; ⬆️ ➖ ⬇️ (stars against 2 weeks
 *   before) and ⚡ (answering too fast) sit next to each name in the grid and the Class report table.
 */
export default async function SkillsGridPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const tab: Tab = sp.tab === "source" ? "source" : sp.tab === "report" ? "report" : sp.tab === "plans" ? "plans" : "grid";
  const src: GridPlan = isAssignSource(sp.src) && isGridPlan(sp.src) ? sp.src : "ALL";
  const plan: GridPlan = tab === "source" ? src : isGridPlan(sp.plan) ? sp.plan : "ALL";
  const strand = isStrand(sp.strand) ? sp.strand : null;
  const view = sp.view === "skill" && sp.skill ? "skill" : sp.view === "student" && sp.student ? "student" : "grid";
  // r75: the optional From – To (empty = the whole year): only the assignments and answers inside it count, on every tab
  const range = parseRange(sp.from, sp.to);
  const now = new Date();
  const data = await safeIfBehind("skills-grid", () => classSkills(repo, actor, { classId: sp.classId ?? null, range }, now), null);
  const presets = rangePresets(now, actor.schoolId ? (await loadCycle(repo, actor.schoolId, now).catch(() => ({ cycle: defaultCycle(now) }))).cycle : defaultCycle(now));
  // r84: the Skills Grid shows the column pairs only; By source's star grid shows every pair of the source (plans too)
  const g = data ? gridOf(data, { plan, weakOnly: sp.weak === "1", strand, page: Number(sp.page) || 1, all: tab === "source" }) : null;
  const base = { classId: g?.classId ?? "", ...(tab !== "grid" ? { tab } : {}), ...(tab === "source" && src !== "ALL" ? { src } : {}), ...(tab === "grid" && plan !== "ALL" ? { plan } : {}), ...(sp.weak === "1" ? { weak: "1" } : {}), ...(strand ? { strand } : {}), ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) };
  const href = (o: Partial<SP>) => `/teacher/reports/skills-grid?${new URLSearchParams(Object.entries({ ...base, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const tabHref = (x: Tab) => `/teacher/reports/skills-grid?${new URLSearchParams(Object.entries({ classId: g?.classId ?? "", ...(x !== "grid" ? { tab: x } : {}), from: range.from ?? "", to: range.to ?? "" }).filter(([, v]) => v) as [string, string][])}`;
  let skill: SkillPage | null = null, student: StudentSkillsView | null = null, detail: CellDetail | null = null;
  const forbidden = (e: unknown) => { if (!(e instanceof ForbiddenError || e instanceof ValidationError)) throw e; return null; };
  if (g?.classId && view === "skill") skill = await skillPage(repo, actor, g.classId, sp.skill!).catch(forbidden);
  if (view === "student") student = await studentSkillsForTeacher(repo, actor, sp.student!).catch(forbidden);
  // r70: the weekly goal lives on the student's page (not as a grid column)
  const goal: SkillGoal | null = student ? await skillGoalOf(repo, student.studentId).catch(() => null) : null;
  // r70: the one-time star migration was OFF on the live server — make sure it is queued (once per process per school)
  if (g && g.migrated === false && actor.schoolId) void ensureStarsMigration(repo, actor.schoolId);
  if (g && view === "grid" && sp.student && sp.key) detail = await cellDetail(repo, actor, sp.student, sp.key).catch(forbidden);
  const tabs = (
    <nav aria-label={t("Student Skills")} className="mb-3 flex flex-wrap gap-2 print:hidden" data-testid="student-skills-tabs">
      <Link prefetch={false} href={tabHref("grid")} aria-current={view === "grid" && tab === "grid" ? "page" : undefined} className={tabBtn(view === "grid" && tab === "grid")}>▦ {t("Skills Grid")}</Link>
      <Link prefetch={false} href={tabHref("plans")} aria-current={view === "grid" && tab === "plans" ? "page" : undefined} className={tabBtn(view === "grid" && tab === "plans")} data-testid="tab-plans">🗂️ {t("Plans")}</Link>
      <Link prefetch={false} href={tabHref("source")} aria-current={view === "grid" && tab === "source" ? "page" : undefined} className={tabBtn(view === "grid" && tab === "source")} data-testid="tab-source">🏷️ {t("By source")}</Link>
      <Link prefetch={false} href={tabHref("report")} aria-current={view === "grid" && tab === "report" ? "page" : undefined} className={tabBtn(view === "grid" && tab === "report")} data-testid="tab-report">📋 {t("Class report")}</Link>
      {skill && <span aria-current="page" className={tabBtn(true)}>⭐ {skill.name}</span>}
      {student && <span aria-current="page" className={tabBtn(true)}>👤 <bdi>{student.name}</bdi></span>}
    </nav>
  );
  const classFilter = g && view === "grid" && tab !== "grid" && (
    <form method="get" action="/teacher/reports/skills-grid" className="mb-3 flex flex-wrap items-end gap-2 text-sm print:hidden" data-testid="class-filter">
      <input type="hidden" name="tab" value={tab} />
      {tab === "source" && src !== "ALL" && <input type="hidden" name="src" value={src} />}
      {tab === "plans" && sp.pid && <input type="hidden" name="pid" value={sp.pid} />}
      <DateInputs range={range} t={t} />
      <label className="flex flex-col font-semibold text-slate-700">{t("Class")}
        <select name="classId" defaultValue={g.classId ?? ""} className="h-10 rounded-lg border border-slate-300 px-2 font-normal">{g.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button className="h-10 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
      {(tab === "report" || (tab === "plans" && sp.pid)) && <span className="ms-auto"><PrintButton label={t("Print (one page)")} /></span>}
    </form>
  );
  const dates = g && view === "grid" && <DatePresets range={range} presets={presets} t={t} href={(r) => href({ from: r.from ?? undefined, to: r.to ?? undefined, page: undefined, student: undefined, key: undefined })} />;
  const subtitle = tab === "plans" ? "Each plan you sent, on its own card: how far the class got and who needs you." : tab === "source" ? "Each source on its own: the skills you assigned from it and how the class is doing." : tab === "report" ? "The whole class on one page: every skill you assigned, from every source." : "Only the skills you assigned, grouped by strand: one star and its level in each cell, the source under each skill.";
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} title="Student Skills" who={g?.className ? <bdi>{g.className}</bdi> : undefined} subtitle={subtitle} />
      {tabs}
      {sp.msg && <p role="status" className="mb-3 rounded-xl bg-teal-50 px-4 py-2 text-sm text-teal-900 ring-1 ring-teal-200 print:hidden">{t(sp.msg)}</p>}
      {classFilter}
      {dates}
      {!g || !data ? <EmptyState icon="🛠️" title="The database needs an update" text="Run npx prisma db push, then open this page again." />
        : view === "skill" && skill ? <SkillView p={skill} t={t} back={href({})} />
        : view === "student" && student ? <StudentView v={student} goal={goal} teacher={actor.role === "TEACHER"} t={t} canSend={actor.role !== "PARENT"} />
        : tab === "source" ? <BySourceView d={data} g={g} src={src} t={t} href={href} detail={detail} />
        : tab === "report" ? <ReportView d={data} t={t} href={href} />
        : tab === "plans" ? <PlansView d={data} t={t} href={href} pid={sp.pid ?? null} now={now} range={range} />
        : <GridView g={g} t={t} href={href} plan={plan} strand={strand} detail={detail} filters range={range} />}
    </AppShell>
  );
}

type T = (s: string, v?: Record<string, string | number>) => string;
/** r82: a NAFS practice column opens the NAFS center's reports (per student and standard), not the skill page */
const nafsHref = (key: string): string | null => (key.startsWith("nafs:") ? "/teacher/nafs?tab=reports" : null);

/** r75 "In one line": one plain sentence at the top of each tab */
function OneLine({ l, t }: { l: Line | null; t: T }) {
  if (!l) return null;
  return <p className="mb-3 flex items-start gap-2 rounded-2xl bg-sky-50 px-4 py-2.5 text-[15px] leading-relaxed text-sky-950 ring-1 ring-sky-200" data-testid="one-line"><span aria-hidden="true">💡</span><span><b className="font-semibold">{t("In one line")}:</b> {t(l.key, l.vars)}</span></p>;
}
/** r75: the From – To inputs (inside each tab's filter form) */
function DateInputs({ range, t }: { range: DateRange; t: T }) {
  return (
    <>
      <label className="flex flex-col font-semibold text-slate-700">{t("From")}<input type="date" name="from" defaultValue={range.from ?? ""} className="h-10 rounded-lg border border-slate-300 px-2 font-normal" data-testid="date-from" /></label>
      <label className="flex flex-col font-semibold text-slate-700">{t("To")}<input type="date" name="to" defaultValue={range.to ?? ""} className="h-10 rounded-lg border border-slate-300 px-2 font-normal" data-testid="date-to" /></label>
    </>
  );
}
/** r75: the date presets — Whole year · This month · Last month · This term (links that keep the other filters) */
function DatePresets({ range, presets, t, href }: { range: DateRange; presets: RangePreset[]; t: T; href: (r: DateRange) => string }) {
  const chip = (on: boolean) => `inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  const whole = !range.from && !range.to;
  return (
    <nav aria-label={t("Dates")} className="mb-3 flex flex-wrap items-center gap-1.5 text-sm print:hidden" data-testid="date-presets">
      <span className="me-1 font-semibold text-slate-700">📅 {t("Dates")}:</span>
      <Link prefetch={false} href={href({ from: null, to: null })} aria-current={whole ? "true" : undefined} className={chip(whole)} data-preset="year">{t("Whole year")}</Link>
      {presets.map((p) => { const on = range.from === p.from && range.to === p.to; return <Link key={p.key} prefetch={false} href={href({ from: p.from, to: p.to })} aria-current={on ? "true" : undefined} className={chip(on)} data-preset={p.key}>{t(p.label)}</Link>; })}
      {!whole && <span className="ms-1 text-xs text-slate-600" dir="ltr" data-testid="date-shown">{range.from ?? "…"} – {range.to ?? "…"}</span>}
      <InfoTip text="Only the skills assigned and the answers given between these dates count. Empty = the whole year." />
    </nav>
  );
}
/** r75: ⬆️ ➖ ⬇️ next to a student's name (the word in the tooltip) and ⚡ when answering too fast.
 * r94 (audit): the tooltip also carries a short history ("45% → 60% → 75%", 14d ago → 7d ago → now) instead of
 * only the two-point UP/SAME/DOWN badge, for a teacher who wants more than the arrow. */
function StudentMarks({ trend, guessing, trendPoints, t }: { trend?: Trend | null; guessing?: boolean; trendPoints?: TrendPoint[] | null; t: T }) {
  const history = trendPoints?.length ? trendPoints.map((p) => `${p.pct}%`).join(" → ") : null;
  const trendTitle = trend ? (history ? `${t(TREND_WORD[trend])} (${history})` : t(TREND_WORD[trend])) : "";
  return (
    <>
      {trend ? <span className="ms-1 text-xs" title={trendTitle} aria-label={trendTitle} data-testid="trend" data-trend={trend} data-trend-history={history ?? undefined}>{TREND_ICON[trend]}</span> : null}
      {guessing ? <span className="ms-1 text-xs" title={t(GUESS_TIP)} aria-label={t(GUESS_TIP)} data-testid="guessing">⚡</span> : null}
    </>
  );
}
/** the colour of the level word next to a star (the same colours as the icons) */
const LEVEL_TONE: Record<StarStatus | "SUPPORT", string> = { NOT_STARTED: "text-slate-500", IN_PROGRESS: "text-blue-700", MASTERED: "text-amber-800", NEXT_LEVEL: "text-amber-700", NEEDS_REVIEW: "text-orange-700", SUPPORT: "text-rose-700" };

function GridView({ g, t, href, plan, strand, detail, filters, range }: { g: SkillsGrid; t: T; href: (o: Partial<SP>) => string; plan: string; strand: string | null; detail: CellDetail | null; filters: boolean; range?: DateRange }) {
  // r70 audit: the tiles count the WHOLE class (as the column counts do), not only the students on this page
  const sum = (f: (k: SkillsGrid["skills"][number]) => number) => g.skills.reduce((a, k) => a + f(k), 0);
  const tiles = [
    { label: "Skills assigned", value: g.skills.length },
    { label: "Stars won", value: sum((k) => k.mastered) },
    { label: "Need support", value: sum((k) => k.support ?? 0) },
    { label: "Not started", value: sum((k) => k.notStarted ?? 0) },
  ];
  const edge = (i: number, k: SkillsGrid["skills"][number]) => i === 0 || g.skills[i - 1].strand !== k.strand;
  return (
    <>
      {filters && <OneLine l={skillsGridOneLine({ won: g.starsWon ?? 0, stars: g.starsAll ?? 0, up: g.trendCounts?.up ?? 0, fast: g.guessingCount ?? 0 })} t={t} />}
      <StarLegend t={t} className="mb-3" />
      {filters && (
        <form method="get" action="/teacher/reports/skills-grid" className="mb-3 flex flex-wrap items-end gap-2 text-sm print:hidden" data-testid="grid-filters">
          <label className="flex flex-col font-semibold text-slate-700">{t("Class")}
            <select name="classId" defaultValue={g.classId ?? ""} className="h-10 rounded-lg border border-slate-300 px-2 font-normal">{g.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="flex flex-col font-semibold text-slate-700">{t("Source")}
            <select name="plan" defaultValue={plan} className="h-10 rounded-lg border border-slate-300 px-2 font-normal" data-testid="source-filter">{GRID_PLANS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}</select></label>
          <label className="flex flex-col font-semibold text-slate-700">{t("Strand")}
            <select name="strand" defaultValue={strand ?? ""} className="h-10 rounded-lg border border-slate-300 px-2 font-normal"><option value="">{t("All strands")}</option>{STRANDS.map((x) => <option key={x} value={x}>{t(STRAND_LABEL[x])}</option>)}</select></label>
          {range && <DateInputs range={range} t={t} />}
          <label className="inline-flex h-10 items-center gap-2 font-semibold text-slate-700"><input type="checkbox" name="weak" value="1" defaultChecked={g.weakOnly} className="h-4 w-4" />{t("Skills most of the class hasn't mastered")}</label>
          <button className="h-10 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
          <span className="ms-auto"><PrintButton label={t("Print the class grid")} /></span>
        </form>
      )}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((x) => <p key={x.label} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200"><span className="block text-xl font-bold tabular-nums text-brand-navy" dir="ltr">{x.value}</span><span className="text-xs text-slate-600">{t(x.label)}</span></p>)}
      </div>
      {g.migrated === false && <p role="status" data-testid="stars-fallback" className="mb-3 rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900 ring-1 ring-sky-200 print:hidden">{t("The stars of earlier practice are being computed in the background. Until that finishes, this grid counts the practice answers directly.")}</p>}
      {detail && <Detail d={detail} t={t} close={href({ page: String(g.page ?? 1) })} />}
      {!g.students.length || !g.skills.length ? (
        <EmptyState icon="⭐" title="No assigned skills yet"
          text={plan === "ALL" && !strand && !g.weakOnly ? "Only the skills you assign appear here (from MAP, NAFS, Curriculum, Grammar or Support). Assign a skill, then come back." : "No assigned skill fits this filter. Choose All sources to see every assigned skill."} />
      ) : (
        <>
          <p className="mb-1 text-xs text-slate-500 print:hidden">{t("Click a cell for its detail, a skill for its page. — = not assigned.")}</p>
          <div className="max-h-[75vh] overflow-auto rounded-xl bg-white ring-1 ring-slate-200 print:max-h-none print:overflow-visible print:ring-0" data-testid="skills-grid">
            <table className="border-separate border-spacing-0 text-sm print:text-[9px]">
              <thead className="sticky top-0 z-20 bg-white">
                <tr data-testid="grid-groups">
                  <th rowSpan={2} className="sticky start-0 z-30 min-w-[9rem] border-b border-e border-slate-200 bg-white px-3 py-2 text-start align-bottom"><span className="inline-flex items-center gap-1">{t("Student")} <InfoTip text={TREND_RULE} /> <InfoTip text={GUESS_RULE} /></span></th>
                  {(g.groups ?? []).map((gr) => (
                    <th key={gr.strand} colSpan={gr.count} scope="colgroup" data-strand={gr.strand} className="whitespace-nowrap border-b border-s border-slate-200 bg-slate-50 px-2 py-1 text-start text-xs font-semibold text-slate-700">
                      {t(gr.label)} <span className="font-normal text-slate-500" dir="ltr">({gr.count})</span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {g.skills.map((k, i) => (
                    // r74: the header never cuts the name (it wraps, up to 3 lines; the full name in the ⓘ and the title)
                    <th key={k.key} scope="col" data-skill={k.key} title={k.name} className={`min-w-[6.5rem] max-w-[8.5rem] border-b border-slate-200 bg-white px-1.5 py-1.5 text-center align-bottom text-xs font-semibold ${edge(i, k) ? "border-s" : ""}`}>
                      <span className="flex flex-col items-center gap-1">
                        <span className="inline-flex items-start gap-0.5">
                          <Link prefetch={false} href={nafsHref(k.key) ?? href({ view: "skill", skill: k.key })} className="line-clamp-3 whitespace-normal break-words text-brand-navy hover:underline" data-content lang="en" data-testid="grid-col-label">
                            {k.code ? <b dir="ltr">{k.code} </b> : null}<span className="font-normal">{k.short || k.name}</span>
                          </Link>
                          <InfoTip text={k.name} />
                        </span>
                        <SourceBadges sources={k.sources ?? []} t={t} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.students.map((st) => (
                  <tr key={st.id} data-testid="grid-row">
                    <th scope="row" className="sticky start-0 z-10 border-b border-e border-slate-100 bg-white px-3 py-1.5 text-start font-semibold">
                      <Link prefetch={false} href={href({ view: "student", student: st.id })} className="text-brand-navy hover:underline"><bdi>{st.name}</bdi></Link>
                      <StudentMarks trend={st.trend} guessing={st.guessing} trendPoints={st.trendPoints} t={t} />
                      <span className="block text-[11px] font-normal text-slate-500" data-testid="grid-row-count">{t("{m} of {n} mastered", { n: st.assigned ?? 0, m: st.mastered ?? 0 })}</span>
                    </th>
                    {g.skills.map((k, i) => {
                      const v = g.cells[st.id][k.key];
                      const mine = Boolean(g.assigned?.[st.id]?.[k.key]);
                      const done = mine && isPractised(v);
                      return (
                        <td key={k.key} className={`border-b border-slate-100 px-1 py-1 text-center ${edge(i, k) ? "border-s border-s-slate-200" : ""}`} data-status={mine ? v.status : "NOT_ASSIGNED"}>
                          {mine ? (
                            <Link prefetch={false} href={href({ student: st.id, key: k.key, page: String(g.page ?? 1) })} className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-teal ${done ? "" : "opacity-50"}`} aria-label={`${st.name} · ${k.name}`}>
                              <SkillStar info={v} t={t} label={`${st.name} · ${k.name}`} size={14} inLink />
                              {done && <span className={`whitespace-nowrap text-[11px] font-medium ${LEVEL_TONE[v.needsSupport ? "SUPPORT" : v.status]}`} data-testid="cell-level">{t(teacherWordOf(v))}</span>}
                            </Link>
                          ) : <span className="text-slate-300" title={t("Not assigned to this student")} aria-label={t("Not assigned to this student")}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr data-testid="grid-foot">
                  <th scope="row" className="sticky start-0 z-10 border-e border-slate-200 bg-slate-50 px-3 py-1.5 text-start text-xs font-semibold text-slate-700">{t("% of students mastered")}</th>
                  {g.skills.map((k, i) => (
                    <td key={k.key} data-testid="grid-col-count" title={t("{n} of {total} mastered", { n: k.mastered, total: k.total })} className={`bg-slate-50 px-1 py-1.5 text-center text-xs font-semibold text-amber-800 ${edge(i, k) ? "border-s border-slate-200" : ""}`}>
                      <span dir="ltr">{k.pct ?? 0}%</span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      {(g.pages ?? 1) > 1 && (
        <nav aria-label={t("Pages")} className="mt-3 flex flex-wrap items-center gap-2 text-sm print:hidden" data-testid="grid-pages">
          {Array.from({ length: g.pages ?? 1 }, (_, i) => i + 1).map((n) => <Link key={n} prefetch={false} href={href({ page: String(n) })} aria-current={n === g.page ? "page" : undefined} className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 font-semibold ${n === g.page ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`}>{n}</Link>)}
          <span className="text-slate-500">{t("{n} students", { n: g.totalStudents ?? g.students.length })}</span>
        </nav>
      )}
      <div className="mt-3 hidden print:block"><StarLegendLine t={t} /></div>
      {g.classId && <ReportSummary summary={skillsGridSummary({ totalStudents: g.totalStudents ?? g.students.length, practising: g.practisingStudents ?? 0, skills: g.skills, trend: g.trendCounts, guessing: g.guessingCount }, { classId: g.classId, skillHref: (key) => nafsHref(key) ?? href({ view: "skill", skill: key }) })} />}
    </>
  );
}

// ------------------------------------------------------------------ 🏷️ By source

const STAR_PARTS: StarStatus[] = ["MASTERED", "NEXT_LEVEL", "IN_PROGRESS", "NEEDS_REVIEW", "NOT_STARTED"];

function BySourceView({ d, g, src, t, href, detail }: { d: ClassSkills; g: SkillsGrid; src: GridPlan; t: T; href: (o: Partial<SP>) => string; detail: CellDetail | null }) {
  const cards = sourceCards(d);
  if (!cards.length) return <EmptyState icon="🏷️" title="No assigned skills yet" text="Only the skills you assign appear here (from MAP, NAFS, Curriculum, Grammar or Support). Assign a skill, then come back." />;
  return (
    <section data-testid="by-source" className="space-y-4">
      <OneLine l={skillsSourceOneLine(cards)} t={t} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => <li key={c.source}><SourceCardView c={c} t={t} on={src === c.source} href={href({ tab: "source", src: c.source, page: undefined, student: undefined, key: undefined })} /></li>)}
      </ul>
      {src !== "ALL" ? (
        <div data-testid="source-grid">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-brand-navy">{t("Star grid")} · <SourceBadges sources={[src as AssignSource]} t={t} /></h2>
          <GridView g={g} t={t} href={href} plan={src} strand={null} detail={detail} filters={false} />
        </div>
      ) : <p className="text-sm text-slate-500">{t("Click a card to see the star grid of that source only.")}</p>}
      {d.classId && <ReportSummary summary={skillsSourceSummary(cards, { classId: d.classId, sourceHref: (x) => href({ tab: "source", src: x, page: undefined, student: undefined, key: undefined }), skillHref: (key) => nafsHref(key) ?? href({ tab: undefined, src: undefined, view: "skill", skill: key }) })} />}
    </section>
  );
}

function SourceCardView({ c, t, on, href }: { c: SourceCard; t: T; on: boolean; href: string }) {
  const n = STAR_PARTS.reduce((a, k) => a + c.stars[k], 0) || 1;
  return (
    <Link prefetch={false} href={href} aria-current={on ? "true" : undefined} data-testid="source-card" data-source={c.source}
      className={`block rounded-2xl bg-white p-4 ring-1 transition hover:ring-brand-teal ${on ? "ring-2 ring-brand-navy" : "ring-slate-200"}`}>
      <span className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-3 py-0.5 text-sm font-bold ring-1 ${ASSIGN_SOURCE_CLASS[c.source]}`}>{t(ASSIGN_SOURCE_LABEL[c.source])}</span>
        <span className="text-xs text-slate-500">{t("Open the star grid")} →</span>
      </span>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div><dt className="text-[11px] text-slate-500">{t("Skills")}</dt><dd className="text-xl font-bold tabular-nums text-brand-navy" dir="ltr" data-testid="card-skills">{c.skills}</dd></div>
        <div><dt className="text-[11px] text-slate-500">{t("Answers")}</dt><dd className="text-xl font-bold tabular-nums text-brand-navy" dir="ltr" data-testid="card-answered">{c.answered}</dd></div>
        <div><dt className="text-[11px] text-slate-500">{t("Accuracy")}</dt><dd className="text-xl font-bold tabular-nums text-brand-navy" dir="ltr" data-testid="card-accuracy">{c.accuracy === null ? "—" : `${c.accuracy}%`}</dd></div>
      </dl>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true" title={STAR_PARTS.filter((k) => c.stars[k]).map((k) => `${STAR_SYMBOL[k]} ${c.stars[k]}`).join(" · ")}>
        {STAR_PARTS.map((k) => c.stars[k] ? <span key={k} style={{ width: `${(100 * c.stars[k]) / n}%` }} className={k === "MASTERED" || k === "NEXT_LEVEL" ? "bg-amber-400" : k === "IN_PROGRESS" ? "bg-blue-400" : k === "NEEDS_REVIEW" ? "bg-orange-400" : "bg-slate-300"} /> : null)}
      </div>
      <p className="mt-1 text-xs text-slate-600" data-testid="card-stars">⭐ {t("{pct}% of stars won", { pct: sourcePct(c) })}</p>
      <p className="mt-2 text-sm text-slate-700"><span className="font-semibold text-rose-700" data-testid="card-support">{c.needSupport}</span> {t("need support")}</p>
      {c.weakest && <p className="mt-1 truncate text-sm text-slate-700" data-testid="card-weakest">{t("Weakest skill")}: <b data-content lang="en">{c.weakest.name}</b> <span dir="ltr">({c.weakest.pct}%)</span></p>}
    </Link>
  );
}

// ------------------------------------------------------------------ 📋 Class report

const GROUP_STYLE: Record<StudentGroup, { box: string; dot: string; icon: string }> = {
  SUPPORT: { box: "bg-rose-50 ring-rose-200", dot: "bg-rose-500", icon: "🛟" },
  ON_TRACK: { box: "bg-sky-50 ring-sky-200", dot: "bg-sky-500", icon: "✓" },
  NEXT_LEVEL: { box: "bg-emerald-50 ring-emerald-200", dot: "bg-emerald-500", icon: "🚀" },
};

function ReportView({ d, t, href }: { d: ClassSkills; t: T; href: (o: Partial<SP>) => string }) {
  const cid = d.classId ?? "";
  const r: ClassReport = classReport(d, {
    skill: (key) => nafsHref(key) ?? href({ tab: undefined, src: undefined, view: "skill", skill: key }),
    plan: (ids) => `/teacher/plans?${new URLSearchParams([["tab", "new"], ["classId", cid], ["who", ids.length === 1 ? "student" : "group"], ...ids.map((id) => ["sid", id] as [string, string])])}`,
    student: (id) => href({ tab: undefined, src: undefined, view: "student", student: id }),
    source: (s) => href({ tab: "source", src: s }),
    assigned: `/teacher/assigned?${new URLSearchParams({ classId: cid })}`,
  });
  if (!r.skillsAssigned) return <EmptyState icon="📋" title="No assigned skills yet" text="Only the skills you assign appear here (from MAP, NAFS, Curriculum, Grammar or Support). Assign a skill, then come back." />;
  const nums = [
    { key: "mastery", label: "Class mastery", value: r.masteryPct !== null ? `${r.masteryPct}%` : "—", tip: "Mastered stars (⭐ or ☆⬆) of every skill assigned to every student." },
    { key: "skills", label: "Skills assigned", value: String(r.skillsAssigned), tip: "Skills you assigned to this class, from every source and every plan (each skill counted once)." },
    { key: "track", label: "Students on track", value: String(r.onTrack), tip: "On track + Ready for next level." },
    { key: "support", label: "Students needing support", value: String(r.needSupport), tip: GROUP_RULE },
  ];
  return (
    <section data-testid="class-report" className="space-y-4 print:space-y-2 print:text-[10px]">
      <style>{"@media print { @page { size: A4; margin: 10mm } }"}</style>
      <OneLine l={skillsReportOneLine({ on: r.onTrack, total: r.withWork, help: r.needSupport, gained: r.trend.gained })} t={t} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="report-numbers">
        {nums.map((x) => (
          <div key={x.key} data-num={x.key} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200 print:rounded-lg print:px-2 print:py-1">
            <span className="block text-3xl font-bold tabular-nums text-brand-navy print:text-lg" dir="ltr">{x.value}</span>
            <span className="flex items-center gap-1 text-xs text-slate-600">{t(x.label)} <InfoTip text={x.tip} /></span>
          </div>
        ))}
      </div>
      <p className="rounded-xl bg-white px-4 py-2 text-sm text-slate-800 ring-1 ring-slate-200 print:px-2 print:py-1" data-testid="report-line">
        {r.strongest && <span>💪 {t("Strongest skill")}: <b data-content lang="en">{r.strongest.name}</b> <span dir="ltr">({r.strongest.pct}%)</span></span>}
        {r.weakest && <span>{r.strongest ? " · " : ""}🎯 {t("Weakest skill")}: <b data-content lang="en">{r.weakest.name}</b> <span dir="ltr">({r.weakest.pct}%)</span></span>}
        {r.weakestSource && <span> · 🏷️ {t("Weakest source")}: <b>{t(r.weakestSource.label)}</b> <span dir="ltr">({r.weakestSource.pct}%)</span></span>}
      </p>
      {/* r84: one line per source and one per plan (every assigned skill counted once) */}
      {r.bySource.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-4 py-2 text-sm text-slate-800 ring-1 ring-slate-200 print:px-2 print:py-1" data-testid="report-sources">
          <span className="inline-flex items-center gap-1 font-semibold text-brand-navy">🏷️ {t("By source")} <InfoTip text="Stars won out of every skill assigned from this source (a skill in a plan counts with its plan's source)." /></span>
          {r.bySource.map((x) => <span key={x.source} data-source={x.source} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${ASSIGN_SOURCE_CLASS[x.source]}`}>{t(x.label)} <span dir="ltr">{x.pct}%</span></span>)}
        </p>
      )}
      {r.plans.length > 0 && (
        <div className="rounded-xl bg-white px-4 py-2 text-sm text-slate-800 ring-1 ring-slate-200 print:px-2 print:py-1" data-testid="report-plans">
          <span className="inline-flex items-center gap-1 font-semibold text-brand-navy">🗂️ {t("Plans")} <InfoTip text={PLAN_RULE} /></span>
          <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {r.plans.map((x) => (
              <li key={x.id} data-plan={x.id} className="flex items-center gap-2">
                <PlanBadge type={x.type} t={t} />
                <Link prefetch={false} href={href({ tab: "plans", pid: x.id })} className="min-w-0 flex-1 truncate text-brand-navy hover:underline" data-content lang="en">{x.title}</Link>
                <b className="tabular-nums" dir="ltr" data-testid="report-plan-pct">{x.pct}%</b>
                {x.finished ? <span className="text-xs text-emerald-700">{t("Finished")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* r75: the last 2 weeks (⬆️ ➖ ⬇️) and the students answering too fast (⚡) */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white px-4 py-2 text-sm text-slate-800 ring-1 ring-slate-200 print:px-2 print:py-1" data-testid="report-trend">
        <span>📈 {t("The class gained {n} stars in the last 2 weeks · {x} students improved · {y} not moving", { n: r.trend.gained, x: r.trend.improved, y: r.trend.stalled.length })}</span>
        <InfoTip text={TREND_RULE} />
        <span className={r.guessing.length ? "font-semibold text-amber-800" : "text-slate-600"} data-testid="report-guessing">· ⚡ {t("Answering too fast: {n}", { n: r.guessing.length })}</span>
        <InfoTip text={GUESS_RULE} />
        <span className="text-slate-600">· {t("Not started yet: {n} students", { n: r.notStarted })}</span>
      </p>
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-brand-navy">{t("Students in 3 groups")} <InfoTip text={GROUP_RULE} /></h2>
        <div className="grid gap-2 sm:grid-cols-3" data-testid="report-groups">
          {GROUP_ORDER.map((k) => (
            <section key={k} data-group={k} className={`rounded-2xl p-3 ring-1 print:rounded-lg print:p-1.5 ${GROUP_STYLE[k].box}`}>
              <h3 className="mb-1 text-sm font-semibold text-slate-800"><span aria-hidden="true">{GROUP_STYLE[k].icon}</span> {t(GROUP_LABEL[k])} <span className="rounded-full bg-white px-1.5 text-xs" dir="ltr">{r.groups[k].length}</span></h3>
              {r.groups[k].length ? <p className="text-sm leading-relaxed text-slate-800">{r.groups[k].map((x, i) => <span key={x.id}>{i ? ", " : ""}<bdi>{x.name}</bdi>{x.notStarted ? <span className="text-xs text-slate-500"> ({t("not started")})</span> : null}</span>)}</p> : <p className="text-xs text-slate-500">—</p>}
            </section>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 print:overflow-visible">
        <table className="w-full text-sm print:text-[9px]" data-testid="report-table">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr><th className="px-3 py-1.5 text-start"><span className="inline-flex items-center gap-1">{t("Student")} <InfoTip text={TREND_RULE} /></span></th><th className="px-3 py-1.5 text-start">{t("Skills mastered")}</th><th className="px-3 py-1.5 text-start">{t("Accuracy")}</th><th className="px-3 py-1.5 text-start">{t("Status")}</th></tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.id} data-testid="report-row" data-group={x.group} className="border-t border-slate-100">
                <td className="px-3 py-1 print:py-0"><bdi>{x.name}</bdi><StudentMarks trend={x.trend} guessing={x.guessing} t={t} /></td>
                <td className="px-3 py-1 tabular-nums print:py-0">{t("{x} of {y}", { x: x.mastered, y: x.of })}</td>
                <td className="px-3 py-1 tabular-nums print:py-0" dir="ltr">{x.accuracy === null ? "—" : `${x.accuracy}%`}</td>
                <td className="px-3 py-1 print:py-0"><span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${GROUP_STYLE[x.group].dot}`} />{t(GROUP_LABEL[x.group])}{x.notStarted ? <span className="text-xs text-slate-500">· {t("not started")}</span> : null}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* r75: the summary, then the action plan (numbered, with names and a button each) */}
      <ReportSummary summary={skillsClassSummary(r)} className="!mb-2" />
      <div>
        <h2 className="mb-2 font-semibold text-brand-navy">{t("Action plan")}</h2>
        {r.actions.length ? (
          <ol className="space-y-1.5" data-testid="report-actions">
            {r.actions.map((a, i) => (
              <li key={i} data-action={a.kind} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 print:px-2 print:py-0.5">
                <span className="font-bold text-brand-navy" dir="ltr">{i + 1}.</span>
                <span className="min-w-0 flex-1">{t(a.text, a.vars)}</span>
                <Link prefetch={false} href={a.href} className="rounded-lg bg-brand-navy px-3 py-1 text-xs font-semibold text-white hover:bg-brand-purple print:hidden">{t(a.button)}</Link>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-slate-600">{t("Nothing urgent: keep practising the assigned skills.")}</p>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 🗂️ Plans (r84)

const PLAN_TYPE_CLASS: Record<PlanType, string> = {
  RTI: ASSIGN_SOURCE_CLASS.RTI, MAP: ASSIGN_SOURCE_CLASS.MAP, NAFS: ASSIGN_SOURCE_CLASS.NAFS, CURRICULUM: ASSIGN_SOURCE_CLASS.CURRICULUM,
  CUSTOM: "bg-slate-50 text-slate-800 ring-slate-300",
};
function PlanBadge({ type, t }: { type: PlanType; t: T }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${PLAN_TYPE_CLASS[type]}`} data-testid="plan-type" data-type={type}>{t(PLAN_TYPE_LABEL[type])}</span>;
}
const STATE_LABEL: Record<PlanStudentState, string> = { FINISHED: "Finished all", SUPPORT: "Needs support", NOT_STARTED: "Not started", WORKING: "Working on it" };
const STATE_ICON: Record<PlanStudentState, string> = { FINISHED: "⭐", SUPPORT: "⚠️", NOT_STARTED: "⏳", WORKING: "◐" };

function PlansView({ d, t, href, pid, now, range }: { d: ClassSkills; t: T; href: (o: Partial<SP>) => string; pid: string | null; now: Date; range: DateRange }) {
  const cards = planCards(d);
  if (!cards.length) return <EmptyState icon="🗂️" title="No plans yet" text="Plans you send from the Plans pages (Support, MAP, Custom, Curriculum) and NAFS practice on 2 or more standards appear here, one card each." />;
  const active = cards.filter((c) => c.status === "ACTIVE"), done = cards.filter((c) => c.status === "FINISHED");
  const open = pid ? planGrid(d, pid) : null;
  const list = (xs: PlanCard[]) => <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{xs.map((c) => <li key={c.id}><PlanCardView c={c} t={t} on={open?.card.id === c.id} href={href({ tab: "plans", pid: c.id, page: undefined, student: undefined, key: undefined })} classId={d.classId ?? ""} now={now} range={range} /></li>)}</ul>;
  return (
    <section data-testid="plans-tab" className="space-y-4">
      <OneLine l={skillsPlansOneLine(cards)} t={t} />
      <p className="flex items-center gap-1 text-sm text-slate-600 print:hidden">{t("One card for each plan you sent. Click a card to open its star grid.")} <InfoTip text={PLAN_RULE} /></p>
      {active.length ? <div data-testid="active-plans">{list(active)}</div> : <p className="text-sm text-slate-600">{t("No active plan right now.")}</p>}
      {done.length > 0 && (
        <details data-testid="finished-plans" open={Boolean(open && open.card.status === "FINISHED")} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold text-brand-navy">{t("Finished plans")} <span className="rounded-full bg-white px-1.5 text-xs" dir="ltr">{done.length}</span></summary>
          <div className="mt-3">{list(done)}</div>
        </details>
      )}
      {open && <PlanGridSection v={open} t={t} href={href} classId={d.classId ?? ""} />}
      {pid && !open && <p role="status" className="text-sm text-slate-600">{t("This plan is not in this class or these dates.")}</p>}
    </section>
  );
}

function PlanCardView({ c, t, on, href, classId, now, range }: { c: PlanCard; t: T; on: boolean; href: string; classId: string; now: Date; range: DateRange }) {
  const ago = agoOf(c.lastActivity, now);
  const who = c.scope === "class" ? t("Whole class") : c.scope === "student" ? t("One student") : t("Group of {n}", { n: c.students });
  return (
    <div data-testid="plan-card" data-plan={c.id} data-status={c.status} className={`flex h-full flex-col rounded-2xl bg-white p-4 ring-1 ${on ? "ring-2 ring-brand-navy" : "ring-slate-200"}`}>
      <Link prefetch={false} href={href} aria-current={on ? "true" : undefined} className="group block flex-1">
        <span className="flex items-start gap-2">
          <PlanBadge type={c.type} t={t} />
          <b className="min-w-0 flex-1 text-brand-navy group-hover:underline" data-content lang="en" data-testid="plan-title">{c.title}</b>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.status === "FINISHED" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-sky-50 text-sky-800 ring-1 ring-sky-200"}`} data-testid="plan-status">{t(c.status === "FINISHED" ? "Finished" : "Active")}</span>
        </span>
        <span className="mt-1 block text-xs text-slate-600">{t("Sent")} <span dir="ltr">{day(c.sentAt)}</span> · <span data-testid="plan-who">{who}</span> · <span data-testid="plan-skills">{t("{n} skills", { n: c.skills })}</span></span>
        <span className="mt-3 flex items-end justify-between gap-2">
          <span className="flex items-center gap-1 text-xs text-slate-600">{t("Class achievement")} <InfoTip text={PLAN_RULE} /></span>
          <b className="text-2xl tabular-nums text-brand-navy" dir="ltr" data-testid="plan-pct">{c.pct}%</b>
        </span>
        <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.pct} aria-label={t("Class achievement")}><span className="block h-full bg-amber-400" style={{ width: `${c.pct}%` }} /></span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700">
          <span title={t("Finished all the skills of the plan")}>⭐ <b data-testid="plan-finished">{c.finished}</b> {t("finished all")}</span>
          <span title={t("At least one skill's star is currently \"Needs support\" — based on this plan's own skill stars, not a test score. Other reports can use a different measure.")}>⚠️ <b data-testid="plan-support">{c.support}</b> {t("need support")}</span>
          <span title={t("No answer yet on the plan's skills")}>⏳ <b data-testid="plan-idle">{c.notStarted}</b> {t("not started")}</span>
        </span>
        <span className="mt-1 block text-xs text-slate-500">{t("Last activity")}: <span data-testid="plan-last">{t(ago.key, ago.vars)}</span></span>
      </Link>
      <form action={closePlanAction} className="mt-3 print:hidden">
        <input type="hidden" name="classId" value={classId} /><input type="hidden" name="planId" value={c.id} /><input type="hidden" name="close" value={c.closed ? "0" : "1"} />
        <input type="hidden" name="from" value={range.from ?? ""} /><input type="hidden" name="to" value={range.to ?? ""} />
        <button className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal" data-testid={c.closed ? "plan-reopen" : "plan-close"}>{t(c.closed ? "Reopen plan" : "Close plan")}</button>
      </form>
    </div>
  );
}

function PlanGridSection({ v, t, href, classId }: { v: PlanGridView; t: T; href: (o: Partial<SP>) => string; classId: string }) {
  const actions = planActions(v, {
    skill: (key) => nafsHref(key) ?? href({ tab: undefined, src: undefined, pid: undefined, view: "skill", skill: key }),
    plan: (ids) => `/teacher/plans?${new URLSearchParams([["tab", "new"], ["classId", classId], ["who", ids.length === 1 ? "student" : "group"], ...ids.map((id) => ["sid", id] as [string, string])])}`,
    student: (id) => href({ tab: undefined, src: undefined, pid: undefined, view: "student", student: id }),
    assigned: `/teacher/assigned?${new URLSearchParams({ classId })}`,
  });
  return (
    <section data-testid="plan-grid" data-plan={v.card.id} className="space-y-3 print:text-[10px]">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-navy"><PlanBadge type={v.card.type} t={t} /><span data-content lang="en">{v.card.title}</span></h2>
        <span className="text-sm text-slate-600">{t("{n} students", { n: v.rows.length })} · {t("{n} skills", { n: v.skills.length })} · <b dir="ltr">{v.card.pct}%</b></span>
        <Link prefetch={false} href={href({ tab: "plans", pid: undefined })} className="ms-auto text-sm font-semibold text-brand-teal underline print:hidden">{t("All plans")}</Link>
      </div>
      <StarLegend t={t} />
      <div className="max-h-[75vh] overflow-auto rounded-xl bg-white ring-1 ring-slate-200 print:max-h-none print:overflow-visible print:ring-0">
        <table className="border-separate border-spacing-0 text-sm print:text-[9px]">
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              <th className="sticky start-0 z-30 min-w-[9rem] border-b border-e border-slate-200 bg-white px-3 py-2 text-start align-bottom">{t("Student")}</th>
              {v.skills.map((k) => (
                <th key={k.key} scope="col" data-skill={k.key} title={k.name} className="min-w-[6.5rem] max-w-[8.5rem] border-b border-slate-200 bg-white px-1.5 py-1.5 text-center align-bottom text-xs font-semibold">
                  <span className="inline-flex items-start gap-0.5">
                    <Link prefetch={false} href={nafsHref(k.key) ?? href({ tab: undefined, pid: undefined, view: "skill", skill: k.key })} className="line-clamp-3 whitespace-normal break-words text-brand-navy hover:underline" data-content lang="en">{k.code ? <b dir="ltr">{k.code} </b> : null}<span className="font-normal">{k.short || k.name}</span></Link>
                    <InfoTip text={k.name} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((st) => (
              <tr key={st.id} data-testid="plan-row" data-state={st.state}>
                <th scope="row" className="sticky start-0 z-10 border-b border-e border-slate-100 bg-white px-3 py-1.5 text-start font-semibold">
                  <Link prefetch={false} href={href({ tab: undefined, pid: undefined, view: "student", student: st.id })} className="text-brand-navy hover:underline"><bdi>{st.name}</bdi></Link>
                  <StudentMarks trend={st.trend} guessing={st.guessing} t={t} />
                  <span className="block text-[11px] font-normal text-slate-500" data-testid="plan-row-count">{t("{x} of {y}", { x: st.mastered, y: st.of })} · <span dir="ltr">{st.pct}%</span> · <span title={t(STATE_LABEL[st.state])}>{STATE_ICON[st.state]} {t(STATE_LABEL[st.state])}</span></span>
                </th>
                {v.skills.map((k) => {
                  const c = v.assigned[st.id]?.[k.key] ? v.cells[st.id][k.key] : null;
                  return (
                    <td key={k.key} className="border-b border-slate-100 px-1 py-1 text-center" data-status={c ? c.status : "NOT_ASSIGNED"}>
                      {c ? <span className={`inline-flex items-center gap-1 ${isPractised(c) ? "" : "opacity-50"}`}><SkillStar info={c} t={t} label={`${st.name} · ${k.name}`} size={14} />{isPractised(c) && <span className={`whitespace-nowrap text-[11px] font-medium ${LEVEL_TONE[c.needsSupport ? "SUPPORT" : c.status]}`}>{t(teacherWordOf(c))}</span>}</span>
                        : <span className="text-slate-300" title={t("Not assigned to this student")} aria-label={t("Not assigned to this student")}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-testid="plan-foot">
              <th scope="row" className="sticky start-0 z-10 border-e border-slate-200 bg-slate-50 px-3 py-1.5 text-start text-xs font-semibold text-slate-700">{t("% of students mastered")}</th>
              {v.skills.map((k) => <td key={k.key} data-testid="plan-col-count" title={t("{n} of {total} mastered", { n: k.mastered, total: k.total })} className="bg-slate-50 px-1 py-1.5 text-center text-xs font-semibold text-amber-800"><span dir="ltr">{k.pct ?? 0}%</span></td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <ReportSummary summary={skillsPlanSummary(v)} className="!mb-2" />
      <div>
        <h3 className="mb-2 font-semibold text-brand-navy">{t("Action plan")}</h3>
        {actions.length ? (
          <ol className="space-y-1.5" data-testid="plan-actions">
            {actions.map((a, i) => (
              <li key={i} data-action={a.kind} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 print:px-2 print:py-0.5">
                <span className="font-bold text-brand-navy" dir="ltr">{i + 1}.</span>
                <span className="min-w-0 flex-1">{t(a.text, a.vars)}</span>
                <Link prefetch={false} href={a.href} className="rounded-lg bg-brand-navy px-3 py-1 text-xs font-semibold text-white hover:bg-brand-purple print:hidden">{t(a.button)}</Link>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-slate-600">{t("Nothing urgent: keep practising the assigned skills.")}</p>}
      </div>
    </section>
  );
}

function SkillView({ p, t, back }: { p: SkillPage; t: T; back: string }) {
  const btn = "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold";
  return (
    <section data-testid="skill-page" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-brand-navy" data-content lang="en">{p.name}</h2>
        <span className="text-sm text-slate-600">{t("{n} of {total} mastered", { n: p.lists.MASTERED.length, total: p.total })}</span>
        <Link prefetch={false} href={back} className="ms-auto text-sm font-semibold text-brand-teal underline">{t("Back to the grid")}</Link>
      </div>
      {/* r74: one form — the required Source (always empty) and the three one-press actions */}
      <form action={skillActionAction} className="flex flex-wrap items-end gap-2 print:hidden" data-testid="skill-actions">
        <input type="hidden" name="classId" value={p.classId} /><input type="hidden" name="key" value={p.key} />
        <SourceSelect t={t} />
        <button name="action" value="NOT_MASTERED" className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`} data-action="NOT_MASTERED">{t("Assign to students not mastered")}</button>
        <button name="action" value="SMALL_GROUP" className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`} data-action="SMALL_GROUP">{t("Create small group")}</button>
        {p.reteach && <button name="action" value="RETEACH" className={`${btn} bg-orange-600 text-white hover:bg-orange-700`} data-action="RETEACH">{t("Reteach to whole class")}</button>}
      </form>
      {p.reteach && <p role="status" className="rounded-xl bg-orange-50 px-4 py-2 text-sm text-orange-900 ring-1 ring-orange-200">{t("{n} of {total} students are struggling with this skill: a whole-class reteach may help.", { n: p.struggling, total: p.total })}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["MASTERED", "LEARNING", "REVIEW", "NOT_STARTED"] as MySkillsTab[]).map((k) => (
          <section key={k} data-list={k} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-navy"><span aria-hidden="true">{TAB_ICON[k]}</span>{t(TAB_LABEL[k])} <span className="rounded-full bg-slate-100 px-1.5 text-xs" dir="ltr">{p.lists[k].length}</span></h3>
            {p.lists[k].length ? <ul className="space-y-1 text-sm">{p.lists[k].map((x) => <li key={x.id} className="flex items-center gap-1.5"><SkillStar info={{ status: x.status }} t={t} label={x.name} size={14} /><bdi>{x.name}</bdi></li>)}</ul> : <p className="text-xs text-slate-400">—</p>}
          </section>
        ))}
      </div>
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h3 className="font-semibold text-brand-navy">{t("Most-missed questions")}</h3>
        {p.missed.length ? (
          <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-sm" data-content lang="en">
            {p.missed.map((q) => <li key={q.id}><span className="text-slate-800">{q.stem ? <RichInline text={q.stem} /> : "—"}</span> <span className="text-xs text-rose-700" dir="ltr">✗ {q.wrong}/{q.answered}</span></li>)}
          </ol>
        ) : <p className="mt-1 text-sm text-slate-500">{t("No wrong answers yet.")}</p>}
      </section>
    </section>
  );
}

function StudentView({ v, goal, teacher, t, canSend }: { v: StudentSkillsView; goal: SkillGoal | null; teacher: boolean; t: T; canSend: boolean }) {
  const btn = "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold";
  const p = v.assigned;
  return (
    <section data-testid="student-skills-view" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-brand-navy"><bdi>{v.name}</bdi>{v.className ? <span className="ms-2 text-sm font-normal text-slate-500"><bdi>{v.className}</bdi></span> : null}</h2>
        <p className="w-full text-sm text-slate-700" data-testid="student-skills-summary">{t("Summary")}: {t("{n} skills assigned · {m} mastered · {l} learning · {r} to review", { n: p.total, m: p.counts.MASTERED, l: p.counts.LEARNING, r: p.counts.REVIEW })}</p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        {v.planHref && <Link prefetch={false} href={v.planHref} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`} data-testid="create-plan">🗂️ {t("Create Plan")}</Link>}
        <PrintButton label={t("Print (one page)")} />
        {canSend && (
          <form action={sendSkillsFamilyAction} className="inline-flex">
            <input type="hidden" name="studentId" value={v.studentId} /><input type="hidden" name="classId" value={v.classId ?? ""} />
            <button className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`} data-testid="send-family">📨 {t("Send to the family")}</button>
          </form>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 print:hidden" data-testid="student-goal">
        <span className="font-semibold text-brand-navy">🎯 {t("Weekly goal")}:</span>
        {goal ? <span className={goal.done ? "font-semibold text-emerald-700" : "text-slate-700"}><bdi dir="ltr">{goal.mastered}/{goal.target}</bdi> {t("skills mastered this week")}</span> : <span className="text-slate-500">{t("No goal this week.")}</span>}
        {teacher && (
          <form action={setStudentSkillGoalAction} className="ms-auto flex items-center gap-2"><input type="hidden" name="studentId" value={v.studentId} />
            <label className="flex items-center gap-1.5 text-slate-700">{t("Skills to master this week")}
              <select name="target" defaultValue={String(goal?.target ?? 2)} className="h-9 min-w-[4rem] rounded-lg border border-slate-300 px-2 text-sm" dir="ltr">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <button className="h-9 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white">{t("Set goal")}</button></form>
        )}
      </div>
      <StarLegend t={t} />
      <p className="text-xs text-slate-500 print:hidden">{t("Only the skills assigned to this student, with their source. Sending to the family goes through the school admin's approval.")}</p>
      {!p.total ? <EmptyState icon="⭐" title="No assigned skills yet" text="No skill has been assigned to this student yet." compact /> : (
        <div className="space-y-3" data-testid="student-assigned">
          {p.groups.map((gr) => (
            <section key={gr.strand} data-strand={gr.strand} aria-labelledby={`ps-${gr.strand}`} className="break-inside-avoid">
              <h3 id={`ps-${gr.strand}`} className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-brand-navy">{t(gr.label)} <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-600" dir="ltr">{gr.rows.length}</span></h3>
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {gr.rows.map((r) => (
                  <li key={r.key} data-testid="assigned-skill" data-status={r.status} className="flex min-h-11 items-center gap-2 rounded-xl bg-white px-3 py-1.5 ring-1 ring-slate-200">
                    <SkillStar info={{ status: r.status, needsSupport: r.needsSupport, answered: r.answered, score: r.score }} t={t} label={r.name} size={18} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm" data-content lang="en" title={r.name}>{r.code ? <b dir="ltr">{r.code} </b> : null}{r.short || r.name}</span>
                      <SourceBadges sources={r.sources} t={t} className="!justify-start" />
                    </span>
                    {(r.short && r.short !== r.name) ? <InfoTip text={r.name} /> : null}
                    <span className={`shrink-0 text-xs font-semibold ${LEVEL_TONE[r.needsSupport ? "SUPPORT" : r.status]}`} data-testid="practised-level">{t(teacherWordOf(r))}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Detail({ d, t, close }: { d: CellDetail; t: T; close: string }) {
  const v = d.view;
  return (
    <section data-testid="cell-detail" aria-label={t("Skill detail")} className="mb-3 rounded-2xl bg-white p-4 ring-1 ring-brand-teal">
      <div className="flex flex-wrap items-center gap-2">
        <SkillStar info={v} t={t} label={d.skill} size={20} />
        <h2 className="text-lg font-bold text-brand-navy"><bdi>{d.student}</bdi> · {d.skill}</h2>
        <Link prefetch={false} href={close} className="ms-auto text-sm font-semibold text-brand-teal underline">{t("Close")}</Link>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">{t("Questions")}</dt><dd className="font-semibold" dir="ltr">{v.answered}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Accuracy")}</dt><dd className="font-semibold" dir="ltr">{d.accuracy === null ? "—" : `${d.accuracy}%`}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Mastery")}</dt><dd className="font-semibold" dir="ltr">{v.score}%</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Started")}</dt><dd className="font-semibold" dir="ltr">{day(v.startedAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Mastered")}</dt><dd className="font-semibold" dir="ltr">{day(v.masteredAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Review check")}</dt><dd className="font-semibold" dir="ltr">{day(v.reviewDueAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Self-check")}</dt><dd className="font-semibold">{v.selfCheck === "HAPPY" ? "😊" : v.selfCheck === "OK" ? "😐" : v.selfCheck === "UNSURE" ? "😟" : "—"}{d.mismatch && <span data-testid="self-mismatch" className="ms-1 rounded-full bg-rose-50 px-2 text-xs text-rose-800 ring-1 ring-rose-200">{t(d.mismatch)}</span>}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Level")}</dt><dd className="font-semibold" dir="ltr">{v.level}</dd></div>
      </dl>
      {d.reviews.length > 0 && <p className="mt-2 text-sm text-slate-700">{t("Reviews")}: {d.reviews.map((r) => `${day(r.at)} ${r.outcome === "PASS" ? "✓" : r.outcome === "FAIL" ? "🔄" : r.outcome === "GUESSING" ? t("not counted") : t("missed in the mixed review")}${r.of ? ` (${r.right}/${r.of})` : ""}`).join(" · ")}</p>}
      {d.history.length > 0 && <p className="mt-1 text-xs text-slate-500">{d.history.map((h) => `${day(h.at)} ${t(TEACHER_WORD[h.status as StarStatus] ?? h.status)}`).join(" → ")}</p>}
    </section>
  );
}
