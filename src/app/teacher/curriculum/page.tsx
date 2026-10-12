import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { NO_CURRICULUM_MESSAGE, teacherCurriculum, type CurriculumSkill } from "@/server/teacher/assign";
import { AssignDialog } from "../assign-dialog";
import { AssignHostAll } from "../assign-host-all";
import { CcssNote } from "@/components/ccss-note";
import { SkillQuestionPicker } from "@/components/skill-picker";

/**
 * Teacher's organized view for one class, in two areas taught in class:
 * 📘 Curriculum (Grade → Unit → Skill → Standard) and 🗺️ MAP (MAP Growth goal area → Skill).
 * ⭐ Assign on every skill; “View questions” opens the skill's questions here (text, choices, level, answer).
 * Skills show their name only (no grade tags).
 */
export default async function TeacherCurriculumPage({ searchParams }: { searchParams: Promise<{ classId?: string; area?: string; grade?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  // access rules: any grade's curriculum may be viewed (and its skills assigned to this teacher's own class)
  const view = await teacherCurriculum(repo, actor, sp.classId, { grade: /^\d{1,2}$/.test(String(sp.grade ?? "")) ? Number(sp.grade) : null });
  // MAP or NAFS: skills grouped by area with the ONE shared question count; any grade's skills may be viewed
  const nafs = sp.area === "nafs";
  const map = !nafs;
  const canAssign = actor.role === "TEACHER";
  const href = (o: { classId?: string; area?: string; grade?: number }) => {
    const p = new URLSearchParams();
    const c = o.classId ?? view?.classId; if (c) p.set("classId", c);
    const a = o.area ?? (map ? "map" : ""); if (a) p.set("area", a);
    const g = o.grade ?? (o.classId ? undefined : view?.viewGrade?.level); if (g !== undefined) p.set("grade", String(g));
    return `/teacher/curriculum?${p}`;
  };
  const row = (k: CurriculumSkill) => (
    <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
      <div>
        <p className="font-medium text-slate-900">{k.name}</p>
        <p className="text-xs text-slate-500">{k.standards.join(", ") || "No standard"}{k.lessons.length ? ` · Lessons ${k.lessons.join(", ")}` : ""}{k.openAssignments ? ` · assigned (${k.openAssignments} open)` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canAssign && <Link href={`/teacher/skill-assign?${new URLSearchParams({ skillId: k.id, classId: view!.classId })}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal" title="Questions linked to the lesson, the same skill and the same standard; assign practice at each student’s level or a ready set">🔎 Questions from the bank</Link>}
        {canAssign && (k.questions > 0 ? <AssignDialog skill={k} /> : <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">This skill has no questions yet.</span>)}
      </div>
      <details className="w-full">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">View questions ({k.questions})</summary>
        <div className="mt-2"><SkillQuestionPicker skillId={k.id} mode="view" name={null} defaultOpen /></div>
      </details>
    </li>
  );
  const tab = (active: boolean) => `flex items-center gap-2 rounded-2xl px-5 py-3 text-lg font-bold ${active ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/teacher" className="text-brand-teal hover:underline">← My classes</Link></p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy"><span aria-hidden="true">{map ? "🗺️" : "🇸🇦"}</span> {map ? "MAP" : "NAFS"}{view ? `: ${view.viewGrade?.name ?? view.grade.name}` : ""}</h1>
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
          {view.grades && view.grades.length > 1 && (
            <nav aria-label="Grade" className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">Show skills of:</span>
              {view.grades.map((g) => (
                <Link key={g.level} href={href({ grade: g.level })} aria-current={g.level === view.viewGrade?.level ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${g.level === view.viewGrade?.level ? "bg-brand-teal text-white" : "bg-white ring-1 ring-slate-200"}`}>{g.name}{g.skills ? "" : " (no curriculum yet)"}</Link>
              ))}
            </nav>
          )}
          {view.noCurriculum && <p role="status" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 font-medium text-amber-900 ring-1 ring-amber-200">{NO_CURRICULUM_MESSAGE}. <Link href="/teacher/plans" className="underline">Open Plans</Link> or choose a grade above.</p>}
          {(
            <nav aria-label="Area" className="mt-5 flex flex-wrap gap-3">
              <Link href={href({ area: "map" })} aria-current={map ? "page" : undefined} className={tab(map)}><span aria-hidden="true" className="text-2xl">🗺️</span> MAP</Link>
              <Link href={href({ area: "nafs" })} aria-current={nafs ? "page" : undefined} className={tab(nafs)}><span aria-hidden="true" className="text-2xl">🇸🇦</span> NAFS</Link>
            </nav>
          )}
          <CcssNote className="mt-4" />
          <p className="mt-3 text-sm text-slate-600">{view.students.length} students. {map ? "Skills grouped by MAP Growth goal area. Work assigned here appears under 🗺️ MAP skills for students." : "Skills grouped by NAFS area. Work assigned here appears under NAFS skills for students."}</p>
          {!map && (
            <>
              {(view.nafsAreas ?? []).length === 0 && <p className="mt-4 rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">No skills of this grade are linked to a NAFS area yet. {actor.role !== "TEACHER" && <Link href="/admin/nafs-links" className="font-semibold text-brand-teal underline">Link them</Link>}</p>}
              {(view.nafsAreas ?? []).map((a) => (
                <section key={a.code} className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-teal-200" aria-labelledby={`n-${a.code}`}>
                  <h2 id={`n-${a.code}`} className="flex items-center gap-2 text-lg font-bold text-brand-navy"><span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">NAFS</span>{a.name}</h2>
                  <ul className="mt-2 divide-y divide-slate-100">{a.skills.map(row)}</ul>
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
      {canAssign && view && <AssignHostAll classId={view.classId} className={view.classes.find((c) => c.id === view.classId)?.name ?? ""} students={view.students} track={map ? "MAP" : "NAFS"} />}
    </AppShell>
  );
}
