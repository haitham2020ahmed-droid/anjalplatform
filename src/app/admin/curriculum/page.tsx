import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ActionForm } from "@/components/admin/action-form";
import { MiniAction } from "@/components/admin/mini-action";
import { card } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { SKILL_CATEGORIES, SKILL_DOMAINS, curriculumTree } from "@/server/curriculum-manage";
import { createGradeAction, createSkillAction, createUnitAction, deleteGradeAction, skillStateAction, unitStateAction, updateGradeAction } from "./manage-actions";

const input = "rounded-lg border border-slate-300 px-3 py-2";
const badge = (active: boolean) => (active ? null : <span className="ms-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Inactive</span>);
const label = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");

/** Curriculum management: Grade → Unit → Skill → Standard. Create, edit, reorder, activate, delete when safe. */
export default async function CurriculumAdmin() {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const me = (await getActor())!.user;
  const tree = await curriculumTree(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Curriculum</h1>
          <p className="mt-1 text-slate-600">Grades → Units → Skills → Standards. Changes appear at once in the question editor, the question bank, the import template and teacher pages.</p>
        </div>
        <Link href="/admin/curriculum/standards" className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Standards</Link>
      </div>

      <section className={card}>
        <h2 className="font-semibold text-brand-navy">Add a grade</h2>
        <p className="text-sm text-slate-600">Grades are only created here, by an admin. Each new grade starts with an empty curriculum.</p>
        <ActionForm action={createGradeAction} submit="Create grade" className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-sm">Grade number<input name="level" type="number" min={0} max={12} required className={`${input} ms-2 w-20`} /></label>
          <label className="text-sm">Name (optional)<input name="name" placeholder="e.g. Grade 7" maxLength={60} className={`${input} ms-2`} /></label>
        </ActionForm>
      </section>

      {tree.grades.map((g) => (
        <section key={g.id} className={card} aria-labelledby={`g-${g.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`g-${g.id}`} className="text-xl font-bold text-brand-navy">{g.name}{badge(g.isActive)}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <MiniAction action={updateGradeAction} fields={{ gradeId: g.id, isActive: g.isActive ? "0" : "1" }} label={g.isActive ? "Deactivate" : "Activate"} />
              <MiniAction action={deleteGradeAction} fields={{ gradeId: g.id }} label="Delete" tone="danger" confirm={`Delete ${g.name}? This is only possible when it has no classes, students, units or skills.`} />
            </div>
          </div>

          {g.units.length === 0 && <p className="mt-2 text-slate-600">No units yet.</p>}
          <ol className="mt-3 space-y-3">
            {g.units.map((u, ui) => (
              <li key={u.id} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-brand-navy">Unit {u.number}: <Link href={`/admin/curriculum/unit/${u.id}`} className="hover:underline">{u.title}</Link>{badge(u.isActive)}</h3>
                  <div className="flex flex-wrap items-center gap-1">
                    {ui > 0 && <MiniAction action={unitStateAction} fields={{ unitId: u.id, op: "up" }} label="↑" title="Move unit up" />}
                    {ui < g.units.length - 1 && <MiniAction action={unitStateAction} fields={{ unitId: u.id, op: "down" }} label="↓" title="Move unit down" />}
                    <MiniAction action={unitStateAction} fields={{ unitId: u.id, op: u.isActive ? "deactivate" : "activate" }} label={u.isActive ? "Deactivate" : "Activate"} />
                    <MiniAction action={unitStateAction} fields={{ unitId: u.id, op: "delete" }} label="Delete" tone="danger" confirm={`Delete unit ${u.number}? Its skills stay in the grade.`} />
                  </div>
                </div>
                {u.skills.length === 0 ? <p className="mt-1 text-sm text-slate-600">No skills in this unit.</p> : (
                  <ul className="mt-2 divide-y divide-slate-200">
                    {u.skills.map((k, ki) => (
                      <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                        <span>
                          <Link href={`/admin/curriculum/skill/${k.id}`} className="font-medium text-slate-900 hover:text-brand-teal">{k.name}</Link>
                          <span className="ms-2 text-xs text-slate-500">{k.code}{k.standards.length ? ` · ${k.standards.join(", ")}` : " · no standard"} · {k.questions} question{k.questions === 1 ? "" : "s"}</span>{badge(k.isActive)}
                        </span>
                        <span className="flex flex-wrap items-center gap-1">
                          {ki > 0 && <MiniAction action={skillStateAction} fields={{ unitId: u.id, skillId: k.id, op: "up" }} label="↑" title="Move skill up" />}
                          {ki < u.skills.length - 1 && <MiniAction action={skillStateAction} fields={{ unitId: u.id, skillId: k.id, op: "down" }} label="↓" title="Move skill down" />}
                          <MiniAction action={skillStateAction} fields={{ skillId: k.id, op: k.isActive ? "deactivate" : "activate" }} label={k.isActive ? "Deactivate" : "Activate"} />
                          <MiniAction action={skillStateAction} fields={{ skillId: k.id, op: "delete" }} label="Delete" tone="danger" confirm={`Delete “${k.name}”? Only possible when it has no questions, student results or assignments.`} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>

          {g.unplaced.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-brand-navy">Skills not placed in a unit ({g.unplaced.length})</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {g.unplaced.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/curriculum/skill/${k.id}`} className="hover:text-brand-teal">{k.name}</Link><span className="text-xs text-slate-500">{k.code}</span>{badge(k.isActive)}
                    {g.units.map((u) => <MiniAction key={u.id} action={skillStateAction} fields={{ skillId: k.id, unitId: u.id, op: "place" }} label={`→ Unit ${u.number}`} title={`Place in unit ${u.number}`} />)}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ActionForm action={createUnitAction} submit="Add unit" className="space-y-2 rounded-xl p-3 ring-1 ring-slate-200">
              <h3 className="font-semibold text-brand-navy">Add a unit to {g.name}</h3>
              <input type="hidden" name="gradeId" value={g.id} />
              <input name="title" required maxLength={191} placeholder="Unit title" aria-label="Unit title" className={`${input} w-full`} />
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="confirmDuplicate" /> Create anyway if a unit with the same title exists</label>
            </ActionForm>
            <ActionForm action={createSkillAction} submit="Add skill" className="space-y-2 rounded-xl p-3 ring-1 ring-slate-200">
              <h3 className="font-semibold text-brand-navy">Add a skill to {g.name}</h3>
              <input type="hidden" name="gradeId" value={g.id} />
              <input name="name" required maxLength={191} placeholder="Skill name" aria-label="Skill name" className={`${input} w-full`} />
              <div className="flex flex-wrap gap-2">
                <select name="unitId" aria-label="Unit" className={input}><option value="">No unit yet</option>{g.units.map((u) => <option key={u.id} value={u.id}>Unit {u.number}: {u.title}</option>)}</select>
                <select name="domain" required aria-label="Domain" className={input}>{SKILL_DOMAINS.map((d) => <option key={d} value={d}>{label(d)}</option>)}</select>
                <select name="category" required aria-label="Category" className={input}>{SKILL_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
              </div>
              <input name="standards" placeholder="Standards, e.g. RL.7.1, RL.7.2 (must already exist)" aria-label="Standard codes" className={`${input} w-full`} />
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="confirmDuplicate" /> Create anyway if a skill with the same name exists</label>
            </ActionForm>
          </div>
        </section>
      ))}
    </AppShell>
  );
}
