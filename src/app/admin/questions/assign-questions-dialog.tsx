"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { assignQuestionsAction } from "@/app/teacher/actions";

export interface RosterClass { id: string; name: string; grade: number; students: { id: string; name: string }[] }

/** ⭐ Assign selected questions: class, selected students or one student; optional title, dates and note. */
export function AssignQuestionsDialog({ roster, questionIds, onDone, onClose, defaultTrack = "CURRICULUM" }: { roster: RosterClass[]; questionIds: string[]; onDone: () => void; onClose: () => void; defaultTrack?: "CURRICULUM" | "MAP" | "NAFS" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [classId, setClassId] = useState(roster[0]?.id ?? "");
  const [mode, setMode] = useState<"class" | "students" | "one">("class");
  const [state, action, pending] = useActionState(assignQuestionsAction, {});
  useEffect(() => { ref.current?.showModal(); }, []);
  // clear the selection once per successful assignment (onDone is a new function on every render)
  const doneFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.message && doneFor.current !== state.message) { doneFor.current = state.message; onDone(); }
  }, [state.message, onDone]);
  const klass = roster.find((c) => c.id === classId);
  const field = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-lg rounded-2xl p-0 backdrop:bg-slate-900/40" aria-labelledby="assign-q-title">
      <form action={action} className="space-y-4 p-6">
        {questionIds.map((id) => <input key={id} type="hidden" name="questionIds" value={id} />)}
        <input type="hidden" name="mode" value={mode} />
        <h2 id="assign-q-title" className="text-lg font-bold text-brand-navy">Assign {questionIds.length} question{questionIds.length === 1 ? "" : "s"}</h2>
        {roster.length === 0 ? <p className="text-sm text-slate-600">You do not teach any class yet. Ask an admin to add you to a class.</p> : (
          <>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700">Area</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200 has-[:checked]:bg-sky-50 has-[:checked]:ring-sky-400"><input type="radio" name="track" value="CURRICULUM" defaultChecked={defaultTrack === "CURRICULUM"} /><span aria-hidden="true">📘</span> Curriculum</label>
                <label className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200 has-[:checked]:bg-green-50 has-[:checked]:ring-green-500"><input type="radio" name="track" value="NAFS" defaultChecked={defaultTrack === "NAFS"} /> 🇸🇦 Nafs (Grade 6)</label>
                <label className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200 has-[:checked]:bg-emerald-50 has-[:checked]:ring-emerald-400"><input type="radio" name="track" value="MAP" defaultChecked={defaultTrack === "MAP"} /><span aria-hidden="true">🗺️</span> MAP</label>
              </div>
            </fieldset>
            <label className="flex flex-col text-sm">Class
              <select name="classId" value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
                {roster.map((c) => <option key={c.id} value={c.id}>{c.name} · Grade {c.grade} ({c.students.length} students)</option>)}
              </select>
            </label>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700">Assign to</legend>
              <div className="mt-1 flex flex-wrap gap-3 text-sm">
                {([["class", "Entire class"], ["students", "Selected students"], ["one", "One student"]] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5"><input type="radio" name="_mode" checked={mode === v} onChange={() => setMode(v)} />{l}</label>
                ))}
              </div>
            </fieldset>
            {mode !== "class" && (
              <div className="max-h-44 overflow-y-auto rounded-lg p-2 ring-1 ring-slate-200">
                {(klass?.students ?? []).map((st) => (
                  <label key={st.id} className="flex items-center gap-2 py-0.5 text-sm"><input type={mode === "one" ? "radio" : "checkbox"} name="studentIds" value={st.id} />{st.name}</label>
                ))}
                {klass && klass.students.length === 0 && <p className="text-sm text-slate-600">No students in this class.</p>}
              </div>
            )}
            <label className="flex flex-col text-sm">Title (optional)<input name="title" maxLength={150} placeholder="e.g. Main idea practice" className={field} /></label>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex flex-col">Start date (optional)<input type="date" name="startAt" className={field} /></label>
              <label className="flex flex-col">Due date (optional)<input type="date" name="dueAt" className={field} /></label>
            </div>
            <label className="flex flex-col text-sm">Note to students (optional)<textarea name="note" rows={2} maxLength={1000} className={field} /></label>
          </>
        )}
        {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
        {state.message && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{state.message}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => ref.current?.close()} className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{state.message ? "Close" : "Cancel"}</button>
          {!state.message && roster.length > 0 && <button disabled={pending} className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{pending ? "Assigning…" : "Assign"}</button>}
        </div>
      </form>
    </dialog>
  );
}
