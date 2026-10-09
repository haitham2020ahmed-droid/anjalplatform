import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PassageText } from "@/components/passage-text";
import { WordLookup } from "@/components/learn/word-lookup";
import { Recorder } from "@/components/learn/recorder";
import { WordCounter } from "@/components/learn/word-counter";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { taskForStudent } from "@/server/teacher/writing";
import { saveWritingAction } from "../actions";

export const metadata = { title: "Writing" };

/** ✍️ Write (draft → send) or 🎙 record; then see the teacher's rubric scores and comment. */
export default async function WritingTaskPage({ params, searchParams }: { params: Promise<{ taskId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { taskId } = await params;
  const sp = await searchParams;
  let t; try { t = await taskForStudent(repo, actor, taskId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const locked = t.mine.status === "SUBMITTED" || t.mine.status === "SCORED";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/writing", label: "Writing" }} icon={t.kind === "WRITE" ? "✍️" : "🎙"} title={t.title} subtitle={t.dueAt ? `Due ${t.dueAt.slice(0, 10)}` : undefined} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <section className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-950 ring-1 ring-amber-200"><p className="whitespace-pre-line">{t.prompt}</p></section>
      {t.passage && <WordLookup><article className="reading mt-4 rounded-3xl bg-white p-6 ring-1 ring-slate-200"><PassageText text={t.passage} /></article></WordLookup>}
      {t.mine.status === "SCORED" && t.mine.scores && (
        <section className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-xl font-bold text-emerald-900">✅ {t.mine.total} / {t.rubric.length * 4}</p>
          <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">{t.rubric.map((r) => <li key={r.key}><b>{r.name}</b>: {t.mine.scores![r.key]}/4 <span className="text-slate-600">— {r.what}</span></li>)}</ul>
          {t.mine.comment && <p className="mt-2 rounded-lg bg-white px-3 py-2">💬 {t.mine.comment}</p>}
        </section>
      )}
      <div className="mt-4">
        {t.kind === "READ_ALOUD" ? (t.mine.status === "SCORED" ? null : <Recorder taskId={t.id} sent={t.mine.status === "SUBMITTED"} />) : (
          <form action={saveWritingAction} className="space-y-3">
            <input type="hidden" name="taskId" value={t.id} />
            <WordCounter name="text" defaultValue={t.mine.text ?? ""} min={t.minWords} disabled={locked} />
            {!locked && <div className="flex flex-wrap gap-2"><button name="submit" value="0" className="rounded-xl px-5 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">💾 Save draft</button><button name="submit" value="1" className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white">📤 Send to my teacher</button></div>}
            {locked && t.mine.status === "SUBMITTED" && <p className="font-semibold text-slate-600">Sent ✓ — your teacher will score it.</p>}
          </form>
        )}
      </div>
      <details className="mt-4 rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200"><summary className="cursor-pointer font-semibold text-brand-navy">How it is scored</summary><ul className="mt-2 space-y-1">{t.rubric.map((r) => <li key={r.key}><b>{r.name}</b> (0–4): {r.what}</li>)}</ul></details>
    </AppShell>
  );
}
