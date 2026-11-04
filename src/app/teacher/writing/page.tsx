import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { isLocked } from "@/server/writing/locked";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classTasks, classWritingErrors, taskForTeacher, writingSkillOptions, type TaskView } from "@/server/teacher/writing";
import { GENRES, GENRE_LABEL } from "@/server/writing/genres";
import { promptIdeasForGrade } from "@/server/writing/prompts";
import { PromptPicker } from "@/components/writing/prompt-picker";
import { WRITING_ERROR_CODES } from "@/server/writing/reteach";
import { MISCONCEPTION_BY_CODE } from "@/insights/misconceptions";
import { SkillListPicker, type SkillListRow } from "@/components/skill-picker";
import { LineIcon } from "@/components/ui/line-icon";
import { ITEM_PREVIEW } from "@/server/student/preview-as";
import { approveAiAction, cancelTaskAction, createTaskAction, dismissAiAction, reteachAction, requestAiAction, researchScoreAction, scoreAction, withdrawTaskAction } from "./actions";
import { SourceSelect } from "@/components/assign/source-select";
import type { ReactNode } from "react";
import type { AiHighlight } from "@/server/teacher/writing";

export const metadata = { title: "Writing & reading aloud" };

const box = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";
// the new-task form: the platform's field sizes (inputs 44px high, labels 14px semibold)
const inp = "mt-1.5 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-ink";
const area = "mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-ink";
const lbl = "block text-sm font-semibold text-ink";
const sel = "mt-1 block rounded-lg border border-slate-300 px-2 py-1.5";
const CODE_LABEL = (c: string) => MISCONCEPTION_BY_CODE.get(c)?.label ?? c;
const STAGE_LABEL: Record<string, string> = { PLAN: "planning", DRAFT: "drafting", REVISE: "revising", FINAL: "final" };

type Sub = TaskView["subs"][number];

function Hidden({ task, x }: { task: TaskView; x: Sub }) {
  return <><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="studentId" value={x.studentId} /><input type="hidden" name="classId" value={task.classId} /></>;
}

function statusLabel(task: TaskView, x: Sub): string {
  const max = task.rubric.traits.length * task.rubric.max;
  if (x.status === "NOT_STARTED") return "not started";
  if (x.status === "SCORED") return `✅ ${x.total}/${max}`;
  if (x.status === "SUBMITTED") return x.stage === "DRAFT" ? "⏳ draft to give feedback on" : x.stage === "FINAL" ? "⏳ final to score" : "⏳ to score";
  return x.stage ? STAGE_LABEL[x.stage] ?? "writing" : "writing (draft)";
}

/** The essay text with the AI's (or the teacher's edited) highlighted spots marked, each showing its fix on hover/tap. */
function HighlightedText({ text, highlights }: { text: string; highlights?: AiHighlight[] }) {
  if (!highlights?.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const ranges: { start: number; end: number; fix: string }[] = [];
  for (const h of highlights) {
    const q = h.quote.toLowerCase().trim();
    if (!q) continue;
    const start = lower.indexOf(q);
    if (start === -1) continue;
    const end = start + q.length;
    if (ranges.some((r) => start < r.end && end > r.start)) continue; // no overlapping highlights
    ranges.push({ start, end, fix: h.fix });
  }
  if (!ranges.length) return <>{text}</>;
  ranges.sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(<mark key={i} className="cursor-help rounded bg-rose-200 px-0.5 text-rose-950 underline decoration-rose-500 decoration-wavy" title={r.fix ? `✓ ${r.fix}` : undefined}>{text.slice(r.start, r.end)}</mark>);
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/** One student's work: research answers, plan, drafts, the AI draft to approve, scoring and reteach. */
function SubmissionCard({ task, x }: { task: TaskView; x: Sub }) {
  const max = task.rubric.max, levels = Array.from({ length: max - task.rubric.min + 1 }, (_, i) => task.rubric.min + i);
  const toRevise = task.staged && x.stage === "DRAFT" && x.status === "SUBMITTED";
  const canAct = task.canScore && (x.status === "SUBMITTED" || x.status === "SCORED");
  const pending = x.aiStatus === "PENDING" && x.ai;
  const shortQs = task.research.filter((q) => q.kind === "SHORT");
  return (
    <li id={`s-${x.studentId}`} className={`scroll-mt-24 break-inside-avoid rounded-2xl bg-white p-4 ring-1 ${x.status === "SUBMITTED" ? "ring-amber-300" : x.status === "SCORED" ? "ring-emerald-200" : "ring-slate-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-brand-navy">{x.name}</p>
        <span className="text-xs font-semibold text-slate-500">{statusLabel(task, x)}{x.submittedAt ? ` · ${x.submittedAt.slice(0, 10)}` : ""}{pending ? " · 🤖 AI draft to check" : ""}</span>
      </div>

      {x.research && task.research.length > 0 && (
        <details className="mt-2 rounded-xl bg-sky-50 p-3 text-sm ring-1 ring-sky-100">
          <summary className="cursor-pointer font-semibold">📚 Research answers · {x.researchScore?.points}/{x.researchScore?.max}{x.researchScore?.pending ? ` · ${x.researchScore.pending} to score` : ""}</summary>
          <ol className="mt-2 list-decimal space-y-1 ps-5">{task.research.map((q) => {
            const a = x.research!.answers[q.id];
            return <li key={q.id}><b>{q.q}</b> — {q.kind === "MC" ? `${q.options?.[Number(a)] ?? "–"} ${x.research!.scores[q.id] ? "✓" : "✗"}` : String(a ?? "–")}</li>;
          })}</ol>
          {task.canScore && shortQs.length > 0 && (
            <form action={researchScoreAction} className="mt-2 flex flex-wrap items-end gap-2">
              <Hidden task={task} x={x} />
              {shortQs.map((q) => <label key={q.id} className="font-semibold">Q{q.id.slice(1)} (0–2)<select name={`r.${q.id}`} defaultValue={x.research!.scores[q.id] ?? ""} className={sel}><option value="">–</option>{[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>)}
              <button className="rounded-lg bg-sky-700 px-3 py-1.5 font-semibold text-white">Save</button>
            </form>
          )}
        </details>
      )}
      {x.plan && <details className="mt-2 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">🗺️ Plan ({task.organizer.title})</summary><dl className="mt-2 space-y-1">{task.organizer.fields.filter((fl) => x.plan![fl.key]).map((fl) => <div key={fl.key}><dt className="font-semibold">{fl.label}</dt><dd className="whitespace-pre-line text-slate-700">{x.plan![fl.key]}</dd></div>)}</dl></details>}
      {x.firstDraft && <details className="mt-2 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">📝 First draft</summary><p className="mt-2 whitespace-pre-line">{x.firstDraft}</p></details>}
      {x.text && (x.status !== "DRAFT" || x.stage === "REVISE") && (
        <div className="mt-2 rounded-xl bg-slate-50 p-3 text-slate-900">
          <p className="whitespace-pre-line text-base leading-relaxed"><HighlightedText text={x.text} highlights={x.ai?.highlights} /></p>
          <p className="mt-1 text-xs text-slate-500">{x.words} words{x.checklist ? ` · self-check ✓ (${Object.keys(x.checklist).length}/${task.checklist.length})` : ""}{x.citesSource === true ? " · 📚 names a source" : x.citesSource === false ? " · ⚠️ does not name a source" : ""}{x.status === "DRAFT" ? " · still revising" : ""}{x.ai?.highlights?.length ? " · 🖍️ AI highlighted spots below (hover for the fix)" : ""}</p>
        </div>
      )}
      {x.moves.length > 0 && x.stage !== "FINAL" && <p className="mt-2 text-sm text-slate-700">🔧 Revision steps: {x.moves.map((m) => m.text).join(" · ")}</p>}
      {x.hasAudio && <audio controls preload="none" src={`/api/recordings?task=${task.id}&student=${x.studentId}`} className="mt-2 w-full" />}

      {canAct && pending && (
        <form action={approveAiAction} className="mt-3 rounded-xl bg-violet-50 p-3 text-sm ring-1 ring-violet-200 print:hidden">
          <Hidden task={task} x={x} />
          <p className="font-bold text-violet-900">🤖 AI draft — check, edit, then approve (the student sees nothing until you do)</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">{task.rubric.traits.map((t) => {
            const d = x.ai!.traits[t.key];
            return (
              <fieldset key={t.key} className="rounded-lg bg-white p-2 ring-1 ring-violet-100">
                <legend className="px-1 font-semibold">{t.name}</legend>
                <label className="block">Score<select name={`s.${t.key}`} defaultValue={d?.score ?? ""} required className={sel}><option value="" disabled>–</option>{levels.map((n) => <option key={n} value={n}>{n}{t.levels[n] ? ` — ${t.levels[n]}` : ""}</option>)}</select></label>
                <label className="mt-1 block">Strength<input name={`strength.${t.key}`} defaultValue={d?.strength ?? ""} maxLength={300} className={box} /></label>
                <label className="mt-1 block">Next step<input name={`next.${t.key}`} defaultValue={d?.nextStep ?? ""} maxLength={300} className={box} /></label>
              </fieldset>
            );
          })}</div>
          <fieldset className="mt-2"><legend className="font-semibold">Convention errors (uncheck any that are wrong)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">{x.ai!.conventions.map((c, i) => <label key={`${c.code}-${i}`} className="flex items-center gap-1"><input type="checkbox" name="code" value={c.code} defaultChecked /> {CODE_LABEL(c.code)}{c.example ? <i className="text-slate-500"> “{c.example}”</i> : null}</label>)}</div>
            <label className="mt-1 block">Add an error<select name="code" defaultValue="" className={sel}><option value="">–</option>{WRITING_ERROR_CODES.map((c) => <option key={c} value={c}>{CODE_LABEL(c)}</option>)}</select></label>
          </fieldset>
          <fieldset className="mt-2"><legend className="font-semibold">Highlighted spots in the essay (exact words → fix) — edit any, clear a row to remove it, or fill a blank row to add more</legend>
            <div className="mt-1 space-y-1">{[...(x.ai!.highlights ?? []), { quote: "", fix: "" }, { quote: "", fix: "" }].map((h, i) => (
              <div key={i} className="flex flex-wrap gap-1">
                <input name="hQuote" defaultValue={h.quote} placeholder="exact words from the essay" maxLength={160} className={`${box} min-w-[12rem] flex-1`} />
                <input name="hFix" defaultValue={h.fix} placeholder="corrected version" maxLength={160} className={`${box} min-w-[12rem] flex-1`} />
              </div>
            ))}</div>
          </fieldset>
          <label className="mt-2 block font-semibold">Summary for the student<input name="summary" defaultValue={x.ai!.summary} maxLength={400} className={box} /></label>
          <label className="mt-1 block font-semibold">Your comment (optional, replaces the summary as the comment)<input name="comment" maxLength={2000} className={box} /></label>
          {toRevise && <MovePicker task={task} />}
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded-xl bg-violet-700 px-4 py-2 font-semibold text-white">{toRevise ? "✓ Approve and send for revision" : "✓ Approve and score"}</button>
            <button formAction={dismissAiAction} formNoValidate className="rounded-xl px-4 py-2 font-semibold text-violet-900 ring-1 ring-violet-300">Dismiss the AI draft</button>
          </div>
        </form>
      )}
      {canAct && !pending && task.aiFeedback && x.status === "SUBMITTED" && x.aiStatus !== "APPROVED" && (
        <form action={requestAiAction} className="mt-2 print:hidden"><Hidden task={task} x={x} /><button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-violet-900 ring-1 ring-violet-300">🤖 Ask the AI for a feedback draft</button></form>
      )}

      {canAct && (
        <details className="mt-3 print:hidden" open={!pending}>
          <summary className="cursor-pointer text-sm font-semibold text-brand-navy">{pending ? "…or score by hand" : x.status === "SCORED" ? "Update the score" : toRevise ? "Give feedback on the draft" : "Score"}</summary>
          <form action={scoreAction} className="mt-2 space-y-2 text-sm">
            <Hidden task={task} x={x} />
            <div className="flex flex-wrap items-end gap-3">
              {task.rubric.traits.map((r) => <label key={r.key} className="font-semibold" title={r.what}>{r.name}<select name={`s.${r.key}`} defaultValue={x.scores?.[r.key] ?? ""} required className={sel}><option value="" disabled>–</option>{levels.map((n) => <option key={n} value={n} title={r.levels[n]}>{n}</option>)}</select></label>)}
              {task.kind === "READ_ALOUD" && <label className="font-semibold" title="Words read correctly in one minute">WCPM<input type="number" name="wcpm" min={0} max={400} placeholder="e.g. 95" className={`${sel} w-24 font-normal`} /></label>}
            </div>
            <label className="block font-semibold">Comment<textarea name="comment" defaultValue={x.comment ?? ""} maxLength={2000} rows={4} className={`${box} resize-y`} /></label>
            {task.kind === "WRITE" && <label className="block font-semibold">Convention errors seen (optional; feeds the class summary)<select name="code" multiple size={4} className={`${box} text-xs`}>{WRITING_ERROR_CODES.map((c) => <option key={c} value={c}>{CODE_LABEL(c)}</option>)}</select></label>}
            {toRevise && <MovePicker task={task} />}
            <button className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">{x.status === "SCORED" ? "Update" : toRevise ? "Send feedback for revision" : "Save score"}</button>
          </form>
        </details>
      )}

      {task.canScore && x.reteach.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200 print:hidden">
          <p className="font-semibold text-amber-900">🎯 Reteach (traits scored 2 or lower)</p>
          <ul className="mt-1 space-y-1">{x.reteach.map((r) => (
            <li key={r.trait} className="flex flex-wrap items-center gap-2"><span><b>{r.traitName}</b> ({r.score}):</span>
              {r.skills.length ? r.skills.map((k) => (
                <form key={k.id} action={reteachAction}><Hidden task={task} x={x} /><input type="hidden" name="skillId" value={k.id} /><input type="hidden" name="studentIds" value={x.studentId} /><span className="inline-flex items-center gap-1"><SourceSelect compact /><button className="rounded-full bg-white px-3 py-1 font-semibold text-brand-navy ring-1 ring-amber-300 hover:ring-brand-teal">⭐ Assign “{k.name}”</button></span></form>
              )) : <span className="text-slate-500">no matching skill in this curriculum</span>}
            </li>
          ))}</ul>
        </div>
      )}
    </li>
  );
}

function MovePicker({ task }: { task: TaskView }) {
  return (
    <fieldset className="mt-2"><legend className="font-semibold">Revision steps (choose 1–2, or leave empty to pick them from the lowest scores)</legend>
      <div className="grid gap-1 md:grid-cols-2">{task.moveOptions.map((m) => <label key={m.id} className="flex items-start gap-1"><input type="checkbox" name="move" value={m.id} className="mt-1" /> <span><b className="capitalize">{m.trait}</b>: {m.text}</span></label>)}</div>
    </fieldset>
  );
}

function NewTaskForm({ classId, grade, skills, tr }: { classId: string; grade: number; skills: SkillListRow[]; tr: (k: string) => string }) {
  const kindTile = "inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg px-3 font-semibold text-ink ring-1 ring-slate-300 has-[:checked]:bg-surface-2 has-[:checked]:ring-brand-navy";
  const formId = `new-writing-task-${classId}`;
  const ideas = promptIdeasForGrade(grade).map((p) => ({ id: p.id, genre: p.genre, genreLabel: GENRE_LABEL[p.genre], title: p.title, prompt: p.prompt }));
  return (
    <form id={formId} action={createTaskAction} className="mt-4 grid gap-x-5 gap-y-4 border-t border-line pt-4 text-sm md:grid-cols-2">
      <input type="hidden" name="classId" value={classId} />
      <div role="radiogroup" className="flex flex-wrap gap-2 md:col-span-2">
        <label className={kindTile}><input type="radio" name="kind" value="WRITE" defaultChecked /><LineIcon name="writing" className="h-[18px] w-[18px]" />{tr("Writing")}</label>
        <label className={kindTile}><input type="radio" name="kind" value="READ_ALOUD" /><LineIcon name="mic" className="h-[18px] w-[18px]" />{tr("Read aloud")}</label>
      </div>
      {ideas.length > 0 && <PromptPicker ideas={ideas} formId={formId} />}
      <label className={lbl}>{tr("Genre (writing)")}<select name="genre" defaultValue="NARRATIVE" className={inp}>{GENRES.map((g) => <option key={g} value={g}>{GENRE_LABEL[g]}</option>)}</select></label>
      <label className={lbl}>{tr("Title")}<input name="title" required maxLength={191} className={inp} /></label>
      <label className={lbl}>{tr("What students do")}<textarea name="prompt" required rows={4} className={area} placeholder="e.g. Write an opinion: should every school have a garden? Give two reasons." /></label>
      <label className={lbl}>{tr("Text (to read aloud, or to write about)")}<textarea name="passage" rows={4} className={area} /></label>
      <label className={lbl}>{tr("Min. words")}<input name="minWords" type="number" min={10} max={1000} className={inp} /></label>
      <label className={lbl}>{tr("Due")}<input name="dueAt" type="date" className={inp} /></label>
      <div className="grid gap-2 md:col-span-2">
        <label className="flex items-start gap-2"><input type="checkbox" name="staged" value="1" className="mt-1" /> <span><b>Staged</b>: plan (organizer + sentence frames) → draft → revise with 1–2 steps → final</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="aiFeedback" value="1" className="mt-1" /> <span><b>AI feedback drafts</b>: you check and approve each one before the student sees it (only the writing, genre and rubric are sent)</span></label>
      </div>
      <div className="md:col-span-2">
      <SkillListPicker skills={skills} mode="single" name="skillId" optional allowEmpty legend="Skill it practises (optional)" height="max-h-64" />
      </div>
      <details className="rounded-xl bg-slate-50 p-3 md:col-span-2">
        <summary className="cursor-pointer font-semibold">Sources (up to 3) — needed for Research</summary>
        {[1, 2, 3].map((i) => <div key={i} className="mt-2"><label className="block font-semibold">Source {i} title<input name={`src${i}.title`} maxLength={120} className={box} /></label><label className="block">Text<textarea name={`src${i}.text`} rows={3} maxLength={8000} className={box} /></label></div>)}
      </details>
      <details className="rounded-xl bg-slate-50 p-3 md:col-span-2">
        <summary className="cursor-pointer font-semibold">Research questions (up to 3), answered before writing</summary>
        {[1, 2, 3].map((i) => (
          <div key={i} className="mt-2 space-y-1 border-t border-slate-200 pt-2">
            <label className="block font-semibold">Question {i}<input name={`rq${i}.q`} maxLength={300} className={box} /></label>
            <label className="block">Kind<select name={`rq${i}.kind`} defaultValue="SHORT" className={sel}><option value="SHORT">Short answer (you score 0–2)</option><option value="MC">Multiple choice (scored automatically)</option></select></label>
            <div className="grid grid-cols-2 gap-1">{["A", "B", "C", "D"].map((l) => <input key={l} name={`rq${i}.opt${l}`} placeholder={`Choice ${l}`} maxLength={200} className="rounded-lg border border-slate-300 px-2 py-1" />)}</div>
            <label className="block">Correct choice (multiple choice)<select name={`rq${i}.answer`} defaultValue="" className={sel}><option value="">–</option>{["A", "B", "C", "D"].map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
          </div>
        ))}
      </details>
      <div className="md:col-span-2"><button className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-navy px-5 font-semibold text-white hover:bg-brand-purple"><LineIcon name="send" className="h-[18px] w-[18px]" />{tr("Assign to the class")}</button></div>
    </form>
  );
}

/** ✍️ Genre writing (rubrics, self-checks, stages, sources, AI drafts to approve, reteach) and 🎙 reading-aloud recordings. */
export default async function WritingPage({ searchParams }: { searchParams: Promise<{ classId?: string; task?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t: tr } = await getT();
  // 🔒 a locked rubric task opens its submissions page
  if (sp.task && isLocked(await repo.findUnique("WritingTask", { id: sp.task }))) redirect(`/teacher/writing/task/${encodeURIComponent(sp.task)}`);
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const klass = classes.find((c) => String(c.id) === classId);
  const [tasks, task, errors, skills, gradeRow] = classId
    ? await Promise.all([classTasks(repo, actor, classId), sp.task ? taskForTeacher(repo, actor, sp.task).catch(() => null) : Promise.resolve(null), classWritingErrors(repo, actor, classId), writingSkillOptions(repo, actor, classId), klass ? repo.findUnique("Grade", { id: klass.gradeId }) : Promise.resolve(null)])
    : [[], null, { rows: [], pending: 0, pieces: 0 }, [], null];
  const grade = Number(gradeRow?.level ?? 0);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="✍️" title="Writing & Reading Aloud" subtitle="Genre writing with 4-trait rubrics and student self-checks, staged plan → draft → revise, source-based research, AI feedback drafts you approve, and reading aloud."><PrintButton /></PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <nav aria-label={tr("Classes")} className="flex flex-wrap gap-2 print:hidden">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/writing?classId=${String(c.id)}`} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav>
      {/* one compact toolbar: the main actions, aligned and the same height */}
      <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link prefetch={false} href={`/teacher/writing/new?classId=${classId}`} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold bg-brand-navy text-white hover:bg-brand-purple"><LineIcon name="lock" className="h-[18px] w-[18px]" />{tr("New writing task (rubric, locked page)")}</Link>
        <Link prefetch={false} href="/teacher/writing/rubrics" className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold bg-surface text-brand-navy ring-1 ring-line hover:ring-brand-teal"><LineIcon name="scale" className="h-[18px] w-[18px]" />{tr("Rubrics")}</Link>
        <Link prefetch={false} href={`/teacher/writing/report?classId=${classId}`} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold bg-surface text-brand-navy ring-1 ring-line hover:ring-brand-teal"><LineIcon name="chart" className="h-[18px] w-[18px]" />{tr("Writing results")}</Link>
      </div>
      <details className="group/new mt-4 rounded-[1.25rem] bg-surface p-5 shadow-card ring-1 ring-line print:hidden" open={!tasks.length}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-brand-navy [&::-webkit-details-marker]:hidden"><span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 ring-1 ring-line"><LineIcon name="plus" className="h-4 w-4" /></span>{tr("New genre task or reading aloud")}<LineIcon name="chevron" className="ms-auto h-4 w-4 text-muted transition-transform group-open/new:rotate-90 rtl:-scale-x-100" /></summary>
        <NewTaskForm classId={classId} grade={grade} skills={skills} tr={tr} />
      </details>
      {/* tasks + the chosen task: a side list beside the task when one is open; otherwise the list takes the full width (no empty panel) */}
      <div className={`mt-5 grid gap-5 ${task ? "lg:grid-cols-[20rem_minmax(0,1fr)]" : ""}`}>
        <aside className="space-y-4 print:hidden">
          <section aria-labelledby="wt-h" className="rounded-[1.25rem] bg-surface p-4 shadow-card ring-1 ring-line">
            <h2 id="wt-h" className="flex items-center gap-2 text-base font-semibold text-ink"><LineIcon name="file" className="h-[18px] w-[18px] text-ink-2" />{tr("Tasks")} <span className="text-sm font-normal text-muted">({tasks.length})</span></h2>
            {!tasks.length ? <p className="mt-2 text-sm text-muted">{tr("No tasks for this class yet.")}</p> : (
              <>
                {!task && <p className="mt-1 text-sm text-muted">{tr("Choose a task to see the students' work.")}</p>}
                <ul className={`mt-3 grid gap-2 ${task ? "" : "sm:grid-cols-2 xl:grid-cols-3"}`}>{tasks.map((t) => <li key={t.id}><Link href={t.locked ? `/teacher/writing/task/${t.id}` : `/teacher/writing?classId=${classId}&task=${t.id}`} aria-current={task?.id === t.id ? "page" : undefined} className={`flex h-full items-start gap-2 rounded-xl p-3 text-sm ring-1 ${task?.id === t.id ? "bg-brand-navy text-white ring-brand-navy" : "bg-white ring-slate-200 hover:ring-brand-teal"}`}><LineIcon name={t.locked ? "lock" : t.kind === "WRITE" ? "writing" : "mic"} className="mt-0.5 h-4 w-4 shrink-0 opacity-80" /><span className="min-w-0"><span className="block font-semibold">{t.title}</span><span className="block text-xs opacity-80">{t.locked ? `${tr("Rubric · locked page")} · ` : t.kind === "WRITE" ? `${GENRE_LABEL[t.genre].split(" (")[0]}${t.staged ? " · staged" : ""} · ` : ""}{t.submitted}/{t.members} handed in · {t.scored} scored{t.aiPending ? ` · ${t.aiPending} AI to check` : ""}{t.dueAt ? ` · due ${t.dueAt.slice(0, 10)}` : ""}</span></span></Link></li>)}</ul>
              </>
            )}
          </section>
          <section aria-labelledby="we-h" className="rounded-[1.25rem] bg-surface p-4 text-sm shadow-card ring-1 ring-line">
            <h2 id="we-h" className="flex items-center gap-2 text-base font-semibold text-ink"><LineIcon name="flag" className="h-[18px] w-[18px] text-ink-2" />{tr("Class writing errors")}</h2>
            {!errors.rows.length ? <p className="mt-1 text-slate-600">No approved feedback with error tags yet{errors.pending ? ` (${errors.pending} AI draft${errors.pending === 1 ? "" : "s"} waiting for you)` : ""}.</p> : (
              <ol className="mt-2 space-y-2">{errors.rows.map((r) => (
                <li key={r.code}>
                  <p><b>{r.label}</b> <span className="text-slate-500">· {r.count}× · {r.students} student{r.students === 1 ? "" : "s"}</span></p>
                  {r.fix && <p className="text-xs text-slate-600">{r.fix}</p>}
                  {task && <div className="mt-1 flex flex-wrap gap-1">{r.skills.map((k) => <form key={k.id} action={reteachAction}><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="classId" value={classId} /><input type="hidden" name="skillId" value={k.id} /><span className="inline-flex items-center gap-1"><SourceSelect compact /><button className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">⭐ Assign “{k.name}” to the class</button></span></form>)}</div>}
                </li>
              ))}</ol>
            )}
            {errors.pieces > 0 && <p className="mt-2 text-xs text-slate-500">From {errors.pieces} piece{errors.pieces === 1 ? "" : "s"} of approved feedback.{!task && " Open a task to assign reteach skills."}</p>}
          </section>
        </aside>
        {task && (
          <section className="min-w-0">
              <div className="rounded-[1.25rem] bg-surface p-5 shadow-card ring-1 ring-line">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-xl font-bold text-brand-navy"><LineIcon name={task.kind === "WRITE" ? "writing" : "mic"} className="h-5 w-5 shrink-0" />{task.title}</h2>
                  {task.canScore && (
                    <details className="print:hidden">
                      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-xl bg-white px-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:ring-rose-400">✖ {tr("Cancel task")}</summary>
                      <div className="mt-2 flex max-w-sm flex-col gap-2 rounded-xl bg-rose-50 p-3 text-sm ring-1 ring-rose-200">
                        {/* 🗑 r87: the teacher's own choice — stop it but keep the record, or delete it for good */}
                        <form action={withdrawTaskAction} className="flex flex-col gap-1">
                          <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="classId" value={task.classId} /><input type="hidden" name="kind" value={task.kind} />
                          <p className="text-amber-900">{tr("Stop sending to students. Work already given is kept, and you can undo this from Assigned.")}</p>
                          <button className="self-start rounded-lg bg-white px-3 py-1.5 font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50">{tr("Stop (keep saved)")}</button>
                        </form>
                        <form action={cancelTaskAction} className="flex flex-col gap-1 border-t border-rose-200 pt-2">
                          <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="classId" value={task.classId} />
                          <p className="text-rose-900">{tr("Gone from here for good; no Undo. Work already submitted or scored stays in the history.")}</p>
                          <button className="self-start rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white hover:bg-rose-800">{tr("Delete permanently")}</button>
                        </form>
                      </div>
                    </details>
                  )}
                </div>
                {task.subs[0] && <Link prefetch={false} href={ITEM_PREVIEW.writing(task.id, task.subs[0].studentId)} className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 print:hidden">👀 {tr("Preview as student")}</Link>}
                <p className="text-sm text-slate-500">{task.genreLabel}{task.staged ? " · staged (plan → draft → revise → final)" : ""}{task.aiFeedback ? " · 🤖 AI drafts" : ""}{task.skill ? ` · skill: ${task.skill.name}` : ""}</p>
                <p className="mt-1 whitespace-pre-line text-slate-700">{task.prompt}</p>
                {task.passage && <details className="mt-2 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">The text</summary><p className="mt-2 whitespace-pre-line">{task.passage}</p></details>}
                {task.sources.map((src, i) => <details key={i} className="mt-2 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">📚 Source {i + 1}: {src.title}</summary><p className="mt-2 whitespace-pre-line">{src.text}</p></details>)}
                {task.research.length > 0 && <details className="mt-2 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">❓ Research questions</summary><ol className="mt-2 list-decimal ps-5">{task.research.map((q) => <li key={q.id}>{q.q} {q.kind === "MC" ? <span className="text-slate-500">({q.options?.map((o, i) => (i === q.answer ? `✓ ${o}` : o)).join(" / ")})</span> : <span className="text-slate-500">(short answer, 0–2)</span>}</li>)}</ol></details>}
                <details className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">Rubric ({task.rubric.min}–{task.rubric.max} each){task.kind === "WRITE" && task.genre !== "FREE" ? " and the student self-check" : ""}</summary>
                  <ul className="mt-2 space-y-1">{task.rubric.traits.map((r) => <li key={r.key}><b>{r.name}</b> — {r.what}{Object.keys(r.levels).length > 0 && <ul className="ms-4 text-xs text-slate-600">{[4, 3, 2, 1].map((n) => <li key={n}>{n}: {r.levels[n]}</li>)}</ul>}</li>)}</ul>
                  {task.kind === "WRITE" && task.genre !== "FREE" && <ul className="mt-2 list-disc ps-5 text-xs text-slate-600">{task.checklist.map((c) => <li key={c.id}>{c.text}</li>)}</ul>}
                </details>
              </div>
              <ul className="mt-4 space-y-3">{task.subs.map((x) => <SubmissionCard key={x.studentId} task={task} x={x} />)}</ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
