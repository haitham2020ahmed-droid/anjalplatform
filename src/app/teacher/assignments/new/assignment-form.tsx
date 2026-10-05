"use client";
import { useActionState, useState } from "react";
import { createAssignmentAction } from "../../actions";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30";

export function AssignmentForm({ classId, units, skills }: { classId: string; units: { id: string; label: string }[]; skills: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createAssignmentAction, {});
  const [target, setTarget] = useState<"SKILL" | "UNIT">("SKILL");
  return (
    <form action={action} className="mt-6 max-w-2xl space-y-5">
      <input type="hidden" name="classId" value={classId} />
      <label className="block font-medium">Title<input name="title" required maxLength={191} className={input} placeholder="Context clues review" /></label>
      <fieldset>
        <legend className="font-medium">What to practise</legend>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2"><input type="radio" name="target" value="SKILL" checked={target === "SKILL"} onChange={() => setTarget("SKILL")} />Chosen skills</label>
          <label className="flex items-center gap-2"><input type="radio" name="target" value="UNIT" checked={target === "UNIT"} onChange={() => setTarget("UNIT")} />A whole unit</label>
        </div>
      </fieldset>
      {target === "SKILL" ? (
        <fieldset className="max-h-72 overflow-y-auto rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <legend className="sr-only">Skills</legend>
          <div className="grid gap-2 sm:grid-cols-2">{skills.map((k) => <label key={k.id} className="flex items-start gap-2"><input type="checkbox" name="skillIds" value={k.id} className="mt-1" />{k.name}</label>)}</div>
        </fieldset>
      ) : (
        <label className="block font-medium">Unit<select name="unitId" className={input}>{units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block font-medium">Due date<input type="date" name="dueAt" className={input} /></label>
        <label className="block font-medium">Target mastery<input type="number" name="targetMastery" min={40} max={100} defaultValue={75} className={input} /></label>
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{pending ? "Assigning…" : "Assign to class"}</button>
    </form>
  );
}
