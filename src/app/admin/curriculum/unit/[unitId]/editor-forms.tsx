"use client";
import { useActionState } from "react";
import { addLessonAction, linkSkillAction, renameUnitAction } from "../../actions";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30";
const btn = "rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-60";
const Msg = ({ s }: { s: { error?: string; ok?: boolean } }) =>
  s.error ? <p role="alert" className="text-sm text-red-700">{s.error}</p> : s.ok ? <p role="status" className="text-sm text-teal-700">Saved.</p> : null;

export function RenameUnitForm({ unitId, title, description }: { unitId: string; title: string; description: string }) {
  const [s, a, p] = useActionState(renameUnitAction, {});
  return (
    <form action={a} className="space-y-2">
      <input type="hidden" name="unitId" value={unitId} />
      <label className="block text-sm font-medium">Unit title<input name="title" defaultValue={title} className={input} required maxLength={191} /></label>
      <label className="block text-sm font-medium">Description<textarea name="description" defaultValue={description} rows={2} className={input} /></label>
      <button disabled={p} className={btn}>Save unit</button> <Msg s={s} />
    </form>
  );
}

export function AddLessonForm({ unitId }: { unitId: string }) {
  const [s, a, p] = useActionState(addLessonAction, {});
  return (
    <form action={a} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="unitId" value={unitId} />
      <label className="block text-sm font-medium">New lesson title<input name="title" className={input} required maxLength={191} /></label>
      <label className="block text-sm font-medium">Genre (optional)<input name="genre" className={input} maxLength={100} /></label>
      <button disabled={p} className={btn}>Add lesson</button> <Msg s={s} />
    </form>
  );
}

export function LinkSkillForm({ unitId, lessonId, pool }: { unitId: string; lessonId: string; pool: { id: string; name: string }[] }) {
  const [s, a, p] = useActionState(linkSkillAction, {});
  return (
    <form action={a} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="lessonId" value={lessonId} />
      <label className="block text-sm font-medium">Add a skill
        <select name="skillId" className={input} required defaultValue="">
          <option value="" disabled>Choose a skill</option>
          {pool.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Taught as
        <select name="role" className={input} defaultValue="COMPREHENSION_SKILL">
          <option value="COMPREHENSION_SKILL">Comprehension skill</option>
          <option value="STRATEGY_AND_FEATURE">Strategy / text feature</option>
          <option value="VOCABULARY_STRATEGY">Vocabulary strategy</option>
          <option value="AUTHORS_CRAFT">Author&apos;s craft</option>
          <option value="GRAMMAR">Grammar</option>
          <option value="SPELLING">Spelling</option>
          <option value="WRITING">Writing</option>
        </select>
      </label>
      <button disabled={p} className={btn}>Add skill</button> <Msg s={s} />
    </form>
  );
}
