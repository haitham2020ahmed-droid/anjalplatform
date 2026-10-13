/**
 * ✏️ The plan editor's parts (server components; every button is a small form posting to a server action, so the
 * page stays light). 1 Who → 2 What → 3 Preview → 4 Send. Teachers see levels; the student preview never does.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { TFn } from "@/i18n";
import { Section } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { PassageText } from "@/components/passage-text";
import { hideLevels } from "@/lib/hide-levels";
import { editorPlanLabel, type EditorSection, type PlanEditorView, type PlanStatus, type Txt } from "@/server/plans/editor";
import { planKindOf } from "@/server/plans/program";
import { DEFAULT_TARGET_CORRECT } from "@/server/teacher/assign";
import type { StudentPlanView } from "@/server/curriculum-map/plans";
import { StudyPlan } from "@/components/student/study-plan";
import type { FullQuestion, MapLesson, QuestionLine } from "@/server/plans/question-pick";
import { ProgramChip } from "./program-chip";
import { BTN, BTN_MAIN, BTN_SOFT } from "./plan-builder";
import {
  addQuestionsAction, addSectionAction, deleteDraftAction, duplicatePlanAction, pausePlanAction, questionAction, saveDetailsAction,
  saveStudentsAction, sectionAction, sendPlanAction, withdrawPlanAction,
} from "@/app/teacher/plans/editor-actions";

export type EditorStep = "what" | "preview" | "send";
/** A stored sentence in the reader's language (values kept as they are). */
export const say = (t: TFn, x: Txt | string): string => (typeof x === "string" ? t(x) : t(x.t, x.v));
const BOX = "min-h-11 rounded-xl border border-slate-300 bg-white px-3";
const SMALL = "inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold";
const SMALL_SOFT = `${SMALL} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`;
const LEVEL_TONE: Record<string, string> = { BELOW: "bg-amber-50 text-amber-900 ring-amber-200", ON: "bg-sky-50 text-sky-900 ring-sky-200", ABOVE: "bg-violet-50 text-violet-900 ring-violet-200" };
const LEVEL_NAME: Record<string, string> = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };
export const STATUS_CHIP: Record<PlanStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-800 ring-slate-300" },
  SENT: { label: "Sent", className: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  PAUSED: { label: "Paused", className: "bg-amber-50 text-amber-900 ring-amber-200" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-red-50 text-red-900 ring-red-200" },
};

export function StatusChip({ t, status, finished }: { t: TFn; status: PlanStatus; finished?: boolean }) {
  const c = finished && status === "SENT" ? { label: "Finished", className: "bg-slate-100 text-slate-700 ring-slate-300" } : STATUS_CHIP[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c.className}`}>{t(c.label)}</span>;
}

/** The hidden fields every editor form carries (the plan, and where to come back). */
function Keep({ planId, step = "what", anchor }: { planId: string; step?: EditorStep; anchor?: string }) {
  return <><input type="hidden" name="planId" value={planId} /><input type="hidden" name="step" value={step} />{anchor && <input type="hidden" name="anchor" value={anchor} />}</>;
}

/** 1 Who → 2 What → 3 Preview → 4 Send (links; the current step is marked). */
export function PlanStepper({ t, planId, step }: { t: TFn; planId: string; step: EditorStep }) {
  const steps: [EditorStep | "who", string][] = [["who", "1 · Who"], ["what", "2 · What"], ["preview", "3 · Preview"], ["send", "4 · Send"]];
  return (
    <nav aria-label={t("Steps")} className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
      {steps.map(([k, label], i) => {
        const on = k === step;
        const href = k === "who" ? `/teacher/plans/${planId}?step=what#who` : `/teacher/plans/${planId}?step=${k}`;
        return (
          <span key={k} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className="text-slate-400 rtl:rotate-180">→</span>}
            <Link href={href} aria-current={on ? "step" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{t(label)}</Link>
          </span>
        );
      })}
    </nav>
  );
}

export function StatusBanner({ t, v }: { t: TFn; v: PlanEditorView }) {
  const text = v.status === "DRAFT" ? t("Draft: nothing reaches students until you press Send.")
    : v.status === "PAUSED" ? t("Paused: students do not see this plan. Your changes are kept; press Resume to bring it back.")
    : v.status === "WITHDRAWN" ? t("Withdrawn: students no longer have this work. Answers already given are kept. Duplicate it to use it again.")
    : t("Sent on {date}. Changes you make reach the students at once; answers already given stay recorded.", { date: v.sentAt ?? "" });
  const tone = v.status === "DRAFT" ? "bg-slate-50 text-slate-800 ring-slate-200" : v.status === "SENT" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200";
  return (
    <div className={`mb-5 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${tone}`}>
      <StatusChip t={t} status={v.status} finished={v.finished} />
      <ProgramChip program={v.program} />
      <span className="min-w-0 flex-1">{text}</span>
      {v.status !== "DRAFT" && (
        <span className="flex w-44 items-center gap-2" title={t("Progress")}>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-slate-200"><span className="block h-full bg-brand-teal" style={{ width: `${v.progress}%` }} /></span>
          <span className="w-10 text-end tabular-nums">{v.progress}%</span>
        </span>
      )}
    </div>
  );
}

/** Why the platform suggested it, with the data behind it. */
export function WhyBox({ t, v }: { t: TFn; v: PlanEditorView }) {
  if (!v.source) return null;
  return (
    <Section title="Why this plan" icon="💡" tone="sky">
      <p className="font-semibold text-brand-navy">{v.source.reasonT ? say(t, v.source.reasonT) : t(v.source.reason)}</p>
      {v.source.sources.length > 0 && <p className="mt-1 flex flex-wrap gap-1 text-xs">{v.source.sources.map((x) => <span key={x} className="rounded-full bg-white px-2 py-0.5 ring-1 ring-sky-200">{t(x)}</span>)}</p>}
      {v.source.rows.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer font-semibold text-brand-navy">{t("See the data ({n} student(s))", { n: v.source.rows.length })}</summary>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {v.source.rows.map((r, i) => <li key={`${r.name}${i}`} className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200"><p className="font-semibold"><bdi>{r.name}</bdi></p><ul className="mt-1 list-disc ps-5 text-slate-700">{r.lines.map((l, j) => <li key={j}>{say(t, l)}</li>)}</ul></li>)}
          </ul>
        </details>
      )}
    </Section>
  );
}

/** What the teacher changed from the platform's version. */
export function ChangesBox({ t, v }: { t: TFn; v: PlanEditorView }) {
  if (!v.hasBaseline) return null;
  return (
    <Section title="What changed from the platform's version" icon="🔁">
      {v.changes.length === 0 ? <p className="text-sm text-slate-600">{t("No changes yet: this is the platform's suggestion.")}</p> : (
        <ul className="space-y-1 text-sm">
          {v.changes.map((c, i) => (
            <li key={`${c.name}${i}`} className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${c.kind === "ADDED" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : c.kind === "REMOVED" ? "bg-red-50 text-red-900 ring-red-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>{t(c.kind === "ADDED" ? "Added" : c.kind === "REMOVED" ? "Removed" : "Changed")}</span>
              <span className="font-medium">{t(c.name)}</span>
              {c.detail.length > 0 && <span className="text-slate-600">· {c.detail.map((d) => say(t, d)).join(" · ")}</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Name, goals, note, dates. */
export function DetailsForm({ t, v, readOnly }: { t: TFn; v: PlanEditorView; readOnly: boolean }) {
  return (
    <Section title="Plan details" icon="📝">
      <form action={saveDetailsAction} className="grid gap-4 md:grid-cols-2">
        <Keep planId={v.id} anchor="details" />
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-2">{t("Plan name")}<input name="title" defaultValue={v.title} maxLength={191} required className={BOX} disabled={readOnly} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Goals")}<textarea name="goals" defaultValue={v.goals ?? ""} maxLength={1000} rows={2} placeholder={t("e.g. 80% right on Central Idea by the due date")} className="rounded-xl border border-slate-300 bg-white p-3 font-normal" disabled={readOnly} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Note to students (optional)")}<textarea name="note" defaultValue={v.note ?? ""} maxLength={1000} rows={2} className="rounded-xl border border-slate-300 bg-white p-3 font-normal" disabled={readOnly} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Start date (optional)")}<input type="date" name="startAt" defaultValue={v.startAt ?? ""} className={BOX} disabled={readOnly} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Due date (optional)")}<input type="date" name="dueAt" defaultValue={v.dueAt ?? ""} className={BOX} disabled={readOnly} /></label>
        {!readOnly && <div className="flex justify-end md:col-span-2"><button className={BTN_SOFT}>{t("Save details")}</button></div>}
      </form>
    </Section>
  );
}

/** 1 · Who: the whole class or chosen students. */
export function StudentsForm({ t, v, readOnly }: { t: TFn; v: PlanEditorView; readOnly: boolean }) {
  const chosen = new Set(v.planStudentIds);
  return (
    <div id="who">
      <Section title="1 · Who is it for?" icon="👥" hint={t("{n} of {total} student(s) of {class}.", { n: v.planStudentIds.length, total: v.classStudents.length, class: v.className })}>
        <form action={saveStudentsAction}>
          <Keep planId={v.id} anchor="who" />
          {v.classStudents.map((st) => <input key={st.id} type="hidden" name="all" value={st.id} />)}
          <div className="flex flex-wrap gap-2">
            {([["class", t("Whole class ({n})", { n: v.classStudents.length })], ["some", t("Chosen students")]] as const).map(([k, label]) => (
              <label key={k} className={`${BTN} cursor-pointer gap-2 ring-1 ring-slate-300 has-[:checked]:bg-brand-navy has-[:checked]:text-white`}><input type="radio" name="who" value={k} defaultChecked={(k === "class") === v.wholeClass} className="sr-only" disabled={readOnly} />{label}</label>
            ))}
          </div>
          <div className="mt-3 grid max-h-72 gap-1 overflow-y-auto rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {v.classStudents.map((st) => <label key={st.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-white px-2 ring-1 ring-slate-100"><input type="checkbox" name="sid" value={st.id} defaultChecked={chosen.has(st.id)} className="h-5 w-5 accent-brand-teal" disabled={readOnly} /><bdi>{st.name}</bdi></label>)}
          </div>
          {!readOnly && <div className="mt-3 flex justify-end"><button className={BTN_SOFT}>{t("Save students")}</button></div>}
        </form>
      </Section>
    </div>
  );
}

function SectionButton({ planId, k, op, label, extra, className = SMALL_SOFT, title }: { planId: string; k: string; op: string; label: string; extra?: ReactNode; className?: string; title?: string }) {
  return <form action={sectionAction} className="inline"><Keep planId={planId} anchor={`part-${k}`} /><input type="hidden" name="key" value={k} /><input type="hidden" name="op" value={op} />{extra}<button className={className} title={title} aria-label={title}>{label}</button></form>;
}
function QuestionButton({ planId, k, q, op, label, title }: { planId: string; k: string; q: string; op: string; label: string; title: string }) {
  return <form action={questionAction} className="inline"><Keep planId={planId} anchor={`part-${k}`} /><input type="hidden" name="key" value={k} /><input type="hidden" name="questionId" value={q} /><input type="hidden" name="op" value={op} /><button className={`${SMALL} min-w-9 bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal`} title={title} aria-label={title}>{label}</button></form>;
}

/** One part of the plan: its skill (or lesson), students, count, level, lesson, and every question. */
export function SectionCard({ t, v, x, i, n, readOnly, addOpen, bank, types, filters }: {
  t: TFn; v: PlanEditorView; x: EditorSection; i: number; n: number; readOnly: boolean; addOpen: boolean;
  bank?: QuestionLine[]; types: { code: string; name: string }[]; filters: { level: string; type: string; text: string };
}) {
  const sent = v.status !== "DRAFT";
  const subset = x.studentIds !== null;
  return (
    <li id={`part-${x.key}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-navy font-bold text-white tabular-nums">{i + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-brand-navy">{x.label ?? x.skillName}</h3>
          <p className="text-sm text-slate-600">
            {x.label && <>{t("Skill")}: {x.skillName} · </>}
            {x.auto ? t("The platform chooses at each student's level") : t("{n} question(s)", { n: x.questions.length })}
            {x.lesson && <> · 🧩 {t("with the lesson")}</>}
            {x.reason && <> · <span className="italic">{t(x.reason)}</span></>}
          </p>
          <p className="mt-1 text-sm text-slate-600">👥 {subset ? x.students.map((s) => s.name).slice(0, 6).join(", ") + (x.students.length > 6 ? ` +${x.students.length - 6}` : "") : t("Everyone in the plan ({n})", { n: x.students.length })}{sent && x.total > 0 && <> · ✅ {t("{done}/{total} done", { done: x.done, total: x.total })}</>}</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-1">
            <SectionButton planId={v.id} k={x.key} op="up" label="↑" title={t("Move up")} className={`${SMALL_SOFT} ${i === 0 ? "opacity-40" : ""}`} />
            <SectionButton planId={v.id} k={x.key} op="down" label="↓" title={t("Move down")} className={`${SMALL_SOFT} ${i === n - 1 ? "opacity-40" : ""}`} />
            <SectionButton planId={v.id} k={x.key} op="remove" label={t("Remove")} className={`${SMALL} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`} />
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
          <form action={sectionAction} className="flex items-end gap-2">
            <Keep planId={v.id} anchor={`part-${x.key}`} /><input type="hidden" name="key" value={x.key} /><input type="hidden" name="op" value="count" />
            <label className="flex flex-col gap-1 font-semibold text-slate-700">{t("Number of questions")}<input type="number" name="count" min={1} max={50} defaultValue={x.auto ? 10 : x.questions.length} className={`${BOX} w-24`} /></label>
            <button className={SMALL_SOFT}>{t("Save")}</button>
          </form>
          <form action={sectionAction} className="flex items-end gap-2">
            <Keep planId={v.id} anchor={`part-${x.key}`} /><input type="hidden" name="key" value={x.key} /><input type="hidden" name="op" value="level" />
            <label className="flex flex-col gap-1 font-semibold text-slate-700">{t("Level for new questions")}
              <select name="level" defaultValue={x.level ?? ""} className={BOX}><option value="">{t("Any level")}</option>{["BELOW", "ON", "ABOVE"].map((l) => <option key={l} value={l}>{t(LEVEL_NAME[l])}</option>)}</select>
            </label>
            <button className={SMALL_SOFT}>{t("Save")}</button>
          </form>
          <SectionButton planId={v.id} k={x.key} op="lesson" label={x.lesson ? t("Take the lesson out") : t("Add the skill's lesson")} extra={<input type="hidden" name="on" value={x.lesson ? "0" : "1"} />} />
          {x.auto ? <SectionButton planId={v.id} k={x.key} op="pick" label={t("Pick the questions myself")} className={`${SMALL} bg-brand-navy text-white hover:bg-brand-purple`} />
            : !x.assessmentId && !x.placeCode && <SectionButton planId={v.id} k={x.key} op="auto" label={t("Let the platform choose")} />}
          <details className="w-full">
            <summary className="min-h-11 cursor-pointer font-semibold text-brand-navy">{t("Students of this part")}</summary>
            <form action={sectionAction} className="mt-2">
              <Keep planId={v.id} anchor={`part-${x.key}`} /><input type="hidden" name="key" value={x.key} /><input type="hidden" name="op" value="students" />
              <label className="flex min-h-11 items-center gap-2"><input type="radio" name="who" value="all" defaultChecked={!subset} className="h-5 w-5" />{t("Everyone in the plan")}</label>
              <label className="flex min-h-11 items-center gap-2"><input type="radio" name="who" value="some" defaultChecked={subset} className="h-5 w-5" />{t("Only these students:")}</label>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                {v.classStudents.filter((s) => v.planStudentIds.includes(s.id)).map((s) => <label key={s.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-white px-2 ring-1 ring-slate-100"><input type="checkbox" name="sid" value={s.id} defaultChecked={x.students.some((y) => y.id === s.id)} className="h-5 w-5 accent-brand-teal" /><bdi>{s.name}</bdi></label>)}
              </div>
              <div className="mt-2 flex justify-end"><button className={SMALL_SOFT}>{t("Save")}</button></div>
            </form>
          </details>
        </div>
      )}

      {x.auto ? (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">{t("The platform chooses at each student's level from {n} questions of this skill. Press “Pick the questions myself” to see and change each question.", { n: x.poolSize ?? 0 })}</p>
      ) : (
        <ol className="mt-3 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {x.questions.map((q, qi) => (
            <li key={q.id} className={`flex flex-wrap items-start gap-2 px-3 py-2 ${q.published ? "" : "bg-red-50"}`}>
              <span className="w-6 shrink-0 pt-1 text-sm tabular-nums text-slate-500">{qi + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-slate-900">{q.stem || t("(no text)")}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-600">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${LEVEL_TONE[q.level]}`}>{t(LEVEL_NAME[q.level])}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{q.type}</span>
                  <span>{q.skillName}</span>
                  {q.passageTitle && <span>· 📖 {q.passageTitle}</span>}
                  {!q.published && <span className="font-semibold text-red-700">· {t("No longer published: replace it")}</span>}
                  {sent && q.answeredBy > 0 && <span className="font-semibold text-emerald-800">· {t("answered by {n}", { n: q.answeredBy })}</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Link href={`/teacher/plans/${v.id}?open=${q.id}#question`} className={`${SMALL} bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal`}>{t("Open")}</Link>
                {!readOnly && <>
                  <QuestionButton planId={v.id} k={x.key} q={q.id} op="up" label="↑" title={t("Move up")} />
                  <QuestionButton planId={v.id} k={x.key} q={q.id} op="down" label="↓" title={t("Move down")} />
                  <QuestionButton planId={v.id} k={x.key} q={q.id} op="replace" label="⇄" title={t("Replace with a similar one")} />
                  <QuestionButton planId={v.id} k={x.key} q={q.id} op="remove" label="✕" title={t("Remove")} />
                </>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {sent && !x.auto && x.questions.some((q) => q.answeredBy > 0) && <p className="mt-2 text-xs text-slate-500">{t("Answers already given stay in the students' records, even if you remove the question.")}</p>}

      {!readOnly && !x.auto && (
        addOpen ? <BankPanel t={t} v={v} x={x} bank={bank ?? []} types={types} filters={filters} />
          : <div className="mt-3"><Link href={`/teacher/plans/${v.id}?add=${x.key}#part-${x.key}`} className={SMALL_SOFT}>＋ {t("Add questions from the bank")}</Link></div>
      )}
    </li>
  );
}

/** Add questions to a part: the bank of its skill (or its lesson), by level, type and words; nothing already in the plan. */
function BankPanel({ t, v, x, bank, types, filters }: { t: TFn; v: PlanEditorView; x: EditorSection; bank: QuestionLine[]; types: { code: string; name: string }[]; filters: { level: string; type: string; text: string } }) {
  return (
    <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <form method="get" action={`/teacher/plans/${v.id}`} className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="add" value={x.key} />
        <label className="flex flex-col gap-1 font-semibold text-slate-700">{t("Level")}<select name="level" defaultValue={filters.level} className={BOX}><option value="">{t("Any level")}</option>{["BELOW", "ON", "ABOVE"].map((l) => <option key={l} value={l}>{t(LEVEL_NAME[l])}</option>)}</select></label>
        <label className="flex flex-col gap-1 font-semibold text-slate-700">{t("Type")}<select name="type" defaultValue={filters.type} className={BOX}><option value="">{t("Any type")}</option>{types.map((ty) => <option key={ty.code} value={ty.code}>{ty.name}</option>)}</select></label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 font-semibold text-slate-700">{t("Words in the question")}<input name="text" defaultValue={filters.text} className={`${BOX} font-normal`} /></label>
        <button className={SMALL_SOFT}>{t("Search")}</button>
        <Link href={`/teacher/plans/${v.id}#part-${x.key}`} className={`${SMALL} text-slate-600 underline`}>{t("Close")}</Link>
      </form>
      {bank.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t("No more questions match: every question of this skill that fits is in the plan already.")}</p> : (
        <form action={addQuestionsAction} className="mt-2">
          <Keep planId={v.id} anchor={`part-${x.key}`} /><input type="hidden" name="key" value={x.key} /><input type="hidden" name="add" value={x.key} />
          <p className="mb-1 text-xs text-slate-500">{t("Never-seen questions for these students come first.")}</p>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white ring-1 ring-slate-200">
            {bank.map((q) => (
              <li key={q.id} className="flex items-start gap-2 px-2 py-2">
                <label className="flex min-h-11 shrink-0 items-center px-1"><input type="checkbox" name="qid" value={q.id} className="h-5 w-5" aria-label={q.stem.slice(0, 60)} /></label>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="line-clamp-2 text-slate-900">{q.stem}</p>
                  <p className="mt-1 flex flex-wrap gap-1 text-xs text-slate-600"><span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${LEVEL_TONE[q.level]}`}>{t(LEVEL_NAME[q.level])}</span><span className="rounded-full bg-slate-100 px-2 py-0.5">{q.type}</span>{q.passageTitle && <span>· 📖 {q.passageTitle}</span>}</p>
                </div>
                <Link href={`/teacher/plans/${v.id}?add=${x.key}&open=${q.id}#question`} className={`${SMALL} bg-white text-brand-navy ring-1 ring-slate-200`}>{t("Open")}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end"><button className={`${SMALL} bg-brand-navy text-white hover:bg-brand-purple`}>{t("Add the ticked questions")}</button></div>
        </form>
      )}
    </div>
  );
}

/** Add a skill (bank search) or a Curriculum Map lesson. */
export function AddPanel({ t, v, q, results, lessons }: { t: TFn; v: PlanEditorView; q: string; results: { id: string; name: string; questions: number }[]; lessons: MapLesson[] }) {
  const inPlan = new Set(v.sections.map((x) => x.skillName));
  return (
    <div id="add-part">
    <Section title="Add to the plan" icon="➕" hint={t("A skill from the question bank, or a lesson of the Curriculum Map.")}>
      <form method="get" action={`/teacher/plans/${v.id}`} className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder={t("e.g. main idea, inference, commas")} className={`${BOX} min-w-0 flex-1`} aria-label={t("Find a skill")} />
        <input type="hidden" name="anchor" value="add-part" />
        <button className={BTN_SOFT}>{t("Find a skill")}</button>
      </form>
      {q && results.length === 0 && <EmptyState compact icon="🔎" title="Nothing matches your search" className="mt-2" />}
      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
          {results.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 font-medium">{k.name} <span className="text-sm font-normal text-slate-500">· {t("{n} question(s)", { n: k.questions })}</span></span>
              {inPlan.has(k.name) ? <span className="text-sm text-slate-500">{t("In the plan")}</span> : (
                <form action={addSectionAction} className="flex flex-wrap items-center gap-2 text-sm">
                  <Keep planId={v.id} anchor="add-part" /><input type="hidden" name="skillId" value={k.id} /><input type="hidden" name="q" value={q} />
                  <label className="flex items-center gap-1">{t("Questions")}<input type="number" name="count" min={1} max={50} defaultValue={10} className={`${BOX} w-20`} /></label>
                  <select name="level" defaultValue="" className={BOX} aria-label={t("Level")}><option value="">{t("Any level")}</option>{["BELOW", "ON", "ABOVE"].map((l) => <option key={l} value={l}>{t(LEVEL_NAME[l])}</option>)}</select>
                  <label className="flex min-h-11 items-center gap-1"><input type="checkbox" name="lesson" className="h-5 w-5" />{t("+ lesson")}</label>
                  <button className={`${SMALL} bg-brand-navy text-white hover:bg-brand-purple`}>{t("Add")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {lessons.length > 0 && (
        <form action={addSectionAction} className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
          <Keep planId={v.id} anchor="add-part" />
          <label className="flex min-w-0 flex-1 flex-col gap-1 font-semibold text-slate-700">{t("A lesson of the Curriculum Map")}
            <select name="placeCode" className={`${BOX} font-normal`} required defaultValue="">
              <option value="" disabled>{t("Choose a lesson")}</option>
              {[...new Set(lessons.map((l) => l.where))].map((w) => <optgroup key={w} label={w}>{lessons.filter((l) => l.where === w).map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</optgroup>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-semibold text-slate-700">{t("Questions")}<input type="number" name="count" min={1} max={50} defaultValue={10} className={`${BOX} w-20`} /></label>
          <button className={`${SMALL} min-h-11 bg-brand-navy text-white hover:bg-brand-purple`}>{t("Add the lesson")}</button>
        </form>
      )}
    </Section>
    </div>
  );
}

/** One question in full, with its passage (teacher view: the correct answer and the level are shown). */
export function QuestionPanel({ t, q, closeHref }: { t: TFn; q: FullQuestion; closeHref: string }) {
  return (
    <section id="question" aria-label={t("Question")} className="mb-5 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-brand-teal">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${LEVEL_TONE[q.level]}`}>{t(LEVEL_NAME[q.level])}</span><span>{q.type}</span><span>· {q.skillName}</span></p>
        <Link href={closeHref} className={SMALL_SOFT}>{t("Close")}</Link>
      </div>
      {q.passage && (
        <details open className="mt-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <summary className="min-h-11 cursor-pointer font-semibold text-brand-navy">📖 {q.passage.title || t("Passage")}</summary>
          <div className="max-h-[28rem] overflow-y-auto"><PassageText text={q.passage.text} paraClassName="mt-2 whitespace-pre-line leading-relaxed text-slate-800" headingClassName="mt-3 font-bold text-brand-navy" /></div>
        </details>
      )}
      <p className="mt-4 whitespace-pre-line text-lg text-slate-900">{q.stem}</p>
      {q.choices.length > 0 && (
        <ul className="mt-3 space-y-1">
          {q.choices.map((c) => <li key={c.label} className={`rounded-xl px-3 py-2 ring-1 ${c.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-200" : "bg-white ring-slate-200"}`}>{c.label}. {c.text}{c.correct && <span className="ms-2 text-xs">✓ {t("Correct answer")}</span>}</li>)}
        </ul>
      )}
      {!q.choices.length && q.answer && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-emerald-200">✓ {t("Correct answer")}: {q.answer}</p>}
      {q.hint && <p className="mt-3 text-sm text-slate-600">💡 {q.hint}</p>}
    </section>
  );
}

/**
 * The plan as the student's study-plan sheet (src/components/student/study-plan.tsx), built from the editor's parts the
 * way sending writes them (SkillPlanItem label "<program plan> · Grade <n> · <part>", read back as unit · set · part).
 */
export function studentSheetOf(v: PlanEditorView, mine: EditorSection[]): StudentPlanView {
  const unit = editorPlanLabel(v.program), set = `Grade ${v.grade}`;
  return {
    id: v.id, kind: planKindOf(v.program), target: DEFAULT_TARGET_CORRECT, title: v.title, className: v.className, grade: v.grade, note: v.note, createdAt: "",
    places: mine.map((x) => ({ itemId: x.key, code: x.placeCode ?? x.skillId, label: x.label ?? x.skillName, unit, set, status: "NOT_STARTED", progress: 0, href: null, locked: false, empty: false, skills: null, correct: 0 })),
  };
}

/** 3 · Preview: the plan exactly as one student will see it (the student's own study-plan sheet; no levels, no answers) + Download. */
export function PreviewStep({ t, v, as, lines }: { t: TFn; v: PlanEditorView; as: string | null; lines: Map<string, { stem: string; passageTitle: string | null }> }) {
  const withWork = v.classStudents.filter((st) => v.sections.some((x) => x.students.some((y) => y.id === st.id)));
  const me = withWork.find((st) => st.id === as) ?? withWork[0] ?? null;
  const mine = me ? v.sections.filter((x) => x.students.some((y) => y.id === me.id)) : [];
  return (
    <div className="space-y-4">
      <div data-print="hide">
        <Section title="3 · Preview as student" icon="👀" hint={t("This is what {name} will see. Nothing is sent until you press Send.", { name: me?.name ?? t("the student") })}>
          {!me ? <EmptyState compact icon="🔎" title="Nothing to send yet" text="Go back and add at least one skill." /> : withWork.length > 1 && (
            <nav aria-label={t("See as")} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700">{t("See as")}</span>
              {withWork.slice(0, 40).map((st) => <Link key={st.id} href={`/teacher/plans/${v.id}?step=preview&as=${st.id}`} aria-current={st.id === me.id ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${st.id === me.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}><bdi>{st.name}</bdi></Link>)}
            </nav>
          )}
        </Section>
      </div>
      {me && (<>
        <StudyPlan t={t} p={studentSheetOf(v, mine)} studentName={me.name} basePath={`/teacher/plans/${v.id}`} preview />
        {v.status !== "DRAFT" && <p className="print:hidden" data-print="hide"><Link prefetch={false} href={`/student/plans/${encodeURIComponent(v.id)}?preview=${encodeURIComponent(me.id)}`} className={BTN_SOFT}>👀 {t("Open {name}'s own page (with their progress)", { name: me.name })}</Link></p>}
        <div className="break-inside-avoid rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-7 print:p-0 print:shadow-none print:ring-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("The questions")}</p>
          <ol className="mt-2 space-y-3">
            {mine.map((x, i) => (
              <li key={x.key}>
                <p className="font-semibold text-brand-navy">{i + 1}. {hideLevels(x.label ?? x.skillName)}{x.lesson && <span className="ms-2 text-sm font-normal text-slate-600">{t("Lesson first")}</span>}</p>
                {x.auto ? <p className="text-sm text-slate-600">{t("Questions chosen for them as they go.")}</p> : (
                  <ol className="mt-1 list-decimal space-y-1 ps-6 text-sm text-slate-800">
                    {x.questionIds.map((id) => <li key={id}>{hideLevels(lines.get(id)?.stem ?? "")}{lines.get(id)?.passageTitle && <span className="text-slate-500"> · {lines.get(id)!.passageTitle}</span>}</li>)}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </div>
      </>)}
      <div className="flex flex-wrap justify-end gap-3 print:hidden">
        <Link href={`/teacher/plans/${v.id}?step=what`} className={BTN_SOFT}>{t("Back to the plan")}</Link>
        <Link href={`/teacher/plans/${v.id}?step=send`} className={`${BTN_MAIN} px-8`}>{t("Next: Send")}</Link>
      </div>
    </div>
  );
}

/** 4 · Send (a draft), or after sending: Pause / Resume, Withdraw, Duplicate. */
export function SendStep({ t, v, canSend, classes }: { t: TFn; v: PlanEditorView; canSend: boolean; classes: { id: string; name: string }[] }) {
  const questions = v.sections.reduce((n, x) => n + x.questions.length, 0);
  return (
    <div className="space-y-5">
      <Section title={v.status === "DRAFT" ? "4 · Send" : "After sending"} icon={v.status === "DRAFT" ? "📤" : "⚙️"}>
        <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <li className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><span className="block text-2xl font-bold text-brand-navy tabular-nums">{v.sections.length}</span>{t("Parts")}</li>
          <li className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><span className="block text-2xl font-bold text-brand-navy tabular-nums">{questions}</span>{t("Questions you picked")}</li>
          <li className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><span className="block text-2xl font-bold text-brand-navy tabular-nums">{v.planStudentIds.length}</span>{t("Students")}</li>
          <li className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><span className="block text-2xl font-bold text-brand-navy">{v.dueAt ?? "—"}</span>{t("Due date")}</li>
        </ul>
        {v.status === "DRAFT" && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <Link href={`/teacher/plans/${v.id}?step=preview`} className={BTN_SOFT}>{t("Preview as student")}</Link>
            <form action={deleteDraftAction}><Keep planId={v.id} step="send" /><button className={`${BTN} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`}>{t("Delete draft")}</button></form>
            {canSend && v.sections.length > 0 && <form action={sendPlanAction}><Keep planId={v.id} step="what" /><button className={`${BTN_MAIN} px-8 text-lg`}>{t("Send")}</button></form>}
          </div>
        )}
        {(v.status === "SENT" || v.status === "PAUSED") && canSend && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <form action={pausePlanAction} className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <Keep planId={v.id} step="send" /><input type="hidden" name="pause" value={v.status === "SENT" ? "1" : "0"} />
              <p className="text-sm text-amber-900">{v.status === "SENT" ? t("Pause hides the plan from the students for now. Nothing is lost.") : t("Resume shows the plan to the students again.")}</p>
              <button className={`${BTN_SOFT} mt-2`}>{v.status === "SENT" ? t("Pause") : t("Resume")}</button>
            </form>
            <form action={withdrawPlanAction} className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
              <Keep planId={v.id} step="send" />
              <p className="text-sm text-red-900">{t("Withdraw takes the work away from the students. Answers already given are kept in their records.")}</p>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="confirm" className="h-5 w-5" />{t("Yes, withdraw this plan")}</label>
              <button className={`${BTN} mt-1 bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-100`}>{t("Withdraw")}</button>
            </form>
          </div>
        )}
      </Section>
      {canSend && (
        <Section title="Duplicate" icon="⧉" hint={t("A copy is made as a draft, with the same parts and questions. Nothing is sent.")}>
          <form action={duplicatePlanAction} className="flex flex-wrap items-end gap-3">
            <Keep planId={v.id} step="send" />
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("For the class")}
              <select name="classId" defaultValue={v.classId} className={BOX}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <details className="min-w-0 flex-1">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold text-brand-navy">{t("Other students of this class (optional)")}</summary>
              <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{v.classStudents.map((st) => <label key={st.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="sid" value={st.id} className="h-5 w-5" /><bdi>{st.name}</bdi></label>)}</div>
            </details>
            <button className={BTN_SOFT}>{t("Duplicate")}</button>
          </form>
        </Section>
      )}
    </div>
  );
}
