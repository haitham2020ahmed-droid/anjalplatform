import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherCurriculum, type CurriculumSkill } from "@/server/teacher/assign";
import { AssignDialog } from "../assign-dialog";
import { CcssNote } from "@/components/ccss-note";

/**
 * Teacher's organized view for one class, in two areas taught in class:
 * 📘 Curriculum (Grade → Unit → Skill → Standard) and 🗺️ MAP (MAP Growth goal area → Skill).
 * ⭐ Assign on every skill; “View questions” opens the skill's questions to star and assign.
 */
export default async function TeacherCurriculumPage({ searchParams }: { searchParams: Promise<{ classId?: string; area?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const view = await teacherCurriculum(repo, actor, sp.classId);
  const canAssign = actor.role === "TEACHER";
  // MAP only: curriculum work is done from the Curriculum Map and the Question Bank
  const map = true; void sp.area;
  const href = (o: { classId?: string; area?: string }) => {
    const p = new URLSearchParams();
    const c = o.classId ?? view?.classId; if (c) p.set("classId", c);
    const a = o.area ?? (map ? "map" : ""); if (a) p.set("area", a);
    return `/teacher/curriculum?${p}`;
  };
  const row = (k: CurriculumSkill) => (
    <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
      <div>
        <p className="font-medium text-slate-900">{k.name}</p>
        <p className="text-xs text-slate-500">{k.standards.join(", ") || "No standard"}{k.lessons.length ? ` · Lessons ${k.lessons.join(", ")}` : ""}{k.openAssignments ? ` · assigned (${k.openAssignments} open)` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/admin/questions?status=PUBLISHED&grade=${view!.grade.level}&skill=${k.id}${map ? "&track=map" : ""}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal" title="Open these questions; star ⭐ the ones you want and assign them">View questions ({k.questions})</a>
        {canAssign && <AssignDialog classId={view!.classId} className={view!.classes.find((c) => c.id === view!.classId)!.name} skill={k} students={view!.students} track={map ? "MAP" : "CURRICULUM"} />}
      </div>
    </li>
  );
  const tab = (active: boolean) => `flex items-center gap-2 rounded-2xl px-5 py-3 text-lg font-bold ${active ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/teacher" className="text-brand-teal hover:underline">← My classes</Link></p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy"><span aria-hidden="true">🗺️</span> MAP{view ? `: ${view.grade.name}` : ""}</h1>
        <Link href="/teacher/assignments" className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Weekly assignments</Link>
      </div>
      {!view ? <p className="mt-4 text-slate-600">You do not teach any class yet.</p> : (
        <>
          <nav aria-label="Classes" className="mt-4 flex flex-wrap gap-2">
            {view.classes.map((c) => (
              <Link key={c.id} href={href({ classId: c.id })} aria-current={c.id === view.classId ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === view.classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{c.name} · G{c.grade}</Link>
            ))}
          </nav>
          {void tab}
          <CcssNote className="mt-4" />
          <p className="mt-3 text-sm text-slate-600">{view.students.length} students. {map ? "Skills grouped by MAP Growth goal area. Work assigned here appears under 🗺️ MAP skills for students." : "Skills by book unit. Work assigned here appears under 📘 Curriculum skills for students."}</p>
          {!map && (
            <>
              {view.units.length === 0 && <p className="mt-4 text-slate-600">This grade has no units yet.</p>}
              {view.units.map((u) => (
                <section key={u.id} className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200" aria-labelledby={`u-${u.id}`}>
                  <h2 id={`u-${u.id}`} className="text-lg font-bold text-brand-navy">Unit {u.number}: {u.title}</h2>
                  {u.skills.length === 0 ? <p className="mt-2 text-sm text-slate-600">No skills in this unit.</p> : <ul className="mt-2 divide-y divide-slate-100">{u.skills.map(row)}</ul>}
                </section>
              ))}
            </>
          )}
          {map && (
            <>
              {view.mapAreas.length === 0 && <p className="mt-4 rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">No skills of this grade are linked to a MAP goal area yet.</p>}
              {view.mapAreas.map((a) => (
                <section key={a.code} className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-emerald-200" aria-labelledby={`m-${a.code}`}>
                  <h2 id={`m-${a.code}`} className="flex items-center gap-2 text-lg font-bold text-brand-navy"><span aria-hidden="true">🗺️</span>{a.name}</h2>
                  <ul className="mt-2 divide-y divide-slate-100">{a.skills.map(row)}</ul>
                </section>
              ))}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
