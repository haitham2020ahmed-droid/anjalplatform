import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { IntensityBadge, LevelBadge, StatusBadge, Tile } from "@/components/insights/badges";
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
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="📈" title="Students"
        subtitle="Each student’s work, results and MAP progress. Click a name for the full picture and a ready plan.">
        {v && <a href={`/api/progress-export?classId=${classId}&subject=${subject}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇️ Excel</a>}
        <PrintButton />
      </PageHeader>
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No classes yet.</p> : (
        <>
          <nav aria-label="Classes" className="flex flex-wrap gap-2 print:hidden">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/progress?classId=${c.id}&subject=${subject}`} aria-current={c.id === classId ? "page" : undefined} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav>
          {v && (
            <>
              <dl className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Tile label="Students" value={String(v.summary.students)} />
                <Tile label="Active this week" value={`${v.summary.activeWeek} of ${v.summary.students}`} />
                <Tile label="On track" value={String(v.summary.onTrack)} tone="text-emerald-700" />
                <Tile label="At risk" value={String(v.summary.atRisk)} tone={v.summary.atRisk ? "text-red-700" : ""} />
                <Tile label="Late tasks" value={String(v.summary.late)} tone={v.summary.late ? "text-amber-700" : ""} />
                <Tile label={`MAP ${subject === "READING" ? "Reading" : "Language"}: Fall → target`} value={v.summary.avgFall ? `${v.summary.avgFall} → ${v.summary.avgTarget ?? "—"}` : "—"} />
              </dl>
              <div className="mt-5 flex flex-wrap items-center gap-2 print:hidden">
                {(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={link({ subject: x })} className={chip(x === subject)}>{x === "READING" ? "📖 Reading" : "✏️ Language"}</Link>)}
                <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
                {([["all", "Everyone"], ["risk", "⚠️ At risk"], ["late", "⏰ Late work"]] as const).map(([k, l]) => <Link key={k} href={link({ show: k })} className={chip(show === k)}>{l}</Link>)}
                <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
                <span className="text-sm text-slate-500">Sort:</span>
                {SORTS.map(([k, l]) => <Link key={k} href={link({ sort: k })} className={chip(sort === k)}>{l}</Link>)}
              </div>
              <div className="mt-4 overflow-x-auto rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead><tr className="border-b text-xs text-slate-500">
                    <th className="py-2 pe-3">Student</th><th className="px-2">Status</th><th className="px-2">Level</th><th className="px-2">Answers</th><th className="px-2">Accuracy</th>
                    <th className="px-2">Skills mastered / need work</th><th className="px-2">Time (week · month)</th><th className="px-2">Tasks done · pending · late</th><th className="px-2">Last active</th><th className="px-2">MAP Fall → now → target</th><th className="px-2">Plan</th>
                  </tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.studentId} className="border-b align-top last:border-0">
                      <td className="py-2 pe-3"><Link href={`/teacher/progress/${r.studentId}?subject=${subject}`} className="font-semibold text-brand-navy hover:underline">{r.name}</Link>{r.weakest.length > 0 && <span className="block text-xs text-slate-500">Weakest: {r.weakest.join(", ")}</span>}</td>
                      <td className="px-2"><span title={r.statusWhy}><StatusBadge status={r.status} /></span></td>
                      <td className="px-2"><LevelBadge level={r.level} /></td>
                      <td className="px-2 tabular-nums">{r.practice.answers} <span className="text-xs text-slate-500">({r.practice.correct}✓ {r.practice.answers - r.practice.correct}✗)</span></td>
                      <td className="px-2 tabular-nums">{r.practice.accuracy === null ? "—" : `${r.practice.accuracy}%`}</td>
                      <td className="px-2 tabular-nums">{r.mastered} / {r.needsWork}</td>
                      <td className="px-2 tabular-nums">{r.practice.week.minutes}m · {r.practice.month.minutes}m <span className="text-xs text-slate-500">(total {r.practice.totalMinutes}m)</span></td>
                      <td className="px-2 tabular-nums">{r.work.done} · {r.work.pending} · <span className={r.work.late ? "font-bold text-red-700" : ""}>{r.work.late}</span></td>
                      <td className="px-2">{day(r.practice.lastActive)}</td>
                      <td className="px-2 tabular-nums">{r.map ? `${r.map.fall?.rit ?? "—"} → ${r.map.latest && r.map.latest.season !== "FALL" ? r.map.latest.rit : "…"} → ${r.map.springTarget ?? "—"}` : "—"}</td>
                      <td className="px-2"><IntensityBadge intensity={r.intensity} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                {!rows.length && <p className="p-4 text-slate-600">No students match.</p>}
              </div>
              <p className="mt-2 text-xs text-slate-500">Status: MAP mid-year score against the Spring target when there is one; otherwise platform accuracy in the last 30 days (under 50% = at risk). Levels are visible to staff only.</p>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
