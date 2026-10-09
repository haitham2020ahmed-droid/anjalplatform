import Link from "next/link";
import type { ClassRow } from "@/server/insights/overview";

/** One row per class: every number is a door (class page, MAP plans, reports, alerts). */
export function ClassRows({ rows, admin }: { rows: ClassRow[]; admin: boolean }) {
  if (!rows.length) return <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No class yet.{admin ? " Import users to create the classes." : " Ask the school admin to add you to your classes."}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[13px] text-slate-500">
            <th className="px-4 py-2.5 font-medium">Class</th>
            {admin && <th className="px-3 py-2.5 font-medium">Teacher</th>}
            <th className="whitespace-nowrap px-3 py-2.5 font-medium">Practised this week</th>
            <th className="px-3 py-2.5 font-medium">MAP Reading</th>
            <th className="px-3 py-2.5 font-medium">MAP plans</th>
            <th className="px-3 py-2.5 font-medium">Alerts</th>
            <th className="px-3 py-2.5 font-medium"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const act = r.students ? Math.round((r.active / r.students) * 100) : 0;
            const n = r.map.below + r.map.on + r.map.above;
            return (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <Link href={`/teacher/classes/${r.id}`} className="font-semibold text-brand-navy hover:underline">{r.name}</Link>
                  <span className="block text-xs text-slate-500">Grade {r.grade} · {r.students} students</span>
                </td>
                {admin && <td className="px-3 py-3 text-slate-700">{r.teachers.join(", ") || <span className="text-red-700">No teacher</span>}</td>}
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2"><span className="block h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${act >= 70 ? "bg-brand-teal" : act >= 40 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${act}%` }} /></span><span className="tabular-nums text-slate-700">{r.active}/{r.students}</span></span>
                </td>
                <td className="px-3 py-3">
                  {!r.map.scored ? <Link href="/teacher/map-rit" className="text-xs text-slate-500 hover:underline">No scores yet</Link> : (
                    <Link href={`/teacher/personal-plan?classId=${r.id}`} className="group block" title={`Below ${r.map.below} · On ${r.map.on} · Above ${r.map.above}`}>
                      <span className="flex h-2 w-28 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <span className="bg-rose-400" style={{ width: `${n ? (r.map.below / n) * 100 : 0}%` }} /><span className="bg-amber-300" style={{ width: `${n ? (r.map.on / n) * 100 : 0}%` }} /><span className="bg-emerald-500" style={{ width: `${n ? (r.map.above / n) * 100 : 0}%` }} />
                      </span>
                      <span className="mt-1 block text-xs text-slate-600 group-hover:text-brand-navy">avg RIT {r.map.avg} · {r.map.below} below · {r.map.above} above</span>
                    </Link>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3"><Link href={`/teacher/map-plans?classId=${r.id}&tab=plans`} className="text-slate-700 hover:text-brand-navy hover:underline"><b className="tabular-nums">{r.plans.sent}</b> sent{r.plans.drafts ? <span className="ms-1 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">{r.plans.drafts} drafts</span> : null}</Link></td>
                <td className="whitespace-nowrap px-3 py-3">{r.alerts ? <Link href="/teacher/alerts" className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{r.alerts} students</Link> : <span className="text-xs text-slate-400">none</span>}</td>
                <td className="px-3 py-3 text-end"><Link href={`/teacher/map-reports?classId=${r.id}`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Reports</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
