import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { previewClean, type RosterScope } from "@/server/admin/roster-clean";
import { archiveRosterAction, deleteRosterAction } from "./actions";

export const metadata = { title: "Clean roster" };

/** 🧹 Clean roster: archive or permanently delete a school's / grade's / class's students, then load a new roster. */
export default async function CleanRosterPage({ searchParams }: { searchParams: Promise<{ scope?: string; grade?: string; classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [grades, classes] = await Promise.all([repo.findMany("Grade", { schoolId: actor.schoolId }), repo.findMany("Class", { schoolId: actor.schoolId })]);
  const liveClasses = classes.filter((c) => !c.deletedAt).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const scope: RosterScope = sp.scope === "grade" && sp.grade ? { kind: "GRADE", grade: Number(sp.grade) } : sp.scope === "class" && sp.classId ? { kind: "CLASS", classId: sp.classId } : { kind: "SCHOOL" };
  const p = await previewClean(repo, actor, scope);
  const q = new URLSearchParams({ scope: scope.kind.toLowerCase(), ...(scope.kind === "GRADE" ? { grade: String(scope.grade) } : {}), ...(scope.kind === "CLASS" ? { classId: scope.classId } : {}) }).toString();
  const hidden = <><input type="hidden" name="scope" value={scope.kind.toLowerCase()} />{scope.kind === "GRADE" && <input type="hidden" name="grade" value={scope.grade} />}{scope.kind === "CLASS" && <input type="hidden" name="classId" value={scope.classId} />}<input type="hidden" name="q" value={q} /></>;
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/roster", label: "Roster" }} icon="🧹" title="Clean roster"
        subtitle="Remove students before loading a new roster. Archive keeps everything (recommended). Delete permanently removes the students and all their data. Teachers and parents are never touched." />
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <Section title="1 · Which students" icon="🎯">
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/roster/clean" className={pill(scope.kind === "SCHOOL")}>Whole school</Link>
          {grades.sort((a, b) => Number(a.level) - Number(b.level)).map((g) => <Link key={String(g.id)} href={`/admin/roster/clean?scope=grade&grade=${g.level}`} className={pill(scope.kind === "GRADE" && scope.grade === Number(g.level))}>Grade {String(g.level)}</Link>)}
          {liveClasses.map((c) => <Link key={String(c.id)} href={`/admin/roster/clean?scope=class&classId=${c.id}`} className={pill(scope.kind === "CLASS" && scope.classId === c.id)}>{String(c.name)}</Link>)}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Students", p.students], ["With answers", p.withHistory], ["Answers", p.answers], ["MAP scores", p.mapScores]].map(([l, n]) => <div key={String(l)} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{l}</dt><dd className="text-2xl font-extrabold text-brand-navy">{n}</dd></div>)}
        </dl>
        <p className="mt-2 text-sm text-slate-600">Scope: <b>{p.label}</b></p>
      </Section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="2a · Archive (recommended)" icon="📦" tone="sky" hint="Students cannot sign in and leave their classes. Their answers, MAP scores and reports are kept, so nothing is lost.">
          <form action={archiveRosterAction}>{hidden}<button disabled={!p.students} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">📦 Archive {p.students} student(s)</button></form>
        </Section>
        <Section title="2b · Delete permanently" icon="🗑" tone="amber" hint="Removes the students and ALL their data (answers, MAP, levels, ReadMaster, games…). This cannot be undone: download the backup first.">
          <a href={`/api/roster-backup?${q}`} className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Download backup (JSON)</a>
          <form action={deleteRosterAction} className="mt-3 space-y-2">{hidden}
            <label className="block text-sm">Type <code className="rounded bg-red-50 px-1.5 py-0.5 font-bold text-red-800">{p.confirm}</code> to confirm<input name="confirm" autoComplete="off" required className="mt-1 w-full rounded-xl border border-red-300 px-3 py-2" /></label>
            <button disabled={!p.students} className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50">🗑 Delete permanently</button>
          </form>
        </Section>
      </div>
      <Section title="3 · Add the new roster" icon="➕" className="mt-6" hint="Upload the roster file (role, username, display_name, student_number, grade, class). New classes are created automatically.">
        <Link href="/admin/roster" className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">➕ Import roster</Link>
      </Section>
    </AppShell>
  );
}
