import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classTasks, taskForTeacher } from "@/server/teacher/writing";
import { createTaskAction, scoreAction } from "./actions";

export const metadata = { title: "Writing & reading aloud" };

/** ✍️ Writing tasks with a 4-point rubric and 🎙 reading-aloud recordings: send, read / listen, score. */
export default async function WritingPage({ searchParams }: { searchParams: Promise<{ classId?: string; task?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const [tasks, task] = classId ? await Promise.all([classTasks(repo, actor, classId), sp.task ? taskForTeacher(repo, actor, sp.task).catch(() => null) : Promise.resolve(null)]) : [[], null];
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const box = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="✍️" title="Writing & reading aloud" subtitle="Short writing scored with a 4-point rubric (Ideas · Organization · Language · Conventions), and reading aloud: students record themselves, you listen and score fluency."><PrintButton /></PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <nav className="flex flex-wrap gap-2 print:hidden">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/writing?classId=${String(c.id)}`} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav>
      <div className="mt-5 grid gap-5 lg:grid-cols-[22rem_1fr]">
        <aside className="space-y-4 print:hidden">
          <details className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" open={!tasks.length}>
            <summary className="cursor-pointer font-bold text-brand-navy">➕ New task</summary>
            <form action={createTaskAction} className="mt-3 space-y-2 text-sm">
              <input type="hidden" name="classId" value={classId} />
              <div className="flex gap-3"><label className="flex items-center gap-1"><input type="radio" name="kind" value="WRITE" defaultChecked /> ✍️ Writing</label><label className="flex items-center gap-1"><input type="radio" name="kind" value="READ_ALOUD" /> 🎙 Read aloud</label></div>
              <label className="block font-semibold">Title<input name="title" required maxLength={191} className={box} /></label>
              <label className="block font-semibold">What students do<textarea name="prompt" required rows={3} className={box} placeholder="e.g. Write a paragraph about your favourite character and give two reasons from the text." /></label>
              <label className="block font-semibold">Text (to read aloud, or to write about)<textarea name="passage" rows={4} className={box} /></label>
              <div className="flex gap-2"><label className="font-semibold">Min. words<input name="minWords" type="number" min={10} max={1000} className={`${box} w-24`} /></label><label className="font-semibold">Due<input name="dueAt" type="date" className={box} /></label></div>
              <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Send to the class</button>
            </form>
          </details>
          <ul className="space-y-2">{tasks.map((t) => <li key={t.id}><Link href={`/teacher/writing?classId=${classId}&task=${t.id}`} className={`block rounded-2xl p-3 ring-1 ${task?.id === t.id ? "bg-brand-navy text-white ring-brand-navy" : "bg-white ring-slate-200 hover:ring-brand-teal"}`}><span className="block font-semibold">{t.kind === "WRITE" ? "✍️" : "🎙"} {t.title}</span><span className="block text-xs opacity-80">{t.submitted}/{t.members} handed in · {t.scored} scored{t.dueAt ? ` · due ${t.dueAt.slice(0, 10)}` : ""}</span></Link></li>)}</ul>
        </aside>
        <section>
          {!task ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">Choose a task, or make a new one.</p> : (
            <>
              <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="text-xl font-bold text-brand-navy">{task.kind === "WRITE" ? "✍️" : "🎙"} {task.title}</h2>
                <p className="mt-1 whitespace-pre-line text-slate-700">{task.prompt}</p>
                {task.passage && <details className="mt-2 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">The text</summary><p className="mt-2 whitespace-pre-line">{task.passage}</p></details>}
                <p className="mt-2 text-xs text-slate-500">Rubric (0–4 each): {task.rubric.map((r) => `${r.name} — ${r.what}`).join(" · ")}</p>
              </div>
              <ul className="mt-4 space-y-3">{task.subs.map((x) => (
                <li key={x.studentId} id={`s-${x.studentId}`} className={`scroll-mt-24 break-inside-avoid rounded-2xl bg-white p-4 ring-1 ${x.status === "SUBMITTED" ? "ring-amber-300" : x.status === "SCORED" ? "ring-emerald-200" : "ring-slate-200"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-brand-navy">{x.name}</p><span className="text-xs font-semibold text-slate-500">{x.status === "NOT_STARTED" ? "not started" : x.status === "DRAFT" ? "writing (draft)" : x.status === "SUBMITTED" ? "⏳ to score" : `✅ ${x.total}/${task.rubric.length * 4}`}{x.submittedAt ? ` · ${x.submittedAt.slice(0, 10)}` : ""}</span></div>
                  {x.text && x.status !== "DRAFT" && <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-slate-900">{x.text}<span className="mt-1 block text-xs text-slate-500">{x.words} words</span></p>}
                  {x.hasAudio && <audio controls preload="none" src={`/api/recordings?task=${task.id}&student=${x.studentId}`} className="mt-2 w-full" />}
                  {(x.status === "SUBMITTED" || x.status === "SCORED") && task.canScore && (
                    <form action={scoreAction} className="mt-3 flex flex-wrap items-end gap-3 text-sm print:hidden">
                      <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="studentId" value={x.studentId} /><input type="hidden" name="classId" value={task.classId} />
                      {task.rubric.map((r) => <label key={r.key} className="font-semibold" title={r.what}>{r.name}<select name={`s.${r.key}`} defaultValue={x.scores?.[r.key] ?? ""} required className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5"><option value="" disabled>–</option>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>)}
                      <label className="min-w-[14rem] flex-1 font-semibold">Comment<input name="comment" defaultValue={x.comment ?? ""} maxLength={2000} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal" /></label>
                      <button className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">{x.status === "SCORED" ? "Update" : "Save score"}</button>
                    </form>
                  )}
                </li>
              ))}</ul>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
