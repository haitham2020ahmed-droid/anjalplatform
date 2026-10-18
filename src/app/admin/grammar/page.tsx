import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { grammarLibrary } from "@/server/grammar/grammar";
import { GrammarTabs } from "@/components/grammar/grammar-tabs";
import { ImportUpload } from "../questions/import/upload-form";

export const metadata = { title: "Grammar" };

/**
 * 🔤 Grammar (teachers and admins): every grammar lesson of the school in one list — the same for every teacher —
 * with a search by skill. ⭐ Assign sends a lesson to any class: each student practises it at their own level.
 */
export default async function GrammarPage({ searchParams }: { searchParams: Promise<{ load?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const v = await grammarLibrary(repo, actor);
  const isTeacher = actor.role === "TEACHER";
  const canImport = can(actor, "questions:publish") && !isTeacher;
  const loadGrade = Number(sp.load) || v.grades[0] || 4;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: isTeacher ? "/teacher" : "/admin", label: "Back" }} icon="🔤" title="Grammar"
        subtitle="Every grammar lesson in one list. Search a skill, then ⭐ Assign it to any of your classes: each student practises it at their own level, and the results join their progress and MAP Language goals." />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {([["Lessons", v.lessons.length, "🔤"], ["🟠 Approaching", v.totals.below, ""], ["🔵 Meeting", v.totals.on, ""], ["🟢 Exceeding", v.totals.above, ""]] as const).map(([l, n, i]) => (
          <div key={l} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-sm font-semibold text-slate-500">{i} {l}{l === "Lessons" ? "" : " questions"}</p><p className="text-2xl font-extrabold text-brand-navy">{n.toLocaleString("en")}</p></div>
        ))}
      </div>

      {canImport && (
        <Section title="Load the Grammar bank" icon="📥" tone="amber" className="mb-6"
          hint="Upload the Grammar Question Bank Excel file (sheets Questions, Skills, Lessons) of one grade; its lessons join the list and its questions open in the normal import preview. Importing the same file again adds nothing twice. Besides multiple choice, true/false and fill-in rows, the Questions sheet may hold error_correction (segments, error_index, correction), sentence_order (items) and sentence_combine (sentences, connector, accepted_answers) rows.">
          <nav aria-label="Grade of the file" className="mb-3 flex flex-wrap gap-2 text-sm">{v.grades.map((g) => <Link key={g} href={`/admin/grammar?load=${g}`} aria-current={g === loadGrade ? "page" : undefined} className={`rounded-full px-3 py-1 font-semibold ${g === loadGrade ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>File of Grade {g}</Link>)}</nav>
          <ImportUpload grammarGrade={loadGrade} accept=".xlsx" />
        </Section>
      )}

      {!v.lessons.length
        ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{canImport ? "No grammar lessons yet. Load the Grammar bank above." : "No grammar lessons yet. Ask the admin to load the Grammar bank."}</p>
        : <GrammarTabs lessons={v.lessons} isTeacher={isTeacher} grades={v.grades} />}
    </AppShell>
  );
}
