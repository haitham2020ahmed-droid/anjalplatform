import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { GROUPS, type GroupKey } from "@/server/map/map-plan";
import { skillPlan } from "@/server/map/skill-plan";
import { assignRangeAction } from "./actions";

export const metadata = { title: "MAP Skill Plan" };

/** 🧭 MAP Skill Plan: the platform's skills by goal area and RIT range (grade norms) — browse, print, assign to the students of a range. */
export default async function MapSkillPlanPage({ searchParams }: { searchParams: Promise<{ classId?: string; grade?: string; group?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = sp.classId === "none" ? null : classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : null;
  const group = (GROUPS.some((g) => g.key === sp.group) ? sp.group : "LIT") as GroupKey;
  const v = await skillPlan(repo, actor, { grade: Number(sp.grade) || 6, group, classId });
  const link = (p: Record<string, string>) => `/teacher/map-skill-plan?${new URLSearchParams({ ...(classId ? { classId } : { classId: "none", grade: String(v.grade) }), group, ...p })}`;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const subjectName = v.subject === "READING" ? "Reading" : "Language Usage";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/map-plans", label: "MAP Plans" }} icon="🧭" title="MAP Skill Plan"
        subtitle={<>The platform&apos;s skills for each MAP goal area, by <b>RIT range</b> (six ranges around the grade&apos;s national norm), grouped by NWEA instructional area and topic, easiest first. Choose a class to see which students are in each range and assign them the skills of their range.</>}>
        <PrintButton />
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <nav aria-label="Class" className="flex flex-wrap gap-2 print:hidden">
        {classes.map((c) => <Link key={String(c.id)} href={`/teacher/map-skill-plan?${new URLSearchParams({ classId: String(c.id), group })}`} className={chip(c.id === classId)}>{String(c.name)}</Link>)}
        <span className="mx-1 h-8 w-px bg-slate-300" aria-hidden="true" />
        {[4, 5, 6].map((g) => <Link key={g} href={`/teacher/map-skill-plan?${new URLSearchParams({ classId: "none", grade: String(g), group })}`} className={chip(!classId && v.grade === g)}>Grade {g} (no class)</Link>)}
      </nav>
      <nav aria-label="Goal area" className="mt-3 flex flex-wrap gap-2 print:hidden">
        {GROUPS.map((g) => <Link key={g.key} href={link({ group: g.key })} className={chip(g.key === group)}>{g.icon} {g.name} <span className="text-xs opacity-70">· {g.subject === "READING" ? "Reading" : "Language"}</span></Link>)}
      </nav>

      <header className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">NWEA MAP Growth · {subjectName} · Grade {v.grade}{v.className ? ` · ${v.className}` : ""}</p>
        <h2 className="text-2xl font-bold text-brand-navy">{GROUPS.find((g) => g.key === group)?.icon} {GROUPS.find((g) => g.key === group)?.name}</h2>
        <nav aria-label="RIT ranges" className="mt-2 flex flex-wrap gap-2 text-sm print:hidden">
          {v.ranges.map((r) => <a key={r.index} href={`#range-${r.index}`} className="rounded-lg bg-slate-50 px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">RIT {r.label} <span className="font-normal text-slate-500">· {r.skills} skills{v.classId ? ` · ${r.students.length} students` : ""}</span></a>)}
        </nav>
        {v.classId && v.noScores > 0 && <p className="mt-2 text-sm text-slate-500">{v.noScores} student(s) without a {subjectName} MAP score are not placed.</p>}
      </header>

      {v.ranges.map((r) => (
        <section key={r.index} id={`range-${r.index}`} className="mt-5 break-inside-avoid-page rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none">
          <form action={assignRangeAction}>
            <input type="hidden" name="classId" value={v.classId ?? ""} /><input type="hidden" name="group" value={group} /><input type="hidden" name="range" value={r.index} />
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
              <h3 className="text-xl font-bold text-brand-navy">RIT Score: {r.label}</h3>
              <p className="text-sm text-slate-500">{r.skills} skill(s){v.classId ? ` · ${r.students.length} student(s) in this range` : ""}</p>
            </div>
            {v.classId && r.students.length > 0 && (
              <div className="mt-3 rounded-xl bg-sky-50 p-3 text-sm ring-1 ring-sky-200">
                <p className="font-semibold text-sky-900">👥 Students in this range</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{r.students.map((x) => <label key={x.id} className="flex items-center gap-1">{v.canAssign && <input type="checkbox" name="student" value={x.id} defaultChecked className="print:hidden" />}{x.name} <span className="text-xs text-slate-500">({x.rit})</span></label>)}</div>
              </div>
            )}
            {r.nearest && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">No questions of exactly this RIT yet: these are the skills of the nearest range ({r.nearest}), and they are what an assignment from here uses.</p>}
            {!r.areas.length ? <p className="mt-3 text-slate-500">No questions of this RIT range yet for this goal area.</p> : (
              <table className="mt-3 w-full text-left text-sm">
                <thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="w-1/3 py-2 pe-4">Instructional area</th><th className="py-2">Platform skills</th></tr></thead>
                <tbody>{r.areas.map((a) => (
                  <tr key={a.code} className="border-b align-top last:border-0">
                    <td className="py-3 pe-4 font-semibold text-slate-800">{a.name}</td>
                    <td className="py-3">
                      {(() => { let n = 0; return a.topics.map((t) => (
                        <div key={t.name} className="mb-3 last:mb-0">
                          {(t.skills.length > 1 || t.skills[0]?.name !== t.name) && <p className="font-semibold text-brand-teal">{t.name}</p>}
                          <ol className="mt-1 space-y-0.5">{t.skills.map((k) => { n++; return (
                            <li key={k.id}><label className="flex items-start gap-2">{v.classId && v.canAssign && r.students.length > 0 && <input type="checkbox" name="skill" value={k.id} defaultChecked className="mt-1 print:hidden" />}<span>{n}. <Link href={`/skill/${k.id}`} className="hover:text-brand-teal hover:underline">{k.name}</Link> <span className="text-xs text-slate-500">· {k.questions} q</span></span></label></li>
                          ); })}</ol>
                        </div>
                      )); })()}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {v.classId && v.canAssign && r.students.length > 0 && r.areas.length > 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200 print:hidden">
                <label>Questions per student <input type="number" name="count" min={5} max={40} defaultValue={15} className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1" /></label>
                <label>Due <input type="date" name="dueAt" className="mt-1 block rounded-md border border-slate-300 px-2 py-1" /></label>
                <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">⭐ Assign the ticked skills to the ticked students</button>
              </div>
            )}
          </form>
        </section>
      ))}
      <p className="mt-4 text-xs text-slate-500">RIT ranges come from the NWEA 2025 national norms for the grade (Fall). A skill appears in a range when it has questions of that RIT (estimated from the question&apos;s difficulty, or calibrated from real answers). Add questions to fill empty ranges.</p>
    </AppShell>
  );
}
