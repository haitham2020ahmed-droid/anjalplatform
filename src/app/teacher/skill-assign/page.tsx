import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LevelBoard } from "@/components/teacher/level-board";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { skillPool } from "@/server/teacher/skill-assign";
import { suggestLevels } from "@/server/curriculum-map/auto-levels";
import { assignSkillAction } from "./actions";

export const metadata = { title: "Assign a skill" };

/** ⭐ Assign a skill: 🤖 Automatic (default) or ✋ Manual (Below / On / Above board), optional due date. */
export default async function SkillAssignPage({ searchParams }: { searchParams: Promise<{ skillId?: string; classId?: string; manual?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const pool = await skillPool(repo, actor.schoolId!, String(sp.skillId ?? ""));
  const grades = await repo.findMany("Grade", { schoolId: actor.schoolId });
  const classes = (await accessibleClasses(repo, actor)).filter((c) => Number(grades.find((g) => g.id === c.gradeId)?.level) === pool.skill.grade).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const k = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const manual = sp.manual === "1";
  const isGrammar = /grammar|mechanic|usage|punctuat|capital/i.test(pool.skill.name);
  const sug = k ? await suggestLevels(repo, actor, String(k.id), { subject: isGrammar ? "LANGUAGE" : "READING" }) : null;
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  const total = pool.byLevel.BELOW.length + pool.byLevel.ON.length + pool.byLevel.ABOVE.length;
  const link = (o: Record<string, string>) => `/teacher/skill-assign?${new URLSearchParams({ skillId: pool.skill.id, ...(k ? { classId: String(k.id) } : {}), ...o })}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="⭐" title={`Assign: ${pool.skill.name}`} subtitle={`Grade ${pool.skill.grade}`}>
        <Link href={`/teacher/preview?skillId=${pool.skill.id}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">👀 Preview</Link>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!k ? <p className="text-slate-600">You do not teach a Grade {pool.skill.grade} class.</p> : !total ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">This skill has no questions yet.</p> : (
        <form action={assignSkillAction} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <input type="hidden" name="skillId" value={pool.skill.id} /><input type="hidden" name="classId" value={String(k.id)} /><input type="hidden" name="mode" value={manual ? "MANUAL" : "AUTOMATIC"} />
          <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">
            {classes.map((c) => <Link key={String(c.id)} href={`/teacher/skill-assign?${new URLSearchParams({ skillId: pool.skill.id, classId: String(c.id), ...(manual ? { manual: "1" } : {}) })}`} aria-current={c.id === k.id ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === k.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
          </nav>
          <div className="grid gap-2 md:grid-cols-2">
            <Link href={link({})} aria-current={!manual ? "page" : undefined} className={`rounded-2xl p-4 ring-2 ${!manual ? "bg-emerald-50 ring-emerald-400" : "bg-white ring-slate-200"}`}><b>🤖 Automatic (recommended)</b><br /><span className="text-sm text-slate-600">Each student starts at their own level and moves up or down by their answers.</span></Link>
            <Link href={link({ manual: "1" })} aria-current={manual ? "page" : undefined} className={`rounded-2xl p-4 ring-2 ${manual ? "bg-sky-50 ring-sky-400" : "bg-white ring-slate-200"}`}><b>✋ Manual</b><br /><span className="text-sm text-slate-600">You choose who is Below, On and Above; each gets only that level.</span></Link>
          </div>
          {manual && sug && <div className="mt-4"><p className="mb-2 text-sm text-slate-600">Students are placed from their data — drag anyone to another column.</p><LevelBoard sendAll prefix="lv:" students={sug.rows.map((r) => ({ id: r.studentId, name: r.name, start: r.suggested, original: null, note: r.reason, tag: r.from === "NO_DATA" ? "No data" : null }))} /></div>}
          {!manual && sug && sug.noData > 0 && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">ℹ️ {sug.noData} student(s) have no data yet: they start at On Level.</p>}
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-brand-navy">Leave some students out</summary>
            <div className="mt-2 grid gap-1 sm:grid-cols-3">{(sug?.rows ?? []).map((r) => <label key={r.studentId} className="flex items-center gap-2"><input type="checkbox" name="skip" value={r.studentId} />{r.name}</label>)}</div>
          </details>
          <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col">Questions per student<input type="number" name="max" min={5} max={50} defaultValue={20} className={`${box} w-28`} /></label>
            <label className="flex flex-col">Due date (optional)<input type="date" name="dueAt" className={box} /></label>
            <label className="flex min-w-[16rem] flex-1 flex-col">Note to students (optional)<input name="note" maxLength={1000} className={box} /></label>
          </div>
          <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">⭐ Send to students</button>
        </form>
      )}
    </AppShell>
  );
}
