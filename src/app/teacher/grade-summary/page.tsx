import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { Tile } from "@/components/insights/badges";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { coordinatorGrades } from "@/server/teacher/coordinators";
import { gradeSummary } from "@/server/insights/progress";

export const metadata = { title: "Grade summary" };

/** 🏫 Admin and grade coordinators: every class of their grades in numbers. */
export default async function GradeSummaryPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const subject = (await searchParams).subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const allowed = (await coordinatorGrades(repo, actor)).length > 0;
  const grades = allowed ? await gradeSummary(repo, actor, subject) : [];
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="🏫" title="Grade Summary" subtitle="Each class at a glance. Click a class to see its students.">
        {(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={`/teacher/grade-summary?subject=${x}`} className={`${chip(x === subject)} print:hidden`}>{x === "READING" ? "📖 Reading" : "✏️ Language"}</Link>)}
        <PrintButton />
      </PageHeader>
      {!allowed ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">This page is for admins and grade coordinators. An admin can make you a coordinator in Settings → Grade coordinators.</p> : grades.map((g) => {
        const t = g.classes.reduce((a, c) => ({ students: a.students + c.students, tested: a.tested + c.tested, onTrack: a.onTrack + c.onTrack, atRisk: a.atRisk + c.atRisk, active: a.active + c.activeWeek, late: a.late + c.late }), { students: 0, tested: 0, onTrack: 0, atRisk: 0, active: 0, late: 0 });
        return (
          <section key={g.grade} className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-bold text-brand-navy">Grade {g.grade}</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="Students" value={String(t.students)} /><Tile label="MAP tested" value={`${t.tested}`} /><Tile label="Active this week" value={pct(t.active, t.students)} />
              <Tile label="On track" value={String(t.onTrack)} tone="text-emerald-700" /><Tile label="At risk" value={String(t.atRisk)} tone={t.atRisk ? "text-red-700" : ""} /><Tile label="Late tasks" value={String(t.late)} />
            </dl>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-3">Class</th><th className="px-2">Teacher</th><th className="px-2">Students</th><th className="px-2">Active (week)</th><th className="px-2">Accuracy</th><th className="px-2">On track · at risk</th><th className="px-2">MAP Fall → target</th><th className="px-2">Levels B · O · A · not set</th><th className="px-2">Tasks done · late</th></tr></thead>
                <tbody>{g.classes.map((c) => (
                  <tr key={c.classId} className="border-b last:border-0">
                    <td className="py-2 pe-3"><Link href={`/teacher/progress?classId=${c.classId}&subject=${subject}`} className="font-semibold text-brand-navy hover:underline">{c.className}</Link></td>
                    <td className="px-2">{c.teacher}</td><td className="px-2 tabular-nums">{c.students}</td><td className="px-2 tabular-nums">{pct(c.activeWeek, c.students)}</td>
                    <td className="px-2 tabular-nums">{c.accuracy === null ? "—" : `${c.accuracy}%`}</td>
                    <td className="px-2 tabular-nums"><span className="text-emerald-700">{c.onTrack}</span> · <span className={c.atRisk ? "font-bold text-red-700" : ""}>{c.atRisk}</span></td>
                    <td className="px-2 tabular-nums">{c.avgFall ? `${c.avgFall} → ${c.avgTarget ?? "—"}` : "—"}</td>
                    <td className="px-2 tabular-nums">{c.levels.BELOW} · {c.levels.ON} · {c.levels.ABOVE} · {c.levels.NONE}</td>
                    <td className="px-2 tabular-nums">{c.done} · {c.late}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        );
      })}
    </AppShell>
  );
}
