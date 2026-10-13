import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DbUpdatePage } from "@/components/db-update-needed";
import { schemaGap } from "@/server/db/schema-errors";
import { PageHeader } from "@/components/page-header";
import { PassageText } from "@/components/passage-text";
import { WordLookup } from "@/components/learn/word-lookup";
import { Recorder } from "@/components/learn/recorder";
import { WordCounter } from "@/components/learn/word-counter";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { PreviewFrame } from "@/components/student/preview-frame";
import { ForbiddenError } from "@/server/auth/rbac";
import { taskForStudent, type StudentTaskView } from "@/server/teacher/writing";
import { GENRE_ICON } from "@/server/writing/genres";
import { MISCONCEPTION_BY_CODE } from "@/insights/misconceptions";
import { researchAction, savePlanAction, saveWritingAction } from "../actions";
import { isLocked, lockedTaskForStudent } from "@/server/writing/locked";
import { LockedTaskView } from "./locked-view";

export const metadata = { title: "Writing" };

const BEHIND: unique symbol = Symbol("db behind");

const STEPS = [["PLAN", "1 Plan"], ["DRAFT", "2 Draft"], ["REVISE", "3 Revise"], ["FINAL", "4 Final"]] as const;

/** The teacher's scores and comment, and the approved AI feedback (strength + next step per trait, errors to fix). */
function Feedback({ t, title }: { t: StudentTaskView; title: string }) {
  const m = t.mine;
  if (!m.scores) return null;
  const max = t.rubric.traits.length * t.rubric.max;
  const fixes = [...new Set((m.ai?.conventions ?? []).map((c) => c.code))];
  return (
    <section className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
      <p className="text-xl font-bold text-emerald-900">{title} · {m.total} / {max}</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">{t.rubric.traits.map((r) => {
        const v = m.scores![r.key], ai = m.ai?.traits[r.key];
        return (
          <li key={r.key} className="rounded-xl bg-white p-3 text-sm ring-1 ring-emerald-100">
            <p><b>{r.name}</b>: {v}/{t.rubric.max}</p>
            {r.levels[v] ? <p className="text-slate-600">“{r.levels[v]}”</p> : <p className="text-slate-600">{r.what}</p>}
            {ai?.strength && <p className="mt-1">⭐ {ai.strength}</p>}
            {ai?.nextStep && <p>➡️ {ai.nextStep}</p>}
          </li>
        );
      })}</ul>
      {m.comment && <p className="mt-2 rounded-lg bg-white px-3 py-2">💬 {m.comment}</p>}
      {fixes.length > 0 && <p className="mt-2 text-sm">✏️ Watch out for: {fixes.map((c) => MISCONCEPTION_BY_CODE.get(c)?.label ?? c).join(" · ")}</p>}
    </section>
  );
}

/** ✍️ Research → plan → draft → revise → final (or simply write), or 🎙 record; then the teacher's feedback. */
export default async function WritingTaskPage({ params, searchParams }: { params: Promise<{ taskId: string }>; searchParams: Promise<{ msg?: string; preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  const { taskId } = await params;
  const sp = await searchParams;
  // 🔒 a locked rubric task: preview → the locked page → the returned grade
  const task = await repo.findUnique("WritingTask", { id: taskId }).catch((e): typeof BEHIND => { if (schemaGap(e)) return BEHIND; throw e; });
  if (task === BEHIND) return <DbUpdatePage />; // the update's new columns are not in the database yet
  if (isLocked(task)) {
    let v; try { v = await lockedTaskForStudent(repo, actor, taskId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
    return <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}><LockedTaskView v={v} msg={sp.msg} /></PreviewFrame></AppShell>;
  }
  let t: StudentTaskView; try { t = await taskForStudent(repo, actor, taskId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const m = t.mine;
  const locked = m.status === "SUBMITTED" || m.status === "SCORED";
  const stage = m.stage;
  const needsCheck = t.kind === "WRITE" && t.genre !== "FREE";
  const box = "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <PageHeader back={{ href: "/student/writing", label: "Writing" }} icon={t.kind === "WRITE" ? GENRE_ICON[t.genre] : "🎙"} title={t.title} subtitle={[t.genreLabel, t.dueAt ? `Due ${t.dueAt.slice(0, 10)}` : ""].filter(Boolean).join(" · ")} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {t.staged && <ol className="mb-4 flex flex-wrap gap-2 text-sm font-semibold">{STEPS.map(([k, label]) => <li key={k} className={`rounded-full px-3 py-1 ${stage === k ? "bg-brand-navy text-white" : STEPS.findIndex((s) => s[0] === k) < STEPS.findIndex((s) => s[0] === stage) ? "bg-emerald-100 text-emerald-900" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{label}</li>)}</ol>}
      <section className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-950 ring-1 ring-amber-200"><p className="whitespace-pre-line">{t.prompt}</p></section>
      {t.passage && <WordLookup><article className="reading mt-4 rounded-3xl bg-white p-6 ring-1 ring-slate-200"><PassageText text={t.passage} /></article></WordLookup>}
      {t.sources.length > 0 && <WordLookup hint={false}><div className="mt-4 grid gap-3 lg:grid-cols-2">{t.sources.map((src, i) => <article key={i} className="reading rounded-3xl bg-white p-5 ring-1 ring-slate-200"><h2 className="text-lg font-bold text-brand-navy">📚 Source {i + 1}: {src.title}</h2><PassageText text={src.text} /></article>)}</div></WordLookup>}

      {t.kind === "WRITE" && t.research.length > 0 && (t.needsResearch ? (
        <form action={researchAction} className="mt-4 space-y-3 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
          <input type="hidden" name="taskId" value={t.id} />
          <h2 className="text-lg font-bold text-sky-900">❓ First, answer the research questions</h2>
          {t.research.map((q, i) => (
            <fieldset key={q.id}><legend className="font-semibold">{i + 1}. {q.q}</legend>
              {q.kind === "MC" ? <div className="mt-1 space-y-1">{q.options!.map((o, j) => <label key={j} className="flex items-center gap-2"><input type="radio" name={`a.${q.id}`} value={j} required /> {o}</label>)}</div> : <textarea name={`a.${q.id}`} rows={2} required maxLength={1000} className={box} placeholder="Answer in a full sentence." />}
            </fieldset>
          ))}
          <button className="rounded-xl bg-sky-700 px-5 py-2.5 font-semibold text-white">Save my answers</button>
        </form>
      ) : m.researchScore && <p className="mt-4 rounded-xl bg-sky-50 px-4 py-2 text-sky-900 ring-1 ring-sky-200">❓ Research questions: {m.researchScore.points}/{m.researchScore.max}{m.researchScore.pending ? " (your teacher checks the short answers)" : ""}</p>)}

      {stage === "REVISE" && <Feedback t={t} title="📝 Feedback on your draft" />}
      {m.status === "SCORED" && <Feedback t={t} title="✅ Your score" />}

      <div className="mt-4">
        {t.kind === "READ_ALOUD" ? (m.status === "SCORED" ? null : <Recorder taskId={t.id} sent={m.status === "SUBMITTED"} />) : t.needsResearch ? null : stage === "PLAN" ? (
          <form action={savePlanAction} className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <input type="hidden" name="taskId" value={t.id} />
            <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-brand-navy">🗺️ {t.organizer.title}</h2>
              {t.organizer.fields.map((fl) => <label key={fl.key} className="block font-semibold">{fl.label}{fl.required ? "" : " (optional)"}<span className="block text-sm font-normal text-slate-500">{fl.help}</span><textarea name={`p.${fl.key}`} rows={fl.key === "steps" || fl.key === "events" ? 4 : 2} defaultValue={m.plan?.[fl.key] ?? ""} maxLength={1000} className={box} /></label>)}
              <div className="flex flex-wrap gap-2"><button name="finish" value="0" className="rounded-xl px-5 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">💾 Save plan</button><button name="finish" value="1" className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white">✅ Plan done: start my draft</button></div>
            </div>
            <Frames t={t} />
          </form>
        ) : (
          <form action={saveWritingAction} className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <input type="hidden" name="taskId" value={t.id} />
            <div className="space-y-3">
              {stage === "REVISE" && m.moves.length > 0 && (
                <fieldset className="rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200"><legend className="px-1 font-bold text-violet-900">🔧 Your revision steps</legend>
                  {m.moves.map((mv) => <label key={mv.id} className="flex items-start gap-2"><input type="checkbox" name="moveDone" value={mv.id} className="mt-1" disabled={locked} /> {mv.text}</label>)}
                </fieldset>
              )}
              {m.firstDraft && stage === "REVISE" && <details className="rounded-2xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">📝 My first draft</summary><p className="mt-2 whitespace-pre-line">{m.firstDraft}</p></details>}
              <WordCounter name="text" defaultValue={m.text ?? ""} min={t.minWords} disabled={locked} />
              {!locked && needsCheck && (
                <fieldset className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><legend className="px-1 font-bold text-brand-navy">✔️ Check my writing (tick each one before sending)</legend>
                  {t.checklist.map((c) => <label key={c.id} className="flex items-start gap-2 py-0.5"><input type="checkbox" name={`c.${c.id}`} value="1" className="mt-1" /> {c.text}</label>)}
                </fieldset>
              )}
              {!locked && <div className="flex flex-wrap gap-2"><button name="submit" value="0" className="rounded-xl px-5 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">💾 Save draft</button><button name="submit" value="1" className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white">📤 {stage === "DRAFT" ? "Submit my draft for feedback" : stage === "REVISE" ? "Submit my final version" : "Submit to my teacher"}</button></div>}
              {m.status === "SUBMITTED" && <p className="font-semibold text-slate-600">Sent ✓ — {stage === "DRAFT" ? "your teacher will give feedback, then you revise." : "your teacher will score it."}</p>}
            </div>
            {t.staged || t.genre !== "FREE" ? <Frames t={t} plan={m.plan} /> : <span />}
          </form>
        )}
      </div>
      <details className="mt-4 rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200"><summary className="cursor-pointer font-semibold text-brand-navy">How it is scored ({t.rubric.min}–{t.rubric.max} for each part)</summary>
        <ul className="mt-2 space-y-2">{t.rubric.traits.map((r) => <li key={r.key}><b>{r.name}</b>: {r.what}{Object.keys(r.levels).length > 0 && <ul className="ml-4 text-slate-600">{[4, 3, 2, 1].map((n) => <li key={n}>{n} — {r.levels[n]}</li>)}</ul>}</li>)}</ul>
      </details>
    </PreviewFrame></AppShell>
  );
}

/** Sentence frames (and the finished plan) beside the writing. */
function Frames({ t, plan }: { t: StudentTaskView; plan?: Record<string, string> | null }) {
  return (
    <aside className="space-y-3 text-sm">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="font-bold text-brand-navy">💡 Sentence starters</p><ul className="mt-1 space-y-1">{t.organizer.frames.map((f, i) => <li key={i} className="rounded-lg bg-slate-50 px-2 py-1">{f}</li>)}</ul></div>
      {plan && <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="font-bold text-brand-navy">🗺️ My plan</p><dl className="mt-1 space-y-1">{t.organizer.fields.filter((fl) => plan[fl.key]).map((fl) => <div key={fl.key}><dt className="font-semibold">{fl.label}</dt><dd className="whitespace-pre-line text-slate-700">{plan[fl.key]}</dd></div>)}</dl></div>}
    </aside>
  );
}
