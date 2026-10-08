import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { classLevels } from "@/server/curriculum-map/levels";
import { listSkillPlans, planPlaces } from "@/server/curriculum-map/plans";
import { createPlanAction } from "./actions";

export const metadata = { title: "Skill plans" };

/** 🗂️ Skill plans: choose Curriculum Map places, assign them together; students open the plan as a map. */
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const [plans, roster] = await Promise.all([listSkillPlans(repo, actor), classId ? classLevels(repo, actor, classId) : Promise.resolve(null)]);
  const groups = roster ? await planPlaces(repo, actor.schoolId!, roster.grade) : [];
  const units = [...new Set(groups.map((g) => g.unit))];
  const isTeacher = actor.role === "TEACHER";
  const box = "rounded-xl border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: isTeacher ? "/teacher" : "/admin", label: "Back" }} icon="🗂️" title="Skill plans"
        subtitle="Pick places of the Curriculum Map and assign them together. Students open the plan as a map and tap a place to start its questions (Analyze Craft / Respond to Reading are adaptive: Below → On → Above). Print it or save it as PDF to send." />
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {plans.length > 0 && (
        <Section title="Plans" icon="📋" className="mb-6">
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => (
              <li key={p.id}><Link href={`/teacher/plans/${p.id}`} className="lift block rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="font-bold text-brand-navy">{p.title}</p>
                <p className="text-sm text-slate-600">{p.className} · Grade {p.grade} · {p.items} place(s) · {p.students} student(s)</p>
                <p className="text-xs text-slate-400">{p.createdAt}</p>
              </Link></li>
            ))}
          </ul>
        </Section>
      )}
      {isTeacher && roster && (
        <Section title="New plan" icon="➕">
          <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">
            {classes.map((c) => <Link key={String(c.id)} href={`/teacher/plans?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
          </nav>
          <form action={createPlanAction} className="space-y-5">
            <input type="hidden" name="classId" value={classId} />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-2">Title<input name="title" required maxLength={191} placeholder={`Unit 1 plan · ${roster.className}`} className={box} /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Due date (optional)<input type="date" name="dueAt" className={box} /></label>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">Places (Grade {roster.grade})</p>
              {units.map((u, i) => (
                <details key={u} open={i === 0} className="rounded-2xl ring-1 ring-slate-200">
                  <summary className="cursor-pointer px-4 py-2 font-bold text-brand-navy">{u}</summary>
                  <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:grid-cols-3">
                    {groups.filter((g) => g.unit === u).map((g) => (
                      <fieldset key={g.set} className="rounded-xl bg-slate-50 p-3">
                        <legend className="px-1 text-sm font-semibold text-slate-700">{g.set}</legend>
                        {g.places.map((p) => <label key={p.code} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" name="codes" value={p.code} />{p.label}</label>)}
                      </fieldset>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            <fieldset className="text-sm">
              <legend className="font-semibold text-slate-700">Students</legend>
              <div className="mt-1 flex gap-4"><label className="flex items-center gap-2"><input type="radio" name="who" value="class" defaultChecked />Whole class ({roster.students.length})</label><label className="flex items-center gap-2"><input type="radio" name="who" value="some" />Only the students ticked</label></div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">{roster.students.map((s) => <label key={s.id} className="flex items-center gap-2"><input type="checkbox" name="studentIds" value={s.id} />{s.name}</label>)}</div>
            </fieldset>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Questions per place (max)<input type="number" name="max" min={5} max={60} defaultValue={15} className={`${box} w-28`} /></label>
              <button className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-bold text-white shadow hover:bg-brand-purple">🗂️ Assign plan</button>
            </div>
          </form>
        </Section>
      )}
    </AppShell>
  );
}
