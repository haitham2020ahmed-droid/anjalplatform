"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { assignSkillAction, masteredCountAction, withdrawAssignmentsAction } from "./actions";
import { ExcludeMasteredPrompt } from "@/components/assign/exclude-mastered";
import { useT } from "@/i18n/client";
import { BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { SkillAssignSteps } from "@/components/skill-picker";

type Track = "CURRICULUM" | "MAP" | "NAFS";
/** `track` (optional) overrides the page's source tag for this one skill, e.g. GRAMMAR for a grammar skill.
 * `grade` is accepted from older callers but never shown: skill names only. */
type Skill = { id: string; name: string; standards: string[]; grade?: number; track?: string };
const OPEN = "skill-assign:open", DONE = "skill-assign:done";

/**
 * ⭐ Assign — fast: one small button per skill; ONE dialog per page (the class list is sent once).
 * Program (Curriculum by default) → the platform chooses or the teacher picks the questions → Preview as student →
 * Assign. Nothing is assigned until the teacher presses “Assign”; the page is not reloaded afterwards.
 */
export function AssignDialog({ skill }: { classId?: string; className?: string; skill: Skill; students?: unknown; track?: Track }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === skill.id) setDone(true); };
    window.addEventListener(DONE, on);
    return () => window.removeEventListener(DONE, on);
  }, [skill.id]);
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN, { detail: skill }))}
      className={`rounded-lg px-2.5 py-1 text-sm font-semibold ring-1 transition active:scale-95 ${done ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "text-brand-navy ring-amber-300 hover:bg-amber-50"}`} aria-label={`Assign ${skill.name}`}>
      <span aria-hidden="true">{done ? "✓" : "⭐"}</span> {done ? "Assigned" : "Assign"}
    </button>
  );
}

/** The page's single assign dialog. */
type Klass = { id: string; name: string; students: { id: string; name: string }[] };
/**
 * The page's single assign dialog. `classes` (optional): EVERY class the teacher teaches, so a skill can go to
 * several classes at once (the page's own class is ticked first). Without it, only the page's class is offered.
 */
export function AssignSkillHost({ classId, className, students, track = "CURRICULUM", classes }: { classId: string; className: string; students: { id: string; name: string }[]; track?: Track; classes?: Klass[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const on = (e: Event) => { setSkill((e as CustomEvent<Skill>).detail); setRound((r) => r + 1); ref.current?.showModal(); };
    window.addEventListener(OPEN, on);
    return () => window.removeEventListener(OPEN, on);
  }, []);
  return (
    <dialog ref={ref} className="w-[min(96vw,44rem)] max-w-none rounded-2xl p-0 backdrop:bg-slate-900/40" aria-label="Assign a skill">
      {skill && <div key={round}><AssignForm skill={skill} classId={classId} classes={classes?.length ? classes : [{ id: classId, name: className, students }]} track={track} close={() => ref.current?.close()} /></div>}
    </dialog>
  );
}

function AssignForm({ skill, classId, classes, track, close }: { skill: Skill; classId: string; classes: Klass[]; track: Track; close: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<"class" | "students" | "one">("class");
  // the page's class is ticked first; the teacher may add (or swap to) any other class of theirs
  const [chosen, setChosen] = useState<string[]>(() => [classes.some((c) => c.id === classId) ? classId : classes[0]?.id].filter(Boolean) as string[]);
  const picked = classes.filter((c) => chosen.includes(c.id));
  const students = picked.flatMap((c) => c.students);
  const className = picked.map((c) => c.name).join(", ");
  const [state, action, pending] = useActionState(assignSkillAction, {});
  const [withdrawn, setWithdrawn] = useState<string | null>(null);
  // ⭐ "N students already mastered this skill — exclude them?" (asked for the chosen classes; Yes / No)
  const [mastered, setMastered] = useState(0);
  const [exclude, setExclude] = useState<boolean | null>(null);
  const chosenKey = chosen.join(",");
  useEffect(() => {
    let live = true;
    setExclude(null);
    masteredCountAction({ classIds: chosenKey.split(",").filter(Boolean), skillId: skill.id }).then((r) => { if (live) setMastered(r.count); }).catch(() => undefined);
    return () => { live = false; };
  }, [chosenKey, skill.id]);
  useEffect(() => {
    if (!state.message) return;
    if (!state.draft) window.dispatchEvent(new CustomEvent(DONE, { detail: skill.id }));
    // done: close by itself (a few seconds, so ↩ Withdraw can still be pressed)
    const t = setTimeout(close, state.assignmentIds?.length ? 6000 : 1500);
    return () => clearTimeout(t);
  }, [state.message, state.draft, state.assignmentIds, skill.id, close]);
  async function withdraw() {
    const r = await withdrawAssignmentsAction(state.assignmentIds ?? []);
    setWithdrawn(r.message);
  }
  const field = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <form action={action} className="space-y-4 p-6">
      {chosen.map((id) => <input key={id} type="hidden" name="classIds" value={id} />)}<input type="hidden" name="skillId" value={skill.id} /><input type="hidden" name="skillName" value={skill.name} /><input type="hidden" name="mode" value={mode} />
      <div>
        <h2 className="text-lg font-bold text-brand-navy">Assign “{skill.name}”</h2>
        <p className="text-sm text-slate-600">{skill.standards.length ? `${skill.standards.join(", ")} · ` : ""}{className}</p>
      </div>
      {classes.length > 1 && (
        <fieldset data-testid="assign-classes">
          <legend className="text-sm font-semibold text-slate-700">Classes <span className="font-normal text-slate-500">(choose one or more)</span></legend>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            {classes.map((c) => {
              const on = chosen.includes(c.id);
              return (
                <button type="button" key={c.id} aria-pressed={on} onClick={() => setChosen((x) => on ? (x.length > 1 ? x.filter((y) => y !== c.id) : x) : [...x, c.id])}
                  className={`rounded-full px-3 py-1.5 font-semibold ${on ? "bg-brand-teal text-white" : "ring-1 ring-slate-300"}`}>
                  {on ? "✓ " : ""}{c.name} <span className="font-normal opacity-80">({c.students.length})</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="text-sm font-semibold text-slate-700">Assign to</legend>
        <div className="mt-1 flex flex-wrap gap-2 text-sm">
          {([["class", picked.length > 1 ? `Entire classes (${students.length})` : `Entire class (${students.length})`], ["students", "Selected students"], ["one", "One student"]] as const).map(([v, l]) => (
            <button type="button" key={v} onClick={() => setMode(v)} aria-pressed={mode === v} className={`rounded-full px-3 py-1.5 font-semibold ${mode === v ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`}>{l}</button>
          ))}
        </div>
      </fieldset>
      {mode !== "class" && (
        <div className="max-h-48 overflow-y-auto rounded-lg p-2 ring-1 ring-slate-200">
          {students.length === 0 && <p className="text-sm text-slate-600">No students in this class.</p>}
          {picked.map((c) => (
            <div key={c.id}>
              {picked.length > 1 && <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{c.name}</p>}
              {c.students.map((st) => <label key={st.id} className="flex items-center gap-2 py-0.5 text-sm"><input type={mode === "one" ? "radio" : "checkbox"} name="studentIds" value={st.id} />{st.name}</label>)}
            </div>
          ))}
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-slate-600">Dates and note (optional)</summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-3"><label className="flex flex-col">Start date<input type="date" name="startAt" className={field} /></label><label className="flex flex-col">Due date<input type="date" name="dueAt" className={field} /></label></div>
          <label className="flex flex-col">Note to students<textarea name="note" rows={2} maxLength={1000} className={field} /></label>
        </div>
      </details>
      {exclude && <input type="hidden" name="excludeMastered" value="1" />}
      {mastered > 0 && !state.message && (exclude === null
        ? <ExcludeMasteredPrompt count={mastered} t={t} onYes={() => setExclude(true)} onNo={() => setExclude(false)} />
        : <p className="text-xs text-slate-600">⭐ {exclude ? t("Students who mastered this skill are left out.") : t("Students who mastered this skill get it too.")} <button type="button" onClick={() => setExclude(null)} className="font-semibold text-brand-teal underline">{t("Change")}</button></p>)}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state.message && <p role="status" className="animate-pop rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">✓ {withdrawn ?? state.message}</p>}
      {state.message
        ? <div className="flex justify-end gap-2">
            {state.assignmentIds?.length && !withdrawn ? <button type="button" data-testid="assign-withdraw" onClick={() => void withdraw()} className={`${BTN_SECONDARY} text-rose-700`}>↩ {t("Withdraw")}</button> : null}
            <button type="button" onClick={close} className={BTN_SECONDARY}>{t("Close")}</button>
          </div>
        : <SkillAssignSteps skillId={skill.id} track={skill.track ?? track} grammar={skill.track === "GRAMMAR"} trackField pending={pending}
            cancel={<span className="flex gap-2"><button type="button" onClick={close} className={BTN_SECONDARY}>{t("Cancel")}</button><button type="submit" name="intent" value="draft" disabled={pending} data-testid="assign-draft" className={BTN_SECONDARY}>📝 {t("Save as draft")}</button></span>} />}
    </form>
  );
}
