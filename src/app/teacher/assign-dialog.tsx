"use client";
import { useActionState, useRef, useState } from "react";
import { assignSkillAction } from "./actions";

/**
 * ⭐ Assign: opens a small dialog. Nothing is assigned until the teacher presses “Assign” in it.
 * Target: entire class, selected students, or one student; optional start date, due date, note.
 */
export function AssignDialog({ classId, className, skill, students, track = "CURRICULUM" }: { classId: string; className: string; skill: { id: string; name: string; standards: string[] }; students: { id: string; name: string }[]; track?: "CURRICULUM" | "MAP" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"class" | "students" | "one">("class");
  const [state, action, pending] = useActionState(assignSkillAction, {});
  const field = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="rounded-lg px-2.5 py-1 text-sm font-semibold text-brand-navy ring-1 ring-amber-300 hover:bg-amber-50" aria-label={`Assign ${skill.name}`}>
        <span aria-hidden="true">⭐</span> Assign
      </button>
      <dialog ref={ref} className="w-full max-w-lg rounded-2xl p-0 backdrop:bg-slate-900/40" aria-labelledby={`assign-${skill.id}`}>
        <form action={action} className="space-y-4 p-6">
          <input type="hidden" name="track" value={track} /><input type="hidden" name="classId" value={classId} /><input type="hidden" name="skillId" value={skill.id} /><input type="hidden" name="mode" value={mode} />
          <div>
            <h2 id={`assign-${skill.id}`} className="text-lg font-bold text-brand-navy">Assign “{skill.name}”</h2>
            <p className="text-sm text-slate-600">{skill.standards.join(", ") || "No standard"} · {className}</p>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">Assign to</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {([["class", "Entire class"], ["students", "Selected students"], ["one", "One student"]] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5"><input type="radio" name="_mode" checked={mode === v} onChange={() => setMode(v)} />{l}</label>
              ))}
            </div>
          </fieldset>
          {mode !== "class" && (
            <div className="max-h-48 overflow-y-auto rounded-lg p-2 ring-1 ring-slate-200">
              {students.length === 0 && <p className="text-sm text-slate-600">No students in this class.</p>}
              {students.map((st) => (
                <label key={st.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type={mode === "one" ? "radio" : "checkbox"} name="studentIds" value={st.id} />{st.name}
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex flex-col">Start date (optional)<input type="date" name="startAt" className={field} /></label>
            <label className="flex flex-col">Due date (optional)<input type="date" name="dueAt" className={field} /></label>
          </div>
          <label className="flex flex-col text-sm">Note to students (optional)<textarea name="note" rows={2} maxLength={1000} className={field} /></label>
          {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
          {state.message && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{state.message}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{state.message ? "Close" : "Cancel"}</button>
            {!state.message && <button disabled={pending} className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{pending ? "Assigning…" : "Assign"}</button>}
          </div>
        </form>
      </dialog>
    </>
  );
}
