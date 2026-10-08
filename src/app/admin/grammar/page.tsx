import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { grammarView, type GrammarSkillRow } from "@/server/grammar/grammar";
import { AssignDialog, AssignSkillHost } from "../../teacher/assign-dialog";
import { ImportUpload } from "../questions/import/upload-form";

export const metadata = { title: "Grammar" };

/**
 * 🔤 Grammar (teachers and admins): every grammar skill of the grade, Unit → Week → Skill, with its questions
 * at each level. Teachers ⭐ Assign a skill to the class or to chosen students; it appears in the students'
 * assigned work with the other skills and is practised adaptively (Below → On → Above).
 */
export default async function GrammarPage({ searchParams }: { searchParams: Promise<{ grade?: string; classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const v = await grammarView(repo, actor, { grade: Number(sp.grade) || undefined, classId: sp.classId || undefined });
  const isTeacher = actor.role === "TEACHER";
  const canImport = can(actor, "questions:publish") && !isTeacher;
  const klass = v.classes.find((c) => c.id === v.classId);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold transition ${on ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const level = (n: number, label: string, cls: string) => <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ${n ? cls : "bg-slate-50 text-slate-400 ring-slate-200"}`} title={`${n} ${label} question(s)`}>{label} {n}</span>;
  const row = (k: GrammarSkillRow) => (
    <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900"><span aria-hidden="true">{k.icon}</span> {k.name} <span className="ms-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{k.kind}</span></p>
        <p className="mt-0.5 text-xs text-slate-500">{k.standards.join(", ") || "No standard"}{k.openAssignments ? ` · assigned (${k.openAssignments} open)` : ""}</p>
        {k.rule && <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-brand-teal">The rule</summary><p className="mt-1 max-w-3xl leading-relaxed">{k.rule}</p></details>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {level(k.counts.below, "🟠 Below", "bg-orange-50 text-orange-900 ring-orange-200")}
        {level(k.counts.on, "🔵 On", "bg-sky-50 text-sky-900 ring-sky-200")}
        {level(k.counts.above, "🟢 Above", "bg-emerald-50 text-emerald-900 ring-emerald-200")}
        <Link href={`/admin/questions?status=PUBLISHED&grade=${v.grade}&skill=${k.id}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">View questions ({k.counts.total})</Link>
        {isTeacher && klass && k.counts.total > 0 && <AssignDialog skill={{ id: k.id, name: k.name, standards: k.standards }} />}
      </div>
    </li>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: isTeacher ? "/teacher" : "/admin", label: "Back" }} icon="🔤" title="Grammar"
        subtitle="Every grammar, mechanics and revision skill of the grade, week by week. ⭐ Assign a skill: students find it in their assigned work and practise it adaptively, Below → On → Above; their results join their skill mastery, MAP Language goals and the analytics.">
        {!isTeacher && <nav aria-label="Grade" className="flex gap-2">{v.grades.map((g) => <Link key={g} href={`/admin/grammar?grade=${g}`} aria-current={g === v.grade ? "page" : undefined} className={chip(g === v.grade)}>Grade {g}</Link>)}</nav>}
      </PageHeader>

      {isTeacher && (
        v.classes.length === 0 ? <p className="mb-5 rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">You do not teach any class yet.</p> : (
          <nav aria-label="Classes" className="mb-5 flex flex-wrap gap-2">
            {v.classes.map((c) => <Link key={c.id} href={`/admin/grammar?classId=${c.id}`} aria-current={c.id === v.classId ? "page" : undefined} className={chip(c.id === v.classId)}>{c.name} · G{c.grade}</Link>)}
          </nav>
        )
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {([["Skills", v.totals.skills, "🔤"], ["🟠 Below", v.totals.below, ""], ["🔵 On", v.totals.on, ""], ["🟢 Above", v.totals.above, ""]] as const).map(([l, n, i]) => (
          <div key={l} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-sm font-semibold text-slate-500">{i} {l}{l === "Skills" ? "" : " questions"}</p><p className="text-2xl font-extrabold text-brand-navy">{n.toLocaleString("en")}</p></div>
        ))}
      </div>

      {canImport && (
        <Section title={`Load the Grammar bank · Grade ${v.grade}`} icon="📥" tone="amber" className="mb-6"
          hint={`Upload the Grammar Question Bank Excel file (sheets Questions, Skills, Lessons). Grade ${v.grade}'s skills are created or updated, then its questions open in the normal import preview: check them and press Import. Do it once per grade (change the grade above). Importing the same file again adds nothing twice.`}>
          <ImportUpload grammarGrade={v.grade} accept=".xlsx" />
        </Section>
      )}

      {!v.loaded ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{canImport ? `No Grade ${v.grade} grammar skills yet. Load the Grammar bank above.` : `No Grade ${v.grade} grammar skills yet. Ask the admin to load the Grammar bank.`}</p>
      ) : v.units.map((u) => (
        <section key={u.unit} className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby={`gu-${u.unit}`}>
          <h2 id={`gu-${u.unit}`} className="text-xl font-bold text-brand-navy">{u.unit ? `Unit ${u.unit}` : v.units.length === 1 ? `Grade ${v.grade} lessons` : "More skills"}</h2>
          {u.weeks.map((w) => (
            <div key={w.lesson} className="mt-4 rounded-2xl bg-slate-50/60 p-4 ring-1 ring-slate-100">
              <h3 className="font-bold text-slate-800">{w.week ? `Week ${w.week} · ` : w.number ? `Lesson ${w.number} · ` : ""}{w.title}</h3>
              <ul className="mt-1 divide-y divide-slate-200">{w.skills.map(row)}</ul>
            </div>
          ))}
        </section>
      ))}
      {isTeacher && klass && <AssignSkillHost classId={klass.id} className={klass.name} students={v.students} track="CURRICULUM" />}
    </AppShell>
  );
}
