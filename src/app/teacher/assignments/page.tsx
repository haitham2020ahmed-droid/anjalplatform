import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { weeklyAssignments } from "@/server/teacher/assign";

const weekStartOf = (date: Date) => { const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; }; // weeks start on Sunday
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Weekly assignments: skills assigned or due this week, with Not Started / In Progress / Completed / Overdue. */
export default async function WeeklyAssignmentsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const w = (await searchParams).week;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(w ?? "") ? weekStartOf(new Date(`${w}T00:00:00Z`)) : weekStartOf(new Date());
  const prev = new Date(start.getTime() - 7 * 86_400_000), next = new Date(start.getTime() + 7 * 86_400_000), last = new Date(start.getTime() + 6 * 86_400_000);
  const rows = await weeklyAssignments(repo, actor, start);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/teacher/curriculum" className="text-brand-teal hover:underline">← Curriculum</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Weekly assignments</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/teacher/assignments?week=${iso(prev)}`} className="rounded-lg px-3 py-1 ring-1 ring-slate-300">← Previous week</Link>
        <span className="font-semibold">{iso(start)} – {iso(last)}</span>
        <Link href={`/teacher/assignments?week=${iso(next)}`} className="rounded-lg px-3 py-1 ring-1 ring-slate-300">Next week →</Link>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Skill</th><th>Class</th><th>Assigned</th><th>Not started</th><th>In progress</th><th>Completed</th><th>Overdue</th><th>Due</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="p-4 text-slate-600">No assignments created or due this week. Use ⭐ Assign on the Curriculum page.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3"><Link href={`/teacher/assignments/${r.id}`} className="font-semibold text-brand-teal hover:underline">{r.track === "MAP" ? <span title="MAP" aria-label="MAP">🗺️ </span> : <span title="Curriculum" aria-label="Curriculum">📘 </span>}{r.skill}</Link>{r.scope === "students" && <span className="ms-2 text-xs text-slate-500">selected students</span>}</td>
                <td>{r.className}</td><td className="tabular-nums">{r.assigned}</td>
                <td className="tabular-nums">{r.counts.NOT_STARTED}</td><td className="tabular-nums">{r.counts.IN_PROGRESS}</td>
                <td className="tabular-nums text-teal-800">{r.counts.COMPLETED}</td><td className={`tabular-nums ${r.counts.OVERDUE ? "font-semibold text-red-700" : ""}`}>{r.counts.OVERDUE}</td>
                <td>{r.dueAt ? r.dueAt.slice(0, 10) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
