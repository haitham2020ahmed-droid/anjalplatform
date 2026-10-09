import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { classLevels } from "@/server/curriculum-map/levels";
import { giveTestAction, saveLevelsAction, saveLexileBandsAction } from "../levels-actions";
import { can } from "@/server/auth/rbac";
import { LEXILE_SOURCE, lexileBands } from "@/server/curriculum-map/lexile";
import { PageHeader } from "@/components/page-header";
import { LevelBoard, type BoardStudent } from "@/components/teacher/level-board";
import { EVIDENCE_NAME, suggestLevels } from "@/server/curriculum-map/auto-levels";

export const metadata = { title: "Levels & tests" };

/** 🎯 Student levels (Above / On / Below) + Placement test and MAP practice test for a class. */
export default async function LevelsPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string; auto?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "students:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await classLevels(repo, actor, classId) : null;
  const auto = sp.auto === "1";
  const sug = classId ? await suggestLevels(repo, actor, classId) : null;
  const sugOf = new Map((sug?.rows ?? []).map((r) => [r.studentId, r]));
  const noData = v ? v.students.filter((x) => !x.level && sugOf.get(x.id)?.from === "NO_DATA").length : 0;
  const SRC: Record<string, string> = { PLACEMENT: "Diagnostic Test", TEACHER: "Set by you", MAP_RIT: "MAP", ADAPTIVE: "Their work" };
  const board: BoardStudent[] = (v?.students ?? []).map((x) => {
    const sg = sugOf.get(x.id);
    const start = auto && sg ? sg.suggested : x.level ?? "ON";
    return { id: x.id, name: x.name, start, original: x.level, tag: !x.level && sg?.from === "NO_DATA" ? "No data" : null,
      note: auto && sg ? `${EVIDENCE_NAME[sg.from]}: ${sg.reason}` : x.source ? SRC[x.source] ?? x.source : sg && sg.from !== "NO_DATA" ? `Suggested: ${sg.suggested.toLowerCase()} (${EVIDENCE_NAME[sg.from]})` : null };
  });
  const isTeacher = actor.role === "TEACHER";
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  const bands = await lexileBands(repo, actor.schoolId ?? null);
  const editBands = actor.role !== "TEACHER" && can(actor, "settings:school");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: isTeacher ? "/teacher" : "/admin", label: "Back" }} icon="🎯" title="Student Levels &amp; Tests" subtitle={<>Each student’s level decides which Curriculum Map questions they get (Above / On / Below Level). Set it here, or let the Diagnostic Test set it automatically from its score.</>} />
      {sp.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!v ? <p className="mt-6 text-slate-600">No classes yet.</p> : (
        <>
          <nav aria-label="Classes" className="mt-4 flex flex-wrap gap-2">
            {classes.map((c) => <Link key={String(c.id)} href={`/teacher/levels?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
          </nav>
          {isTeacher && (
            <section className="mt-5 grid gap-4 md:grid-cols-2">
              <Link href="/teacher/diagnostic" className="lift rounded-2xl bg-gradient-to-br from-amber-50 to-white p-5 ring-1 ring-amber-300">
                <h2 className="text-lg font-bold text-brand-navy">📝 Diagnostic Test</h2>
                <p className="text-sm text-slate-600">The start-of-year test (about 50 questions, every standard). Its score sets each student’s level automatically, and you get the full class analysis and support plan.</p>
                <p className="mt-3 text-sm font-semibold text-brand-navy">Open the Diagnostic ▶</p>
              </Link>
              {([["MAP_TEST", "🗺️ MAP practice test", "Results by MAP goal area. Uses questions marked “MAP test”."]] as const).map(([kind, title, text]) => (
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
              <div className="flex flex-wrap gap-2">
                <Link href={`/teacher/levels?classId=${classId}&auto=1`} className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200">🤖 Place automatically</Link>
                {auto && <Link href={`/teacher/levels?classId=${classId}`} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300">Undo suggestions</Link>}
              </div>
            </div>
            {auto ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">🤖 Suggested from each student’s data (their results on the platform, Placement test, MAP). Move anyone you want, then <b>Save levels</b>. Nothing changes until you save.</p>
              : <p className="mt-2 text-sm text-slate-600">Drag a student to another column (or use ◀ ▶), then <b>Save levels</b>. Students never see these names.</p>}
            {noData > 0 && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">ℹ️ {noData} student(s) have no data yet, so they start at On Level. Their level will adjust by itself as they work.</p>}
            <div className="mt-3"><LevelBoard students={board} /></div>
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
