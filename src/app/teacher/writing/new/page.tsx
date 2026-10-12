import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RichTextEditor } from "@/components/writing/rich-text-editor";
import { RubricBuilder } from "@/components/writing/rubric-builder";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { classGroups, listRubrics } from "@/server/writing/locked";
import { createLockedTaskAction } from "../locked-actions";

export const metadata = { title: "New writing task" };

/** ➕ A locked writing task: prompt (light rich text), grade, word count, time limit, a rubric, who and when. */
export default async function NewWritingTaskPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const classId = klass ? String(klass.id) : "";
  const [ids, groups, rubrics, grade] = classId
    ? await Promise.all([classMembers(repo, classId), classGroups(repo, actor, classId), listRubrics(repo, actor), repo.findUnique("Grade", { id: klass!.gradeId })])
    : [[], [], [], null];
  const names = await studentNames(repo, ids);
  const students = ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
  const box = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";
  const card = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  const chip = (on: boolean) => `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/writing${classId ? `?classId=${classId}` : ""}`, label: "Writing & Reading Aloud" }} icon="🔒" title="New writing task" subtitle={t("Students write on a locked page and you grade with your rubric.")} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{sp.msg}</p>}
      <nav className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} prefetch={false} href={`/teacher/writing/new?classId=${String(c.id)}`} className={chip(c.id === classId)}><bdi>{String(c.name)}</bdi></Link>)}</nav>
      {!classId ? <p className={card}>{t("No class")}</p> : (
        <form action={createLockedTaskAction} className="space-y-4">
          <input type="hidden" name="classId" value={classId} />
          <section className={card}>
            <h2 className="font-semibold text-brand-navy">1. {t("The task")}</h2>
            <label className="mt-2 block text-sm font-semibold">{t("Title")}<input name="title" required maxLength={191} className={box} /></label>
            <div className="mt-2 text-sm font-semibold">{t("Writing prompt")}<RichTextEditor name="promptHtml" placeholder={t("Writing prompt")} /></div>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-semibold">{t("Grade")}<select name="gradeLevel" defaultValue={String(grade?.level ?? "")} className={box}>{Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{t("Grade {n}", { n: g })}</option>)}</select></label>
              <label className="text-sm font-semibold">{t("Minimum words (optional)")}<input name="minWords" type="number" min={1} max={2000} className={box} /></label>
              <label className="text-sm font-semibold">{t("Time limit in minutes (optional)")}<input name="timeLimitMin" type="number" min={5} max={240} className={box} /></label>
            </div>
          </section>
          <section className={card}>
            <h2 className="font-semibold text-brand-navy">2. {t("Rubric")}</h2>
            <p className="text-sm text-slate-600">{t("Criteria, performance levels, points and a description for each level.")} <Link prefetch={false} href="/teacher/writing/rubrics" className="font-semibold text-brand-teal underline">{t("Saved rubrics")}</Link></p>
            <div className="mt-2"><RubricBuilder saved={rubrics} /></div>
            <label className="mt-4 block text-sm font-semibold">🤖 {t("Notes for AI grading (optional)")}
              <textarea name="aiNotes" rows={2} maxLength={1000} className={box} placeholder={t("e.g. Focus on the thesis; this class just learned paragraphs.")} />
              <span className="mt-1 block text-xs font-normal text-slate-500">{t("Only used to guide the AI's suggestions for you. Never write student names. You can change it on the grading page.")}</span>
            </label>
          </section>
          <section className={card}>
            <h2 className="font-semibold text-brand-navy">3. {t("Who and when")}</h2>
            <fieldset className="mt-2 space-y-2 text-sm">
              <legend className="sr-only">{t("Assign to")}</legend>
              <label className="flex min-h-9 items-center gap-2"><input type="radio" name="assignTo" value="CLASS" defaultChecked /> {t("The whole class")} <span className="text-slate-500">({students.length})</span></label>
              <label className="flex min-h-9 flex-wrap items-center gap-2"><input type="radio" name="assignTo" value="GROUP" disabled={!groups.length} /> {t("A group")}
                <select name="groupId" disabled={!groups.length} className="rounded-lg border border-slate-300 px-2 py-1.5">{groups.length ? groups.map((g) => <option key={g.id} value={g.id}>{g.title} ({g.studentIds.length})</option>) : <option value="">{t("No group yet")}</option>}</select>
              </label>
              <label className="flex min-h-9 items-center gap-2"><input type="radio" name="assignTo" value="STUDENTS" /> {t("Chosen students")}</label>
              <details className="rounded-xl bg-slate-50 p-3">
                <summary className="cursor-pointer font-semibold">{t("Choose students…")}</summary>
                <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{students.map((s) => <label key={s.id} className="flex min-h-9 items-center gap-2"><input type="checkbox" name="studentIds" value={s.id} /> <bdi>{s.name}</bdi></label>)}</div>
              </details>
            </fieldset>
            <label className="mt-3 block text-sm font-semibold">{t("Due date")}<input name="dueAt" type="datetime-local" required className={`${box} sm:w-72`} /></label>
          </section>
          <button className="inline-flex min-h-12 items-center rounded-2xl bg-brand-navy px-6 font-semibold text-white hover:bg-brand-purple">{t("Assign the writing task")}</button>
        </form>
      )}
    </AppShell>
  );
}
