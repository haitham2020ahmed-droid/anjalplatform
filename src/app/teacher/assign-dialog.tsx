"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { assignSkillAction } from "./actions";

type Track = "CURRICULUM" | "MAP" | "NAFS";
type Skill = { id: string; name: string; standards: string[] };
const OPEN = "skill-assign:open", DONE = "skill-assign:done";

/**
 * ⭐ Assign — fast: one small button per skill; ONE dialog per page (the class list is sent once).
 * Nothing is assigned until the teacher presses “Assign”; the page is not reloaded afterwards.
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
export function AssignSkillHost({ classId, className, students, track = "CURRICULUM" }: { classId: string; className: string; students: { id: string; name: string }[]; track?: Track }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const on = (e: Event) => { setSkill((e as CustomEvent<Skill>).detail); setRound((r) => r + 1); ref.current?.showModal(); };
    window.addEventListener(OPEN, on);
    return () => window.removeEventListener(OPEN, on);
  }, []);
  return (
    <dialog ref={ref} className="w-full max-w-lg rounded-2xl p-0 backdrop:bg-slate-900/40" aria-label="Assign a skill">
      {skill && <div key={round}><AssignForm skill={skill} classId={classId} className={className} students={students} track={track} close={() => ref.current?.close()} /></div>}
    </dialog>
  );
}

function AssignForm({ skill, classId, className, students, track, close }: { skill: Skill; classId: string; className: string; students: { id: string; name: string }[]; track: Track; close: () => void }) {
  const [mode, setMode] = useState<"class" | "students" | "one">("class");
  const [state, action, pending] = useActionState(assignSkillAction, {});
  useEffect(() => {
    if (!state.message) return;
    window.dispatchEvent(new CustomEvent(DONE, { detail: skill.id }));
    const t = setTimeout(close, 1200);   // done: close by itself
    return () => clearTimeout(t);
  }, [state.message, skill.id, close]);
  const field = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <form action={action} className="space-y-4 p-6">
      <input type="hidden" name="track" value={track} /><input type="hidden" name="classId" value={classId} /><input type="hidden" name="skillId" value={skill.id} /><input type="hidden" name="mode" value={mode} />
      <div>
        <h2 className="text-lg font-bold text-brand-navy">Assign “{skill.name}”</h2>
        <p className="text-sm text-slate-600">{skill.standards.join(", ") || "No standard"} · {className}</p>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-slate-700">Assign to</legend>
        <div className="mt-1 flex flex-wrap gap-2 text-sm">
          {([["class", `Entire class (${students.length})`], ["students", "Selected students"], ["one", "One student"]] as const).map(([v, l]) => (
            <button type="button" key={v} onClick={() => setMode(v)} aria-pressed={mode === v} className={`rounded-full px-3 py-1.5 font-semibold ${mode === v ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`}>{l}</button>
          ))}
        </div>
      </fieldset>
      {mode !== "class" && (
        <div className="max-h-48 overflow-y-auto rounded-lg p-2 ring-1 ring-slate-200">
          {students.length === 0 && <p className="text-sm text-slate-600">No students in this class.</p>}
          {students.map((st) => <label key={st.id} className="flex items-center gap-2 py-0.5 text-sm"><input type={mode === "one" ? "radio" : "checkbox"} name="studentIds" value={st.id} />{st.name}</label>)}
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-slate-600">Dates and note (optional)</summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-3"><label className="flex flex-col">Start date<input type="date" name="startAt" className={field} /></label><label className="flex flex-col">Due date<input type="date" name="dueAt" className={field} /></label></div>
          <label className="flex flex-col">Note to students<textarea name="note" rows={2} maxLength={1000} className={field} /></label>
        </div>
      </details>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state.message && <p role="status" className="animate-pop rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">✓ {state.message}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={close} className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{state.message ? "Close" : "Cancel"}</button>
        {!state.message && <button disabled={pending} className="rounded-xl bg-brand-navy px-6 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{pending ? "Assigning…" : "Assign"}</button>}
      </div>
    </form>
  );
}
