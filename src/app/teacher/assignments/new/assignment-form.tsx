"use client";
import { useActionState, useState } from "react";
import { createAssignmentAction } from "../../actions";
import { SkillListPicker, type SkillListRow } from "@/components/skill-picker";
import { Combo } from "@/components/ui/combo";
import { SourceSelect } from "@/components/assign/source-select";
import { useT } from "@/i18n/client";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30";

export function AssignmentForm({ classId, classes, units, skills }: { classId: string; classes: { id: string; name: string }[]; units: { id: string; label: string }[]; skills: SkillListRow[] }) {
  const [state, action, pending] = useActionState(createAssignmentAction, {});
  const [target, setTarget] = useState<"SKILL" | "UNIT">("SKILL");
  const t = useT();
  return (
    <form action={action} className="mt-6 max-w-2xl space-y-5">
      {classes.length > 1 ? (
        <fieldset data-testid="assign-classes">
          <legend className="font-medium">Classes <span className="font-normal text-slate-500">(choose one or more)</span></legend>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            {classes.map((c) => (
              <label key={c.id} className="cursor-pointer">
                <input type="checkbox" name="classIds" value={c.id} defaultChecked={c.id === classId} className="peer sr-only" />
                <span className="rounded-full px-3 py-1.5 font-semibold ring-1 ring-slate-300 peer-checked:bg-brand-teal peer-checked:text-white peer-checked:ring-0">{c.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : <input type="hidden" name="classIds" value={classId} />}
      <label className="block font-medium">Title<input name="title" required maxLength={191} className={input} placeholder="Context clues review" /></label>
      <fieldset>
        <legend className="font-medium">What to practise</legend>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2"><input type="radio" name="target" value="SKILL" checked={target === "SKILL"} onChange={() => setTarget("SKILL")} />Chosen skills</label>
          <label className="flex items-center gap-2"><input type="radio" name="target" value="UNIT" checked={target === "UNIT"} onChange={() => setTarget("UNIT")} />A whole unit</label>
        </div>
      </fieldset>
      {target === "SKILL" ? (
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <SkillListPicker skills={skills} mode="multiple" name="skillIds" />
        </div>
      ) : (
        <label className="block font-medium">Unit<Combo name="unitId" label="Unit" defaultValue={units[0]?.id ?? ""} options={units.map((u) => ({ value: u.id, label: u.label }))} className="mt-1" /></label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block font-medium">Start date<input type="date" name="startAt" className={input} /></label>
        <label className="block font-medium">End (due) date<input type="date" name="dueAt" className={input} /></label>
        <label className="block font-medium">Target mastery<input type="number" name="targetMastery" min={40} max={100} defaultValue={75} className={input} /></label>
        <SourceSelect t={t} field={`${input} font-normal`} className="font-medium" />
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{pending ? "Assigning…" : "Assign to class"}</button>
    </form>
  );
}
