import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { classLevels, LEVEL_NAMES } from "@/server/curriculum-map/levels";
import { giveTestAction, saveLevelsAction, saveLexileBandsAction } from "../levels-actions";
import { can } from "@/server/auth/rbac";
import { LEXILE_SOURCE, lexileBands } from "@/server/curriculum-map/lexile";

/** 🎯 Student levels (Above / On / Below) + Placement test and MAP practice test for a class. */
export default async function LevelsPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "students:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await classLevels(repo, actor, classId) : null;
  const isTeacher = actor.role === "TEACHER";
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  const bands = await lexileBands(repo, actor.schoolId ?? null);
  const editBands = actor.role !== "TEACHER" && can(actor, "settings:school");
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={isTeacher ? "/teacher" : "/admin"} className="text-brand-teal hover:underline">← Back</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy"><span aria-hidden="true">🎯</span> Student levels &amp; tests</h1>
      <p className="mt-1 max-w-3xl text-slate-600">Each student’s level decides which Curriculum Map questions they get (Above / On / Below Level). Set it here, or give the Placement test: its score sets the level automatically (80%+ Above, 50–79% On, under 50% Below).</p>
      {sp.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!v ? <p className="mt-6 text-slate-600">No classes yet.</p> : (
        <>
          <nav aria-label="Classes" className="mt-4 flex flex-wrap gap-2">
            {classes.map((c) => <Link key={String(c.id)} href={`/teacher/levels?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
          </nav>
          {isTeacher && (
            <section className="mt-5 grid gap-4 md:grid-cols-2">
              {([["PLACEMENT", "📝 Placement test", "Sets each student’s level from the score. Uses questions marked “Placement”."], ["MAP_TEST", "🗺️ MAP practice test", "Results by MAP goal area. Uses questions marked “MAP test”."]] as const).map(([kind, title, text]) => (
                <form key={kind} action={giveTestAction} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                  <input type="hidden" name="classId" value={classId} /><input type="hidden" name="kind" value={kind} />
                  <h2 className="text-lg font-bold text-brand-navy">{title}</h2>
                  <p className="text-sm text-slate-600">{text}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
                    <label className="flex flex-col">Questions<input type="number" name="questions" min={5} max={50} defaultValue={20} className={`${box} w-24`} /></label>
                    <label className="flex flex-col">Due date (optional)<input type="date" name="dueAt" className={box} /></label>
                    <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Give to {v.className}</button>
                  </div>
                </form>
              ))}
            </section>
          )}
          <form action={saveLevelsAction} className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <input type="hidden" name="classId" value={classId} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-brand-navy">{v.className} · Grade {v.grade} · {v.students.length} students</h2>
              <p className="text-sm text-slate-600">{(["ABOVE", "ON", "BELOW"] as const).map((l) => `${LEVEL_NAMES[l]}: ${v.students.filter((x) => x.level === l).length}`).join(" · ")} · Not set: {v.students.filter((x) => !x.level).length}</p>
            </div>
            <table className="mt-3 w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-2">Student</th><th>Level</th><th>Set by</th></tr></thead>
              <tbody>{v.students.map((x) => (
                <tr key={x.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{x.name}</td>
                  <td><select name={`level:${x.id}`} defaultValue={x.level ?? ""} aria-label={`Level of ${x.name}`} className="rounded-lg border border-slate-300 px-2 py-1"><option value="">Not set (On Level)</option><option value="ABOVE">Above Level</option><option value="ON">On Level</option><option value="BELOW">Below Level</option></select></td>
                  <td className="text-slate-500">{x.source === "PLACEMENT" ? "Placement test" : x.source === "TEACHER" ? "Teacher" : x.source === "MAP_RIT" ? "MAP RIT (class average)" : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
            <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">Save levels</button>
          </form>
        </>
      )}
      <form action={saveLexileBandsAction} className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">Lexile bands (Below / On / Above Level)</h2>
        <p className="text-sm text-slate-600">A text (or a student) under the On Level band is Below Level, above it Above Level. Source: {LEXILE_SOURCE}.</p>
        <table className="mt-3 text-sm">
          <thead><tr className="text-slate-500"><th className="pe-4 text-left">Grade</th><th className="px-2 text-left">Below Level</th><th className="px-2 text-left">On Level</th><th className="px-2 text-left">Above Level</th></tr></thead>
          <tbody>{[4, 5, 6].map((g) => (
            <tr key={g}><td className="pe-4 font-semibold">{g}</td><td className="px-2">&lt; {bands[g].onMin}L</td>
              <td className="px-2 py-1">{editBands ? <><input name={`min:${g}`} type="number" defaultValue={bands[g].onMin} aria-label={`Grade ${g} On Level from`} className="w-20 rounded-md border border-slate-300 px-2 py-1" />–<input name={`max:${g}`} type="number" defaultValue={bands[g].onMax} aria-label={`Grade ${g} On Level to`} className="w-20 rounded-md border border-slate-300 px-2 py-1" />L</> : `${bands[g].onMin}–${bands[g].onMax}L`}</td>
              <td className="px-2">&gt; {bands[g].onMax}L</td></tr>
          ))}</tbody>
        </table>
        {editBands && <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">Save Lexile bands</button>}
      </form>
    </AppShell>
  );
}
