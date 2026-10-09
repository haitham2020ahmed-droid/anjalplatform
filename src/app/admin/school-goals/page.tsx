import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { GoalsTable } from "@/components/home/goals-table";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { goalProgress, schoolGoals } from "@/server/admin/school-goals";
import { planPlaces } from "@/server/curriculum-map/plans";
import { saveGoalsAction, sendGradePlanAction } from "./actions";

export const metadata = { title: "School Goals" };

/** 🎯 School goals (every teacher sees them) and the full curriculum plan for a whole grade. */
export default async function SchoolGoalsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const goals = await schoolGoals(repo, actor.schoolId!);
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
  const unitsOf = new Map(await Promise.all(grades.map(async (g) => [g, [...new Set((await planPlaces(repo, actor.schoolId!, g)).map((x) => x.unit))]] as const)));
  const classes = (await repo.findMany("Class", { schoolId: actor.schoolId, deletedAt: null })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const progress = await goalProgress(repo, actor, classes);
  const rows = [...goals.units, ...Array.from({ length: Math.max(0, 8 - goals.units.length) }, () => null)].slice(0, 8);
  const box = "rounded-xl border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🎯" title="School Goals" subtitle="Set the school’s goals once: every teacher sees them on their home page with their class’s progress, and students see the weekly goal." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <Section title="This Week · All Classes" icon="📊" className="mb-6"><GoalsTable data={progress} /></Section>
      <Section title="Goals" icon="🎯" className="mb-6">
        <form action={saveGoalsAction} className="space-y-5">
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Practice minutes a week (per student)<input type="number" name="minutes" min={10} max={600} defaultValue={goals.weeklyMinutes} className={`${box} w-32`} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Plan parts a week (per student)<input type="number" name="parts" min={1} max={20} defaultValue={goals.weeklyParts} className={`${box} w-32`} /></label>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Unit targets <span className="font-normal text-slate-500">— e.g. 80% of Grade 4 finish Unit 1 by 15 November</span></p>
            <div className="mt-2 space-y-2">
              {rows.map((u, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <select name={`g-${i}`} defaultValue={u?.grade ?? grades[0]} className={box} aria-label="Grade">{grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select>
                  <input name={`u-${i}`} list={`units-${i}`} defaultValue={u?.unit ?? ""} placeholder="Unit 1" className={`${box} w-56`} aria-label="Unit" />
                  <datalist id={`units-${i}`}>{[...new Set([...unitsOf.values()].flat())].map((x) => <option key={x} value={x.replace(/:.*/, "")} />)}</datalist>
                  <span className="flex items-center gap-1"><input type="number" name={`p-${i}`} min={10} max={100} defaultValue={u?.pct ?? 80} className={`${box} w-20`} aria-label="Share of students" />% of students by</span>
                  <input type="date" name={`d-${i}`} defaultValue={u?.by ?? ""} className={box} aria-label="Date" />
                </div>
              ))}
            </div>
          </div>
          <button className="rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">Save goals</button>
        </form>
      </Section>
      <Section title="Full Curriculum Plan for a Whole Grade" icon="📘" tone="emerald" hint="Every class of the grade gets the whole year in its students’ My Plans (classes that have it already are updated). Parts open when a student taps them.">
        <form action={sendGradePlanAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Grade<select name="grade" className={box}>{grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Correct answers to finish a part<input type="number" name="target" min={5} max={50} defaultValue={20} className={`${box} w-28`} /></label>
          <button className="rounded-xl bg-brand-teal px-6 py-2.5 font-bold text-white hover:bg-brand-navy">📘 Send to every class of the grade</button>
        </form>
      </Section>
    </AppShell>
  );
}
