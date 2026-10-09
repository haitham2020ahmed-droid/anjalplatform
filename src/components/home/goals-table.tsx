import Link from "next/link";
import type { ClassGoalRow, SchoolGoals } from "@/server/admin/school-goals";

const bar = (v: number, goal: number) => { const p = Math.min(100, Math.round((100 * v) / Math.max(1, goal))); return <span className="flex items-center gap-2"><span className="block h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${p >= 100 ? "bg-emerald-500" : p >= 60 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${p}%` }} /></span></span>; };

/** 🎯 Each class against the school goals (this week, and its grade's unit targets). */
export function GoalsTable({ data }: { data: { goals: SchoolGoals; rows: ClassGoalRow[] } }) {
  const { goals, rows } = data;
  if (!rows.length) return <p className="text-slate-600">No class yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2">Class</th><th>Minutes / student <span className="font-normal">(goal {goals.weeklyMinutes})</span></th><th>Parts / student <span className="font-normal">(goal {goals.weeklyParts})</span></th><th>Unit targets</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.classId} className="border-b border-slate-100 align-top">
              <td className="py-2.5"><Link href={`/teacher/classes/${r.classId}`} className="font-semibold text-brand-navy hover:underline">{r.className}</Link><span className="block text-xs text-slate-500">Grade {r.grade} · {r.students} students</span></td>
              <td className="py-2.5"><span className="flex items-center gap-2">{bar(r.minutes, goals.weeklyMinutes)}<b className="tabular-nums">{r.minutes}</b></span></td>
              <td className="py-2.5"><span className="flex items-center gap-2">{bar(r.parts, goals.weeklyParts)}<b className="tabular-nums">{r.parts}</b></span></td>
              <td className="py-2.5">{r.units.length ? <ul className="space-y-1">{r.units.map((u) => <li key={u.unit} className="flex flex-wrap items-center gap-2"><span className="text-slate-700">{u.unit}</span>{bar(u.pct, u.target)}<span className="tabular-nums text-xs"><b>{u.pct}%</b> / {u.target}% · {u.daysLeft >= 0 ? `${u.daysLeft} days left` : `ended ${u.by}`}</span></li>)}</ul> : <span className="text-xs text-slate-400">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
