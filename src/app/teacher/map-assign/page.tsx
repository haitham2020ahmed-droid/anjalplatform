import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { accessibleClasses } from "@/server/teacher/assign";
import { classLevels, LEVEL_NAMES, previewMapAssign, type ClassLevels, type MapAssignPreview } from "@/server/curriculum-map/levels";
import { assignFromMapAction } from "../levels-actions";

/** ⭐ Assign a Curriculum Map category by level: each student gets the questions of their own level. */
export default async function MapAssignPage({ searchParams }: { searchParams: Promise<{ code?: string; classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const code = String(sp.code ?? "").toUpperCase();
  const classes = await accessibleClasses(repo, actor);
  const grades = await repo.findMany("Grade", { id: { in: classes.map((c) => c.gradeId) } });
  const gradeOf = (c: Record<string, unknown>) => Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0);
  const wanted = Number(code.match(/^G(\d+)\./)?.[1] ?? 0);
  const fit = classes.filter((c) => gradeOf(c) === wanted).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = fit.some((c) => c.id === sp.classId) ? String(sp.classId) : fit[0] ? String(fit[0].id) : "";
  let p: MapAssignPreview | null = null, error: string | null = null;
  try { if (classId) p = await previewMapAssign(repo, actor, classId, code); } catch (e) { if (e instanceof ValidationError) error = e.message; else throw e; }
  const roster: ClassLevels | null = classId ? await classLevels(repo, actor, classId) : null;
  const oneLevel = Boolean(p && p.levels.length === 1 && p.levels[0].level);
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={`/admin/curriculum-map?grade=${wanted || ""}`} className="text-brand-teal hover:underline">← Curriculum Map</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy"><span aria-hidden="true">⭐</span> Assign from the Curriculum Map</h1>
      <p className="mt-1 text-sm text-slate-600">To choose single questions instead, use <a href={`/admin/questions?status=PUBLISHED&map=${code}`} className="font-semibold text-brand-teal underline">☆ Choose questions</a>.</p>
      {sp.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!fit.length ? <p className="mt-4 text-slate-600">You do not teach a Grade {wanted} class.</p> : (
        <>
          <nav aria-label="Classes" className="mt-4 flex flex-wrap gap-2">
            {fit.map((c) => <Link key={String(c.id)} href={`/teacher/map-assign?code=${code}&classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
          </nav>
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}
          {p && (
            <form action={assignFromMapAction} className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <input type="hidden" name="classId" value={classId} /><input type="hidden" name="code" value={code} />
              <p className="text-sm text-slate-500">{p.place}</p>
              <h2 className="text-xl font-bold text-brand-navy">{p.category}</h2>
              <table className="mt-3 w-full max-w-xl text-left text-sm">
                <thead><tr className="border-b text-slate-500"><th className="py-2">Level</th><th>Students</th><th>Questions on the map</th></tr></thead>
                <tbody>{p.levels.map((l) => (
                  <tr key={l.level ?? "all"} className="border-b last:border-0"><td className="py-2 font-medium">{l.level ? LEVEL_NAMES[l.level] : "All students"}</td><td className="tabular-nums">{l.students}</td><td className={`tabular-nums ${l.questions ? "" : "font-semibold text-amber-800"}`}>{l.questions}{!l.questions && l.students ? " (will use On Level)" : ""}</td></tr>
                ))}</tbody>
              </table>
              {p.studentsWithoutLevel > 0 && <p className="mt-2 text-sm text-amber-900">{p.studentsWithoutLevel} student(s) have no level yet and will get On Level questions. <Link href={`/teacher/levels?classId=${classId}`} className="underline">Set levels</Link></p>}
              {roster && (
                <fieldset className="mt-4">
                  <legend className="text-sm font-semibold text-slate-700">Assign to</legend>
                  <div className="mt-1 flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="radio" name="who" value="class" defaultChecked />Entire class ({roster.students.length})</label>
                    <label className="flex items-center gap-2"><input type="radio" name="who" value="students" />Only the students ticked below</label>
                  </div>
                  <details className="mt-2 rounded-xl p-3 ring-1 ring-slate-200">
                    <summary className="cursor-pointer text-sm font-semibold text-brand-navy">Choose students (with their levels)</summary>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {roster.students.map((st) => (
                        <label key={st.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="studentIds" value={st.id} />{st.name}
                          <span className={`rounded px-1.5 text-xs ${st.level === "ABOVE" ? "bg-emerald-100 text-emerald-800" : st.level === "BELOW" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-600"}`}>{st.level ? LEVEL_NAMES[st.level] : "no level"}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </fieldset>
              )}
              {oneLevel && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">This is one level ({LEVEL_NAMES[p.levels[0].level!]}): everyone you choose gets its questions, whatever their own level.</p>}
              {!oneLevel && p.levels.some((l) => l.level) && (
                <fieldset className="mt-4">
                  <legend className="text-sm font-semibold text-slate-700">How</legend>
                  <div className="mt-1 grid gap-2 md:grid-cols-2 text-sm">
                    <label className="flex gap-2 rounded-xl p-3 ring-1 ring-slate-200 has-[:checked]:bg-emerald-50 has-[:checked]:ring-emerald-400"><input type="radio" name="mode" value="ADAPTIVE" defaultChecked /><span><b>🔁 Adaptive (recommended)</b><br />Starts at Below Level (or the student’s Lexile / level), moves up to On and Above after 4 of 5 correct, and back down when struggling.</span></label>
                    <label className="flex gap-2 rounded-xl p-3 ring-1 ring-slate-200 has-[:checked]:bg-sky-50 has-[:checked]:ring-sky-400"><input type="radio" name="mode" value="BY_LEVEL" /><span><b>Fixed by level</b><br />Each student gets the questions of their current level only.</span></label>
                  </div>
                </fieldset>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
                <label className="flex flex-col">Questions per student (max)<input type="number" name="max" min={1} max={50} defaultValue={20} className={`${box} w-28`} /></label>
                <label className="flex flex-col">Start date (optional)<input type="date" name="startAt" className={box} /></label>
                <label className="flex flex-col">Due date (optional)<input type="date" name="dueAt" className={box} /></label>
                <label className="flex min-w-[16rem] flex-1 flex-col">Note to students (optional)<input name="note" maxLength={1000} className={box} /></label>
              </div>
              <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">⭐ Assign to the class (by level)</button>
            </form>
          )}
        </>
      )}
    </AppShell>
  );
}
