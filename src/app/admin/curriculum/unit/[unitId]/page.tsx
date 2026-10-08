import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getUnitEditor } from "@/server/curriculum-admin";
import { unlinkSkillAction } from "../../actions";
import { AddLessonForm, LinkSkillForm, RenameUnitForm } from "./editor-forms";

/** Edit one unit: title, lessons, and which skills each lesson teaches. */
export default async function UnitEditorPage({ params }: { params: Promise<{ unitId: string }> }) {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const { unitId } = await params;
  const me = (await getActor())!.user;
  const ed = await getUnitEditor(repo, actor, unitId);
  return (
    <AppShell name={String(me.displayName)}>
      <Link href="/admin/curriculum" className="text-sm font-medium text-brand-teal hover:underline">All units</Link>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Unit {ed.unit.number}</h1>
      <div className="mt-4 max-w-xl"><RenameUnitForm unitId={ed.unit.id} title={ed.unit.title} description={ed.unit.description} /></div>
      <h2 className="mt-10 text-xl font-bold text-brand-navy">Lessons</h2>
      <ol className="mt-3 space-y-4">
        {ed.lessons.map((l) => (
          <li key={l.id} className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h3 className="font-semibold text-brand-navy">{l.title} <span className="font-normal text-slate-500">({l.code})</span></h3>
            {l.skills.length === 0 ? <p className="mt-2 text-sm text-slate-600">No skills yet. Add the skills this lesson teaches.</p> : (
              <ul className="mt-2 divide-y divide-slate-100">
                {l.skills.map((k) => (
                  <li key={k.skillId + k.label} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/admin/curriculum/skill/${k.skillId}`} className="text-slate-800 hover:text-brand-teal">{k.label}</Link>
                    <form action={unlinkSkillAction}>
                      <input type="hidden" name="unitId" value={ed.unit.id} /><input type="hidden" name="lessonId" value={l.id} /><input type="hidden" name="skillId" value={k.skillId} />
                      <button className="text-sm text-red-700 hover:underline">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <LinkSkillForm unitId={ed.unit.id} lessonId={l.id} pool={ed.skillPool} />
          </li>
        ))}
      </ol>
      <div className="mt-6"><AddLessonForm unitId={ed.unit.id} /></div>
    </AppShell>
  );
}
