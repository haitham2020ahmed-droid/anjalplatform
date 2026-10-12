import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { weeklyAssignments } from "@/server/teacher/assign";
import { listAssignDrafts } from "@/server/teacher/assign-drafts";
import { deleteDraftAction, sendDraftAction } from "../actions";
import { SOURCE_LABEL, SOURCE_TAG_CLASS, sourceKeyOf } from "@/lib/source-tags";

const weekStartOf = (date: Date) => { const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; }; // weeks start on Sunday
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Weekly assignments: skills assigned or due this week, with Not Started / In Progress / Completed / Overdue. */
export default async function WeeklyAssignmentsPage({ searchParams }: { searchParams: Promise<{ week?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const w = sp.week;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(w ?? "") ? weekStartOf(new Date(`${w}T00:00:00Z`)) : weekStartOf(new Date());
  const prev = new Date(start.getTime() - 7 * 86_400_000), next = new Date(start.getTime() + 7 * 86_400_000), last = new Date(start.getTime() + 6 * 86_400_000);
  const [rows, drafts] = await Promise.all([weeklyAssignments(repo, actor, start), listAssignDrafts(repo, actor)]);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/teacher/curriculum" className="text-brand-teal hover:underline">← Curriculum</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Weekly Assignments</h1>
      {sp.msg && <p role="status" className="mt-3 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{String(sp.msg).slice(0, 300)}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/teacher/assignments?week=${iso(prev)}`} className="rounded-lg px-3 py-1 ring-1 ring-slate-300">← Previous week</Link>
        <span className="font-semibold">{iso(start)} – {iso(last)}</span>
        <Link href={`/teacher/assignments?week=${iso(next)}`} className="rounded-lg px-3 py-1 ring-1 ring-slate-300">Next week →</Link>
      </div>
      {drafts.length > 0 && (
        <section data-testid="assign-drafts" className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <h2 className="font-semibold text-amber-950">📝 Drafts ({drafts.length}) <span className="text-sm font-normal">— not sent yet; students do not see them</span></h2>
          <ul className="mt-2 divide-y divide-amber-200">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><b>{d.title}</b> <span className="text-slate-600">· {d.spec.studentIds.length ? `${d.spec.studentIds.length} student(s)` : `${d.spec.classIds.length} class(es)`}{d.spec.dueAt ? ` · due ${d.spec.dueAt}` : ""} · saved {d.updatedAt.slice(0, 10)}</span></span>
                <span className="flex gap-2">
                  <form action={sendDraftAction}><input type="hidden" name="draftId" value={d.id} /><button className="rounded-lg bg-teal-700 px-3 py-1.5 font-semibold text-white">▶ Send now</button></form>
                  <form action={deleteDraftAction}><input type="hidden" name="draftId" value={d.id} /><button className="rounded-lg px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200">Delete</button></form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Skill</th><th>Class</th><th>Assigned</th><th>Not started</th><th>In progress</th><th>Completed</th><th>Overdue</th><th>Due</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="p-4 text-slate-600">No assignments created or due this week. Use ⭐ Assign on the Curriculum page.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3"><Link href={`/teacher/assignments/${r.id}`} className="font-semibold text-brand-teal hover:underline">{r.skill}</Link> <span className={`ms-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${SOURCE_TAG_CLASS[sourceKeyOf(r.track)]}`}>{SOURCE_LABEL[sourceKeyOf(r.track)]}</span>{r.scope === "students" && <span className="ms-2 text-xs text-slate-500">selected students</span>}</td>
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
