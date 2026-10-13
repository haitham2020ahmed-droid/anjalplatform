import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { IntensityBadge, LevelBadge, StatusBadge } from "@/components/insights/badges";
import { AtAGlance, BandBar, Callout, ReportHeader, ReportSection, ReportTable, Sparkline } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { recordResultsView } from "@/server/insights/teacher-followup";
import { readableClasses } from "@/server/teacher/coordinators";
import { classProgress, type ProgressRow } from "@/server/insights/progress";

export const metadata = { title: "Students" };

type SortKey = "name" | "status" | "accuracy" | "late" | "active" | "rit";
const SORTS: [SortKey, string][] = [["name", "Name"], ["status", "Needs help first"], ["accuracy", "Accuracy"], ["late", "Late work"], ["active", "Last active"], ["rit", "MAP RIT"]];
const rank = (r: ProgressRow) => ({ AT_RISK: 0, MISSED: 0, NO_DATA: 1, ON_TRACK: 2, MET: 3 })[r.status];
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

/** 📈 Students dashboard: every student of a class in one table (staff only). */
export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ classId?: string; subject?: string; sort?: string; show?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  await recordResultsView(repo, actor);
  const sp = await searchParams;
  const grades = new Map((await repo.findMany("Grade", { schoolId: actor.schoolId })).map((g) => [String(g.id), Number(g.level)]));
  const classes = (await readableClasses(repo, actor)).sort((a, b) => (grades.get(String(a.gradeId)) ?? 0) - (grades.get(String(b.gradeId)) ?? 0) || String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const v = classId ? await classProgress(repo, actor, classId, subject) : null;
  const sort = (SORTS.find(([k]) => k === sp.sort)?.[0] ?? "status") as SortKey;
  const show = sp.show === "risk" ? "risk" : sp.show === "late" ? "late" : "all";
  let rows = [...(v?.rows ?? [])];
  if (show === "risk") rows = rows.filter((r) => r.status === "AT_RISK" || r.status === "MISSED");
  if (show === "late") rows = rows.filter((r) => r.work.late > 0);
  rows.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "status" ? rank(a) - rank(b) || a.name.localeCompare(b.name)
    : sort === "accuracy" ? (a.practice.accuracy ?? 101) - (b.practice.accuracy ?? 101) : sort === "late" ? b.work.late - a.work.late
    : sort === "active" ? (a.practice.lastActive ?? "").localeCompare(b.practice.lastActive ?? "") : (a.map?.latest?.rit ?? 999) - (b.map?.latest?.rit ?? 999));
  const link = (p: Record<string, string>) => `/teacher/progress?${new URLSearchParams({ classId, subject, sort, show, ...p })}`;
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="📈" title="Students"
        subtitle="Each student’s work, results and MAP progress. Click a name for the full picture and a ready plan."
        who={classes.find((c) => String(c.id) === classId)?.name ? String(classes.find((c) => String(c.id) === classId)!.name) : undefined}
        when={subject === "READING" ? t("MAP Reading") : t("MAP Language")}
        downloads={v ? [{ href: `/api/progress-export?classId=${classId}&subject=${subject}`, label: "Excel", icon: "⬇️" }] : []}
        filters={classes.length ? (
          <>
            <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/progress?classId=${c.id}&subject=${subject}`} aria-current={c.id === classId ? "page" : undefined} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav>
            {v && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={link({ subject: x })} className={chip(x === subject)}>{x === "READING" ? "📖 Reading" : "✏️ Language"}</Link>)}
                <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
                {([["all", "Everyone"], ["risk", "⚠️ At risk"], ["late", "⏰ Late work"]] as const).map(([k, l]) => <Link key={k} href={link({ show: k })} className={chip(show === k)}>{l}</Link>)}
                <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
                <span className="text-sm text-slate-500">Sort:</span>
                {SORTS.map(([k, l]) => <Link key={k} href={link({ sort: k })} className={chip(sort === k)}>{l}</Link>)}
              </div>
            )}
          </>
        ) : undefined} />
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No classes yet.</p> : (
        <>
          {v && (
            <>
              <AtAGlance items={[
                { icon: "🙋", label: "Active this week", value: `${v.summary.activeWeek} of ${v.summary.students}`, meaning: "students practised in the last 7 days", tone: v.summary.activeWeek < v.summary.students ? "warn" : "good" },
                { icon: "✅", label: "On track", value: String(v.summary.onTrack), meaning: "meeting their target", tone: "good" },
                { icon: "⚠️", label: "At risk", value: String(v.summary.atRisk), meaning: v.summary.atRisk ? "need help first (list below)" : "nobody at risk right now", tone: v.summary.atRisk ? "bad" : "good" },
                { icon: "⏰", label: "Late tasks", value: String(v.summary.late), meaning: "work past its due date", tone: v.summary.late ? "warn" : "neutral" },
                { icon: "🗺️", label: `MAP ${subject === "READING" ? "Reading" : "Language"}: Fall → target`, value: v.summary.avgFall ? `${v.summary.avgFall} → ${v.summary.avgTarget ?? "—"}` : "—", meaning: "class average RIT" },
              ]} />
              <div className="mb-5 grid gap-4 lg:grid-cols-2">
                <Callout kind="help" items={[
                  (() => { const n = (v.rows ?? []).filter((r) => r.status === "AT_RISK" || r.status === "MISSED"); return n.length ? <>{t("At risk")}: {n.slice(0, 10).map((r, i) => <span key={r.studentId}>{i ? ", " : ""}<bdi>{r.name}</bdi></span>)}{n.length > 10 ? ` +${n.length - 10}` : ""}</> : null; })(),
                  (() => { const n = (v.rows ?? []).filter((r) => r.work.late > 0).length; return n ? t("{n} students have late work.", { n }) : null; })(),
                ]} />
                <Callout kind="next" items={[
                  v.summary.atRisk ? t("Open each at-risk student (click the name) for a ready plan.") : null,
                  v.summary.late ? t("Remind students with late work, or move the due date.") : null,
                  v.stats.declined ? t("{n} students declined in the last 4 weeks: check their trend.", { n: v.stats.declined }) : t("Keep the weekly practice going."),
                ]} />
              </div>
              <ReportSection title="Class picture (accuracy on the platform)" icon="📐">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="text-sm text-slate-700">
                    <p>Mean <b>{v.stats.mean ?? "—"}%</b> · spread (SD) <b>{v.stats.sd === null ? "—" : `±${v.stats.sd}`}</b> — {v.stats.spread}</p>
                    <p className="mt-2">Last 4 weeks vs the 4 before: <b className="text-emerald-700">▲ {v.stats.improved} improved</b> · <b className="text-rose-700">▼ {v.stats.declined} declined</b> · → {v.stats.maintained} maintained</p>
                    <p className="mt-2 text-xs text-slate-500">Levels: {v.stats.levels.map((l) => `${l.level === "ABOVE" ? "Exceeding" : l.level === "ON" ? "Meeting" : "Approaching"} ${l.count} (${l.pct}%)`).join(" · ")}</p>
                  </div>
                  <BandBar label="Levels" parts={(["BELOW", "ON", "ABOVE"] as const).map((k) => ({ key: k, value: v.stats.levels.find((l) => l.level === k)?.count ?? 0 }))} />
                </div>
              </ReportSection>
              <ReportTable label="Students"
                cols={[
                  { key: "n", label: "Student" }, { key: "st", label: "Status" }, { key: "lv", label: "Level" }, { key: "a", label: "Answers", num: true }, { key: "acc", label: "Accuracy", num: true },
                  { key: "tr", label: "Trend", hint: "Weekly accuracy, last 6 weeks: trend, consistency, last 4 weeks vs the 4 before, percentile rank in the class", sort: false },
                  { key: "sk", label: "Skills mastered / need work", num: true }, { key: "tm", label: "Time (week · month)", num: true }, { key: "w", label: "Tasks done · pending · late", num: true },
                  { key: "la", label: "Last active" }, { key: "map", label: "MAP Fall → now → target", num: true }, { key: "p", label: "Plan", sort: false },
                ]}
                rows={rows.map((r) => {
                  const tr = v.trends[r.studentId];
                  return {
                    id: r.studentId, flag: r.status === "AT_RISK" || r.status === "MISSED" ? "bad" as const : r.work.late ? "warn" as const : undefined,
                    sort: { n: r.name, st: rank(r), lv: r.level === "BELOW" ? 0 : r.level === "ON" ? 1 : r.level === "ABOVE" ? 2 : null, a: r.practice.answers, acc: r.practice.accuracy, sk: r.mastered, tm: r.practice.week.minutes, w: r.work.late, la: r.practice.lastActive, map: r.map?.latest?.rit ?? r.map?.fall?.rit ?? null },
                    cells: {
                      n: <span className="block text-start"><Link href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline">{r.name}</Link> <Link href={`/teacher/progress/${r.studentId}?subject=${subject}`} className="ms-1 text-xs font-semibold text-brand-teal hover:underline print:hidden" aria-label={`Progress: ${r.name}`}>📈</Link>{r.weakest.length > 0 && <span className="block text-xs font-normal text-slate-500">Weakest: {r.weakest.join(", ")}</span>}</span>,
                      st: <span title={r.statusWhy}><StatusBadge status={r.status} /></span>,
                      lv: <LevelBadge level={r.level} />,
                      a: <>{r.practice.answers} <span className="text-xs text-slate-500">({r.practice.correct}✓ {r.practice.answers - r.practice.correct}✗)</span></>,
                      acc: r.practice.accuracy === null ? "—" : `${r.practice.accuracy}%`,
                      tr: <span className="inline-flex flex-wrap items-center justify-end gap-1 whitespace-nowrap text-xs" title={tr?.weeks.map((w) => (w === null ? "–" : `${w}%`)).join(" · ")}>
                        {tr?.weeks?.length ? <Sparkline values={tr.weeks} width={64} height={22} label="Weekly accuracy" /> : null}
                        {tr?.trend ? <span className={`text-base font-bold ${tr.trend === "UP" ? "text-emerald-600" : tr.trend === "DOWN" ? "text-rose-600" : "text-slate-500"}`} aria-label={tr.trend === "UP" ? "improving" : tr.trend === "DOWN" ? "declining" : "stable"}>{tr.trend === "UP" ? "↑" : tr.trend === "DOWN" ? "↓" : "→"}</span> : <span className="text-slate-400">—</span>}
                        {tr?.consistency && <span className={`rounded px-1 ${tr.consistency === "Uneven" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{tr.consistency}</span>}
                        {tr?.change && <span className={tr.change.label === "Improved" ? "text-emerald-700" : tr.change.label === "Declined" ? "text-rose-700" : "text-slate-500"}>{tr.change.diff > 0 ? "+" : ""}{tr.change.diff}</span>}
                        {tr?.percentile !== null && tr?.percentile !== undefined && <span className="text-slate-500">P{tr.percentile}</span>}
                      </span>,
                      sk: `${r.mastered} / ${r.needsWork}`,
                      tm: <>{r.practice.week.minutes}m · {r.practice.month.minutes}m <span className="text-xs text-slate-500">(total {r.practice.totalMinutes}m)</span></>,
                      w: <>{r.work.done} · {r.work.pending} · <span className={r.work.late ? "font-bold text-red-700" : ""}>{r.work.late}</span></>,
                      la: day(r.practice.lastActive),
                      map: r.map ? `${r.map.fall?.rit ?? "—"} → ${r.map.latest && r.map.latest.season !== "FALL" ? r.map.latest.rit : "…"} → ${r.map.springTarget ?? "—"}` : "—",
                      p: <IntensityBadge intensity={r.intensity} from={r.intensityFrom} />,
                    },
                  };
                })} empty="No students match." />
              <p className="mt-2 text-xs text-slate-500">Status: MAP mid-year score against the Spring target when there is one; otherwise platform accuracy in the last 30 days (under 50% = at risk). Levels are visible to staff only.</p>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
