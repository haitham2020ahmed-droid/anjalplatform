import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolPerformance } from "@/server/admin/performance";

const val = (v: number | null, suffix = "%") => (v === null ? "—" : `${v}${suffix}`);
const tone = (v: number | null) => (v === null ? "text-slate-500" : v >= 75 ? "text-teal-800" : v >= 50 ? "text-amber-800" : "text-red-700");

/** Admin: teachers', classes' and students' performance at a glance. */
export default async function PerformancePage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "analytics:school" });
  const me = (await getActor())!.user;
  const p = await schoolPerformance(repo, actor);
  const t = p.totals;
  const tile = (label: string, value: string, cls = "text-brand-navy") => <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{label}</dt><dd className={`text-2xl font-bold ${cls}`}>{value}</dd></div>;
  const th = "p-3 font-medium";
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin" className="text-brand-teal hover:underline">← Administration</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Teacher &amp; student performance</h1>
      <p className="mt-1 text-slate-600">Mastery is the students' average across the skills they practised. Completion is the share of assigned work completed.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile("Teachers", String(t.teachers))}{tile("Classes", String(t.classes))}{tile("Students", String(t.students))}{tile("Active this week", `${t.activeThisWeek} of ${t.students}`)}
        {tile("Average mastery", val(t.avgMastery), tone(t.avgMastery))}{tile("Assignments", String(t.assignments))}{tile("Completion", val(t.completion), tone(t.completion))}{tile("Overdue work", String(t.overdue), t.overdue ? "text-red-700" : "text-brand-navy")}
      </dl>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-brand-navy">Teachers</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className={th}>Teacher</th><th>Classes</th><th>Students</th><th>Assignments</th><th>Completion</th><th>Overdue</th><th>Students' mastery</th></tr></thead>
            <tbody>
              {p.teachers.length === 0 && <tr><td colSpan={7} className="p-4 text-slate-600">No teachers are linked to classes yet.</td></tr>}
              {p.teachers.map((x) => (
                <tr key={x.name + x.classes.join()} className="border-b last:border-0">
                  <td className="p-3 font-medium">{x.name}</td><td>{x.classes.join(", ") || "—"}</td><td className="tabular-nums">{x.students}</td><td className="tabular-nums">{x.assignments}</td>
                  <td className={`tabular-nums ${tone(x.completion)}`}>{val(x.completion)}</td><td className={`tabular-nums ${x.overdue ? "font-semibold text-red-700" : ""}`}>{x.overdue}</td><td className={`tabular-nums ${tone(x.avgMastery)}`}>{val(x.avgMastery)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-brand-navy">Classes</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className={th}>Class</th><th>Grade</th><th>Teachers</th><th>Students</th><th>Active this week</th><th>Mastery</th><th>Completion</th><th>Overdue</th></tr></thead>
            <tbody>{p.classes.map((c) => (
              <tr key={c.name + c.grade} className="border-b last:border-0">
                <td className="p-3 font-medium">{c.name}</td><td>{c.grade}</td><td>{c.teachers.join(", ") || "—"}</td><td className="tabular-nums">{c.students}</td><td className="tabular-nums">{c.activeThisWeek}</td>
                <td className={`tabular-nums ${tone(c.avgMastery)}`}>{val(c.avgMastery)}</td><td className={`tabular-nums ${tone(c.completion)}`}>{val(c.completion)}</td><td className={`tabular-nums ${c.overdue ? "font-semibold text-red-700" : ""}`}>{c.overdue}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-bold text-brand-navy">Skills needing the most work</h2>
          <ul className="mt-2 divide-y rounded-2xl bg-white ring-1 ring-slate-200">
            {p.weakSkills.length === 0 && <li className="p-4 text-sm text-slate-600">Not enough practice yet.</li>}
            {p.weakSkills.map((k) => <li key={k.name + k.grade} className="flex items-center justify-between gap-3 p-3 text-sm"><span>G{k.grade} · {k.name} <span className="text-slate-500">({k.students} students)</span></span><span className={`font-semibold tabular-nums ${tone(k.avgMastery)}`}>{k.avgMastery}%</span></li>)}
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-bold text-brand-navy">Students who need attention</h2>
          <p className="text-sm text-slate-600">Mastery under 40% or 2+ overdue assignments.</p>
          <ul className="mt-2 divide-y rounded-2xl bg-white ring-1 ring-slate-200">
            {p.attention.length === 0 && <li className="p-4 text-sm text-slate-600">No student needs attention right now.</li>}
            {p.attention.map((x) => <li key={x.name + x.className} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span className="font-medium">{x.name} <span className="font-normal text-slate-500">{x.className}</span></span><span className="tabular-nums text-slate-700">mastery {val(x.avgMastery)} · {x.overdue} overdue · {x.lastActive ? `active ${x.lastActive.slice(0, 10)}` : "not active this week"}</span></li>)}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
