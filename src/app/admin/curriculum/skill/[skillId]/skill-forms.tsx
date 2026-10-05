"use client";
import { useActionState } from "react";
import { addPrerequisiteAction, linkStandardAction, updateSkillAction } from "../../actions";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30";
const btn = "rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-60";
const Msg = ({ s }: { s: { error?: string; ok?: boolean } }) =>
  s.error ? <p role="alert" className="text-sm text-red-700">{s.error}</p> : s.ok ? <p role="status" className="text-sm text-teal-700">Saved.</p> : null;

export function SkillForm({ skillId, name, description }: { skillId: string; name: string; description: string }) {
  const [s, a, p] = useActionState(updateSkillAction, {});
  return (
    <form action={a} className="space-y-2">
      <input type="hidden" name="skillId" value={skillId} />
      <label className="block text-sm font-medium">Skill name (students see this)<input name="name" defaultValue={name} className={input} required maxLength={191} /></label>
      <label className="block text-sm font-medium">Description<textarea name="description" defaultValue={description} rows={2} className={input} /></label>
      <button disabled={p} className={btn}>Save skill</button> <Msg s={s} />
    </form>
  );
}

export function StandardForm({ skillId }: { skillId: string }) {
  const [s, a, p] = useActionState(linkStandardAction, {});
  return (
    <form action={a} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="skillId" value={skillId} />
      <label className="block text-sm font-medium">Add a standard by code<input name="code" placeholder="RL.4.2" className={input} required /></label>
      <button disabled={p} className={btn}>Add standard</button> <Msg s={s} />
    </form>
  );
}

export function PrerequisiteForm({ skillId, pool }: { skillId: string; pool: { id: string; name: string }[] }) {
  const [s, a, p] = useActionState(addPrerequisiteAction, {});
  return (
    <form action={a} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="skillId" value={skillId} />
      <label className="block text-sm font-medium">Students should learn first
        <select name="prerequisiteId" className={input} required defaultValue="">
          <option value="" disabled>Choose a skill</option>
          {pool.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Needed mastery<input name="minimumMastery" type="number" min={0} max={100} defaultValue={60} className={input} /></label>
      <button disabled={p} className={btn}>Add prerequisite</button> <Msg s={s} />
    </form>
  );
}
