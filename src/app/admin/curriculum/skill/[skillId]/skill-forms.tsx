"use client";
import { useActionState } from "react";
import { addPrerequisiteAction, linkQuestionsAction, linkStandardAction, updateSkillAction } from "../../actions";
import { Combo } from "@/components/ui/combo";
import type { QuestionCandidate } from "@/server/skills/suggest-questions";

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

export function QuestionSuggestForm({ skillId, candidates }: { skillId: string; candidates: QuestionCandidate[] }) {
  const [s, a, p] = useActionState(linkQuestionsAction, {});
  return (
    <form action={a} className="mt-2 space-y-2">
      <input type="hidden" name="skillId" value={skillId} />
      <ul className="max-w-3xl divide-y divide-slate-200 rounded-lg ring-1 ring-slate-200">
        {candidates.map((q) => (
          <li key={q.id} className="flex items-start gap-2 px-3 py-2 text-sm">
            <input type="checkbox" name="qid" value={q.id} className="mt-1 h-4 w-4" />
            <span>
              <span>{q.stem}</span>
              <span className="ms-2 text-xs text-slate-500">({q.skillName}{q.grade ? ` · G${q.grade}` : ""}{q.difficultyLevel ? ` · level ${q.difficultyLevel}` : ""})</span>
            </span>
          </li>
        ))}
      </ul>
      <button disabled={p} className={btn}>Move ticked questions here</button> <Msg s={s} />
    </form>
  );
}

export function PrerequisiteForm({ skillId, pool }: { skillId: string; pool: { id: string; name: string }[] }) {
  const [s, a, p] = useActionState(addPrerequisiteAction, {});
  return (
    <form action={a} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="skillId" value={skillId} />
      <label className="block text-sm font-medium">Students should learn first
        <Combo name="prerequisiteId" required label="Choose a skill" options={pool.map((k) => ({ value: k.id, label: k.name }))} placeholder="Choose a skill" className="min-w-64" />
      </label>
      <label className="block text-sm font-medium">Needed mastery<input name="minimumMastery" type="number" min={0} max={100} defaultValue={60} className={input} /></label>
      <button disabled={p} className={btn}>Add prerequisite</button> <Msg s={s} />
    </form>
  );
}
