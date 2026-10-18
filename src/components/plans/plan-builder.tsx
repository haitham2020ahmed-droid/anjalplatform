import { StarAssign } from "@/components/assign/star-assign";
import { SourceSelect } from "@/components/assign/source-select";
import { ASSIGN_SOURCE_LABEL } from "@/lib/assign-source";
import { PendingButton } from "@/components/pending-button";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TFn } from "@/i18n";
import { Section } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import type { Program } from "@/server/plans/program";
import type { PlanForm } from "@/server/plans/plan-form";
import type { PlanSkill } from "@/server/plans/send";
import { pickField } from "@/server/plans/plan-form";
import { AUTO, SkillQuestionPicker, dedupeSkillsByName, questionIdsField } from "@/components/skill-picker";
import { StudentPlanPreview } from "./student-preview";
import { builderDraftAction } from "@/app/teacher/plans/editor-actions";
import { PlanMasteredPrompt } from "./mastered-prompt";
import { AssignDates } from "@/components/assign/assign-dates";

/**
 * The program pages' plan builder (server-rendered, one GET form): 1 Who → 2 the suggested skills (untick to
 * remove, search to add; each skill opens to its questions: the platform chooses at each student's level, or the
 * teacher picks them) → 3 Preview exactly as the student sees it → Send. One primary button per step.
 * Skills show their name only (no grade tags).
 * The Send button posts the same form to the page's server action, which builds the plan again on the server.
 */
export const BTN = "inline-flex min-h-11 items-center justify-center rounded-xl px-5 font-semibold";
export const BTN_MAIN = `${BTN} bg-brand-navy text-white hover:bg-brand-purple`;
export const BTN_SOFT = `${BTN} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`;
const BOX = "min-h-11 rounded-xl border border-slate-300 bg-white px-3";
const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;

/**
 * r82 (owner, r74 rule): a program plan's Source is its program — RTI plan → RTI, NAFS → NAFS, MAP → MAP, Curriculum →
 * Curriculum — shown, not asked (the server sets it too); only a custom plan has the Source select.
 */
export function PlanSourceFixed({ t, program }: { t: TFn; program: Program }) {
  return (
    <span className="flex flex-col text-sm font-semibold text-slate-700" data-testid="plan-source">
      <span>{t("Source")}</span>
      <input type="hidden" name="source" value={program} />
      <span className="inline-flex min-h-11 items-center rounded-xl bg-slate-50 px-3 font-normal ring-1 ring-slate-200">{t(ASSIGN_SOURCE_LABEL[program])}</span>
    </span>
  );
}

/** Step 1: the class (links), then whole class / one student / a group, and page options (children). */
export function WhoPicker({ t, classes, classId, classHref, students, form, children, suggested }: {
  t: TFn; classes: { id: string; name: string }[]; classId: string; classHref: (id: string) => string;
  students: { id: string; name: string }[]; form: PlanForm; children?: ReactNode; suggested: boolean;
}) {
  return (
    <Section title="1 · Who is it for?" icon="👥">
      {classes.length > 1 && (
        <nav aria-label={t("Classes")} className="mb-4 flex flex-wrap gap-2">
          {classes.map((c) => <Link key={c.id} href={classHref(c.id)} aria-current={c.id === classId ? "page" : undefined} className={chip(c.id === classId)}>{c.name}</Link>)}
        </nav>
      )}
      <div className="flex flex-wrap gap-2">
        {([["class", t("Whole class ({n})", { n: students.length })], ["student", t("One student")], ["group", t("A group")]] as const).map(([v, label]) => (
          <label key={v} className={`${BTN} cursor-pointer gap-2 ring-1 ring-slate-300 has-[:checked]:bg-brand-navy has-[:checked]:text-white`}><input type="radio" name="who" value={v} defaultChecked={form.who === v} className="sr-only" />{label}</label>
        ))}
      </div>
      {students.length === 0 ? <EmptyState compact icon="👥" title="No students in this class yet" className="mt-3" /> : (
        <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="font-semibold text-brand-navy">{t("Choose students (for One student or A group)")}</p>
          <p className="text-sm text-slate-600">{t("Tick the students, then press Suggest skills. With Whole class, the ticks are not needed.")}</p>
          <div className="mt-2 grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
            {students.map((st) => <label key={st.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-white px-2 ring-1 ring-slate-100 hover:ring-brand-teal"><input type="checkbox" name="sid" value={st.id} defaultChecked={form.studentIds.includes(st.id)} className="h-5 w-5 accent-brand-teal" /><bdi>{st.name}</bdi></label>)}
          </div>
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-4 flex justify-end"><button name="step" value="edit" className={suggested ? BTN_SOFT : BTN_MAIN}>{t("Suggest skills")}</button></div>
    </Section>
  );
}

export interface BuilderProps {
  t: TFn;
  /** the page path the GET form goes to (e.g. /teacher/map-center) */
  path: string;
  /** fields the page keeps on every request (tab, classId, who, sid, subject…) for the "see as" links */
  carry: [string, string][];
  form: PlanForm;
  program: Program | null;
  className: string;
  students: { id: string; name: string }[];
  /** the suggestion before the teacher's edits */
  suggested: PlanSkill[];
  /** the plan after the edits (applyEdits) */
  plan: PlanSkill[];
  /** search results for "Add a skill" */
  results: { id: string; name: string; grade?: number | null; grammar?: boolean; questions?: number | null }[];
  /** the questions the teacher picked, by skill id (readQuestionPicks); a skill not here = the platform chooses */
  picks?: Record<string, string[]>;
  notes?: string[];
  defaultTitle: string;
  send: (f: FormData) => Promise<void>;
  canSend: boolean;
  /** shown when nothing is suggested */
  empty: { title: string; text: string };
  /** ☆ quick assign beside each suggested skill (owner r67): the class, the skills already assigned, the default due date */
  star?: { classId: string; assigned: Record<string, string>; defaultDue: string; track: string } | null;
}

/** A skill of the plan opens to its questions: "the platform chooses" (default) or the teacher's own picks. */
function QuestionsOf({ t, id, picked }: { t: TFn; id: string; picked?: string[] }) {
  return (
    <details className="group px-4 pb-3 ps-12" open={Boolean(picked?.length)}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-brand-navy">
        <span aria-hidden="true" className="text-slate-500 group-open:rotate-90">▶</span>
        {t("See questions")}
        <span className="font-normal text-slate-600">· {picked?.length ? t("{n} questions picked", { n: picked.length }) : t("The platform chooses at each student's level")}</span>
      </summary>
      <div className="mt-2"><SkillQuestionPicker skillId={id} name={pickField(id)} defaultValue={picked?.length ? { auto: false, questionIds: picked } : AUTO} /></div>
    </details>
  );
}

/** Steps 2 (choose the skills) and 3 (preview, then Send). Render inside the page's GET form. */
export function PlanBuilder(p: BuilderProps) {
  const { t, form } = p;
  const inPlan = new Set(p.plan.map((k) => k.id));
  const suggestedIds = new Set(p.suggested.map((k) => k.id));
  const added = p.plan.filter((k) => !suggestedIds.has(k.id));
  const kept = p.plan.filter((k) => suggestedIds.has(k.id));
  const nameOf = new Map(p.students.map((s) => [s.id, s.name]));
  const picks = p.picks ?? {};
  // one row per skill name (the same skill of several grades shares one question bank)
  const results = dedupeSkillsByName(p.results, (r) => (r.grammar ? "GRAMMAR" : ""), (a, b) => (a.questions ?? 0) > (b.questions ?? 0));
  const pickedPairs = p.plan.filter((k) => picks[k.id]?.length).map((k) => [pickField(k.id), questionIdsField({ auto: false, questionIds: picks[k.id] })] as [string, string]);
  const hiddenEdits = <>
    <input type="hidden" name="edited" value="1" />
    <input type="hidden" name="pkey" value={form.key} />
  </>;

  if (form.step === "preview") {
    const withWork = p.students.filter((s) => p.plan.some((k) => k.studentIds.includes(s.id)));
    const as = withWork.find((s) => s.id === form.previewAs) ?? withWork[0] ?? null;
    const mine = as ? p.plan.filter((k) => k.studentIds.includes(as.id)) : [];
    const title = form.title || p.defaultTitle;
    const link = (id: string) => `${p.path}?${new URLSearchParams([...p.carry, ["edited", "1"], ["pkey", form.key], ...kept.map((k) => ["keep", k.id] as [string, string]), ...added.map((k) => ["add", k.id] as [string, string]), ...pickedPairs, ["step", "preview"], ["as", id], ["title", form.title], ["dueAt", form.dueText], ["startAt", form.startText], ["note", form.note]])}`;
    return (
      <Section title="3 · Preview" icon="👀" hint={t("This is what {name} will see. Nothing is sent until you press Send.", { name: as?.name ?? t("the student") })}>
        {hiddenEdits}
        {kept.map((k) => <input key={k.id} type="hidden" name="keep" value={k.id} />)}
        {added.map((k) => <input key={k.id} type="hidden" name="add" value={k.id} />)}
        {pickedPairs.map(([n, v]) => <input key={n} type="hidden" name={n} value={v} />)}
        {!as ? <EmptyState compact icon="🔎" title="Nothing to send yet" text="Go back and tick at least one skill." /> : (
          <>
            {withWork.length > 1 && (
              <nav aria-label={t("See as")} className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-700">{t("See as")}</span>
                {withWork.slice(0, 40).map((s) => <Link key={s.id} href={link(s.id)} aria-current={s.id === as.id ? "true" : undefined} className={chip(s.id === as.id)}><bdi>{s.name}</bdi></Link>)}
              </nav>
            )}
            <StudentPlanPreview title={title} studentName={as.name} className={p.className} program={p.program} skills={mine.map((k) => k.name)} note={form.note || null} dueAt={form.dueText || null} />
          </>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Plan name")}<input name="title" defaultValue={title} maxLength={191} className={BOX} /></label>
          <AssignDates t={t} start={form.startText} due={form.dueText} field={BOX} />
          {p.program ? <PlanSourceFixed t={t} program={p.program} /> : <SourceSelect t={t} field={BOX} />}
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Note to students (optional)")}<input name="note" defaultValue={form.note} maxLength={1000} className={BOX} /></label>
        </div>
        <PlanMasteredPrompt t={t} classId={p.carry.find(([k]) => k === "classId")?.[1] ?? ""} plan={p.plan} excluded={form.excludeMastered} />
        <p className="mt-3 text-sm text-slate-600">{t("{skills} skill(s) for {students} student(s).", { skills: p.plan.length, students: withWork.length })}{pickedPairs.length > 0 && <> {t("Your own questions: {n} skill(s). The others: the platform chooses at each student's level.", { n: pickedPairs.length })}</>}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button name="step" value="edit" formNoValidate className={BTN_SOFT}>{t("Change the skills")}</button>
          {/* ✏️ the full editor: every question visible and editable, saved as a draft (nothing is sent) */}
          {p.canSend && as && <>
            <input type="hidden" name="draftSpec" value={JSON.stringify({ classId: p.carry.find(([k]) => k === "classId")?.[1] ?? "", program: p.program, skills: p.plan.map((k) => ({ id: k.id, studentIds: k.studentIds, reason: k.reason, picks: picks[k.id] ?? [] })) })} />
            <button formAction={builderDraftAction} formMethod="post" formNoValidate className={BTN_SOFT}>{t("Save as draft and edit every question")}</button>
          </>}
          {p.canSend && as && <PendingButton formAction={p.send} className={`${BTN_MAIN} px-8 text-lg`} label="Send" pendingLabel="Sending…" />}
        </div>
      </Section>
    );
  }

  return (
    <Section title="2 · Choose the skills" icon="✅" hint={t("Untick a skill to remove it. Add more skills below. Open a skill to see its questions.")}>
      {hiddenEdits}
      {p.notes && p.notes.length > 0 && <ul className="mb-4 space-y-1 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{p.notes.map((n) => <li key={n}>{t(n)}</li>)}</ul>}
      {p.suggested.length === 0 && added.length === 0 ? <EmptyState compact icon="🔎" title={p.empty.title} text={p.empty.text} /> : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
          {p.suggested.map((k) => (
            <li key={k.id}>
              <label className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-2">
                <input type="checkbox" name="keep" value={k.id} defaultChecked={inPlan.has(k.id)} className="h-5 w-5" />
                <span className="font-medium text-slate-900">{k.name}</span>
                <span className="text-sm text-slate-500">{t(k.reason)}{k.studentIds.length < p.students.length ? ` · ${k.studentIds.slice(0, 4).map((id) => nameOf.get(id) ?? "").join(", ")}${k.studentIds.length > 4 ? ` +${k.studentIds.length - 4}` : ""}` : ` · ${t("everyone")}`}</span>
              </label>
              {p.star && <div className="-mt-1 px-4 ps-12"><StarAssign kind="SKILL" refId={k.id} classId={p.star.classId} assignedId={p.star.assigned[k.id] ?? null} defaultDue={p.star.defaultDue} track={p.star.track} label={k.name} /></div>}
              <QuestionsOf t={t} id={k.id} picked={picks[k.id]} />
            </li>
          ))}
          {added.map((k) => (
            <li key={k.id}>
              <label className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-2">
                <input type="checkbox" name="add" value={k.id} defaultChecked className="h-5 w-5" />
                <span className="font-medium text-slate-900">{k.name}</span><span className="text-sm text-slate-500">{t("Added by you")}</span>
              </label>
              <QuestionsOf t={t} id={k.id} picked={picks[k.id]} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <label className="flex flex-wrap items-center gap-2 font-semibold text-slate-700">{t("Add a skill")}
          <input name="q" defaultValue={form.q} placeholder={t("e.g. main idea, inference, commas")} className={`${BOX} min-w-0 flex-1 font-normal`} />
          <button name="step" value="edit" className={BTN_SOFT}>{t("Search")}</button>
        </label>
        {form.q && results.length === 0 && <EmptyState compact icon="🔎" title="Nothing matches your search" className="mt-2" />}
        {results.length > 0 && (<>
          <ul className="mt-2 grid gap-2">
            {results.filter((k) => !inPlan.has(k.id)).map((k) => (
              <li key={k.id} className="flex items-start gap-2 rounded-xl bg-white px-2 ring-1 ring-slate-200">
                <label className="flex min-h-11 shrink-0 items-center px-1"><input type="checkbox" name="add" value={k.id} aria-label={k.name} className="h-5 w-5" /></label>
                <div className="min-w-0 flex-1 py-0.5"><SkillQuestionPicker skillId={k.id} skillName={k.name} mode="view" name={null} /></div>
              </li>
            ))}
          </ul>
          {results.some((k) => !inPlan.has(k.id)) && <p className="mt-2 text-sm text-slate-600">{t("Tick a skill and press Search to add it to the plan; then you can pick its questions.")}</p>}
        </>)}
      </div>
      <div className="mt-5 flex justify-end"><button name="step" value="preview" className={`${BTN_MAIN} px-8 text-lg`}>{t("Preview")}</button></div>
    </Section>
  );
}
