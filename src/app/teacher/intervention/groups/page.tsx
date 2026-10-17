import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classInterventions } from "@/server/insights/interventions";
import { startInterventionAction } from "./actions";
import { Combo } from "@/components/ui/combo";
import { masterSkills } from "@/server/skills/master";

export const metadata = { title: "Intervention groups" };

/**
 * 🎯 Intervention groups with measured impact: choose students and one skill for a period; the platform keeps
 * their mastery at the start, shows the change while it runs, and reports the result at the end.
 */
export default async function InterventionGroupsPage({ searchParams }: { searchParams: Promise<{ class?: string; students?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.class) ?? classes[0];
  const picked = new Set(String(sp.students ?? "").split(",").filter(Boolean));
  const list = klass ? await classInterventions(repo, actor, String(klass.id)) : [];
  const members = klass ? await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] }) : [];
  const st = members.length ? await repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } }, { select: ["id", "userId"] }) : [];
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const students = st.map((x) => ({ id: String(x.id), name: String(users.find((u) => u.id === x.userId)?.displayName ?? "Student") })).sort((a, b) => a.name.localeCompare(b.name));
  // 🎯 the whole skill bank (every grade, Grammar, Vocabulary, Reading…), not just this class's own curriculum:
  // an intervention often targets a skill below (or above) the student's grade level.
  const skills = klass ? await masterSkills(repo, String(klass.schoolId ?? actor.schoolId)) : [];
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/learning-loop", label: "Learning Loop" }} icon="🎯" title="Intervention groups"
        subtitle="Choose a small group and one skill. The platform saves each student's mastery now, shows the change while the group runs, and tells you the result at the end — so you know what works." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/intervention/groups?class=${c.id}`} className={chip(c.id === klass?.id)}>{String(c.name)}</Link>)}</nav>
      {klass && (
        <form action={startInterventionAction} className="mt-5 space-y-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Start a group · {String(klass.name)}</h2>
          <input type="hidden" name="classId" value={String(klass.id)} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Skill<Combo name="skillId" required label="Skill" options={skills.map((k) => ({ value: k.id, label: k.name, group: `Grade ${k.grade}`, hint: k.kind !== "OTHER" ? k.kind : undefined }))} className="mt-1" /></label>
            <label className="text-sm">Days<input type="number" name="days" min={3} max={42} defaultValue={14} className="mt-1 block w-full rounded-lg border-slate-300" /></label>
            <label className="text-sm">Name (optional)<input name="title" maxLength={120} className="mt-1 block w-full rounded-lg border-slate-300" placeholder="Theme small group" /></label>
          </div>
          <fieldset><legend className="text-sm font-semibold text-slate-700">Students</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-3">{students.map((x) => <label key={x.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="studentId" value={x.id} defaultChecked={picked.has(x.id)} /><bdi>{x.name}</bdi></label>)}</div>
          </fieldset>
          <button className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">🎯 Start the group</button>
        </form>
      )}
      <section className="mt-6 space-y-4">
        {list.map((v) => (
          <article key={v.id} className={`rounded-3xl p-5 ring-1 ${v.status === "DONE" ? "bg-slate-50 ring-slate-200" : "bg-white ring-indigo-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-brand-navy">{v.title} <span className="text-sm font-normal text-slate-500">· {v.skillName}</span></h3>
              <span className="text-sm text-slate-600">{v.startedAt} → {v.endsAt} · {v.status === "DONE" ? "✅ finished" : `${v.daysLeft} day(s) left`}</span>
            </div>
            <p className="mt-1 text-sm"><b className={v.avgChange > 0 ? "text-emerald-700" : v.avgChange < 0 ? "text-red-700" : "text-slate-700"}>{v.avgChange > 0 ? "+" : ""}{v.avgChange} average mastery</b> · {v.improved} of {v.total} improved by 5+</p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{v.students.map((x) => <li key={x.id} className="flex justify-between rounded-lg bg-white px-3 py-1 ring-1 ring-slate-100"><bdi>{x.name}</bdi><span className="tabular-nums text-slate-600">{x.before} → {x.now} <b className={x.change > 0 ? "text-emerald-700" : x.change < 0 ? "text-red-700" : ""}>({x.change > 0 ? "+" : ""}{x.change})</b></span></li>)}</ul>
          </article>
        ))}
        {!list.length && <p className="text-slate-600">No intervention groups in this class yet.</p>}
      </section>
    </AppShell>
  );
}
