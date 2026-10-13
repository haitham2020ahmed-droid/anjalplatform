import { classMembers } from "@/server/insights/student-data";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReportHeader } from "@/components/report-kit";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import type { Subject } from "@/server/map/map-plan";
import { mapTabOf, type MapTab } from "./href";
import { ResultsTab } from "./results-tab";
import { ReportsTab } from "./reports-tab";
import { OverviewView } from "./overview";
import { PlanTab } from "./plan-tab";

export const metadata = { title: "MAP" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TABS: [MapTab, string, string][] = [["results", "Results", "📊"], ["reports", "Reports", "📑"], ["plan", "Make a MAP plan", "🎯"]];

/**
 * 🗺️ MAP — one page, three views (MAP Center, MAP plans, MAP skill plan, personal / 3-level plan, growth, MAP reports,
 * overview and recommendations merged). Every page lives in ONE place (Update 15):
 *  - Results (the MAP menu entry): the class's scores, with Upload MAP Scores and the MAP Practice Test next to it;
 *  - Reports (?tab=reports): opened from Reports → MAP (growth, overview), with the report bar on top;
 *  - Make a MAP plan (?tab=plan): opened from Plans → MAP.
 * One class and one MAP test at a time.
 */
export default async function MapPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  // old MAP Center tabs (student / class / school) open Results
  const tab = mapTabOf(one(sp.tab));
  const subject: Subject = /^lang/i.test(one(sp.subject)) ? "LANGUAGE" : "READING";
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  // no class chosen: open the first class that has MAP scores (not just the first name)
  let firstWithScores: string | undefined;
  if (!one(sp.classId) && classes.length > 1) {
    for (const c of classes) {
      const ids = await classMembers(repo, c.id);
      if (ids.length && (await repo.count("MapResult", { studentId: { in: ids.slice(0, 500) } })) > 0) { firstWithScores = c.id; break; }
    }
  }
  const classId = classes.find((c) => c.id === one(sp.classId))?.id ?? firstWithScores ?? classes[0]?.id ?? "";
  const msg = one(sp.msg);
  const href = (p: Record<string, string>) => `/teacher/map-center?${new URLSearchParams({ tab, classId, subject, ...p })}`;
  const pill = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const home = actor.role === "TEACHER" ? "/teacher" : "/admin";
  // MAP reports belong to Reports and the MAP plan to Plans: their own title and way back, no MAP tabs
  const head = tab === "reports" ? { back: { href: "/teacher/reports", label: "Reports" }, title: one(sp.view) === "overview" ? "Grade and school overview" : "MAP Growth Report", subtitle: "Every student's RIT and who reached the expected growth." }
    : tab === "plan" ? { back: { href: "/teacher/plans", label: "Plans" }, title: TABS[2][1], subtitle: "Skills suggested from the lowest MAP sub-areas, for the class, a group or each student." }
    : { back: { href: home, label: "Home" }, title: "MAP", subtitle: "Your class's MAP scores, the score upload and the MAP Practice Test." };
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={head.back} title={head.title} print={tab !== "plan"} subtitle={t(head.subtitle)}
        filters={<div className="flex flex-col gap-3">
          {tab === "results" && (
            <nav aria-label={t("MAP")} className="flex flex-wrap gap-2">
              <Link href={`/teacher/map-center?${new URLSearchParams({ tab: "results", classId, subject })}`} aria-current="page" className="inline-flex min-h-10 items-center rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white">{t(TABS[0][1])}</Link>
              <Link href={`/teacher/map-entry${classId ? `?classId=${classId}` : ""}`} className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">{t("Upload MAP Scores")}</Link>
              <Link href={`/teacher/map-test${classId ? `?classId=${classId}` : ""}`} className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">{t("MAP Practice Test")}</Link>
            </nav>
          )}
          {tab !== "plan" && classes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {tab === "results" && classes.length > 1 && classes.map((c) => <Link key={c.id} href={href({ classId: c.id })} aria-current={c.id === classId ? "page" : undefined} className={pill(c.id === classId)}>{c.name}</Link>)}
              {tab === "results" && classes.length > 1 && <span aria-hidden="true" className="mx-1 h-6 w-px bg-slate-300" />}
              <Link href={href({ subject: "READING" })} className={pill(subject === "READING")}>{t("Reading")}</Link>
              <Link href={href({ subject: "LANGUAGE" })} className={pill(subject === "LANGUAGE")}>{t("Language Usage")}</Link>
            </div>
          )}
        </div>} />
      {msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{msg}</p>}
      {!classes.length ? <EmptyState icon="🗺️" title="No classes yet" text="When the admin adds you to a class, its MAP scores appear here." /> :
        tab === "results" ? <ResultsTab actor={actor} t={t} classId={classId} subject={subject} /> :
        tab === "reports" ? (one(sp.view) === "overview" ? <OverviewView actor={actor} t={t} subject={subject} term={one(sp.term) || undefined} classId={classId} /> : <ReportsTab actor={actor} t={t} classId={classId} subject={subject} />) :
        <PlanTab actor={actor} t={t} sp={sp} classId={classId} subject={subject} />}
    </AppShell>
  );
}
