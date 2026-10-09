import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ActionForm } from "@/components/admin/action-form";
import { MiniAction } from "@/components/admin/mini-action";
import { card } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { STANDARD_FRAMEWORKS, listStandards } from "@/server/curriculum-manage";
import { createStandardAction, standardStateAction } from "../manage-actions";

const input = "rounded-lg border border-slate-300 px-3 py-2";

/** Standards: create, edit description and grade, activate/deactivate, delete when unused. */
export default async function StandardsPage({ searchParams }: { searchParams: Promise<{ q?: string; grade?: string }> }) {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const all = await listStandards(repo, actor);
  const rows = all.filter((s) => (!q || s.code.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) && (!sp.grade || String(s.gradeLevel ?? "") === sp.grade));
  const grades = [...new Set(all.map((s) => s.gradeLevel).filter((g): g is number => g !== null))].sort((a, b) => a - b);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin/curriculum" className="text-brand-teal hover:underline">← Curriculum</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Standards</h1>
      <p className="mt-1 text-slate-600">Link standards to skills on each skill's page. A standard used by a skill or question can be deactivated but not deleted.</p>

      <section className={card}>
        <h2 className="font-semibold text-brand-navy">Add a Standard</h2>
        <ActionForm action={createStandardAction} submit="Create standard" className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select name="framework" aria-label="Framework" className={input}>{STANDARD_FRAMEWORKS.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}</select>
            <input name="code" required maxLength={120} placeholder="Code, e.g. RL.7.1" aria-label="Code" className={input} />
            <input name="gradeLevel" type="number" min={0} max={12} placeholder="Grade" aria-label="Grade level" className={`${input} w-24`} />
          </div>
          <textarea name="description" maxLength={2000} rows={2} placeholder="What the standard says" aria-label="Description" className={`${input} w-full`} />
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="confirmDuplicate" /> Create anyway if a standard with the same code exists in another framework</label>
        </ActionForm>
      </section>

      <section className={card}>
        <form className="flex flex-wrap items-end gap-2">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search code or text" aria-label="Search standards" className={input} />
          <select name="grade" defaultValue={sp.grade ?? ""} aria-label="Grade" className={input}><option value="">All grades</option>{grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select>
          <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Filter</button>
          <span className="text-sm text-slate-600">{rows.length} of {all.length}</span>
        </form>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-2">Code</th><th>Grade</th><th className="min-w-[18rem]">Description</th><th>Used by</th><th /></tr></thead>
            <tbody>{rows.slice(0, 400).map((s) => (
              <tr key={s.id} className="border-b align-top last:border-0">
                <td className="py-2 pe-2 font-medium">{s.code.replace(/^CCSS\.ELA-LITERACY\./, "")}<div className="text-xs text-slate-500">{s.framework.replace(/_/g, " ")}{s.isActive ? "" : " · inactive"}</div></td>
                <td className="pe-2">{s.gradeLevel ?? "—"}</td>
                <td className="pe-2">
                  <ActionForm action={standardStateAction} submit="Save" className="flex flex-wrap items-start gap-2">
                    <input type="hidden" name="standardId" value={s.id} /><input type="hidden" name="op" value="save" />
                    <textarea name="description" defaultValue={s.description} rows={2} maxLength={2000} aria-label={`Description of ${s.code}`} className={`${input} min-w-[16rem] flex-1 text-sm`} />
                    <input name="gradeLevel" type="number" min={0} max={12} defaultValue={s.gradeLevel ?? ""} aria-label="Grade level" className={`${input} w-20 text-sm`} />
                  </ActionForm>
                </td>
                <td className="pe-2 text-slate-600">{s.skills} skill{s.skills === 1 ? "" : "s"}, {s.questions} question{s.questions === 1 ? "" : "s"}</td>
                <td className="space-y-1">
                  <MiniAction action={standardStateAction} fields={{ standardId: s.id, op: s.isActive ? "deactivate" : "activate" }} label={s.isActive ? "Deactivate" : "Activate"} />
                  <MiniAction action={standardStateAction} fields={{ standardId: s.id, op: "delete" }} label="Delete" tone="danger" confirm={`Delete ${s.code}? Only possible when no skill or question uses it.`} />
                </td>
              </tr>
            ))}</tbody>
          </table>
          {rows.length > 400 && <p className="mt-2 text-sm text-slate-600">Showing the first 400. Use the search or grade filter.</p>}
        </div>
      </section>
    </AppShell>
  );
}
