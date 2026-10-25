import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { removePrerequisiteAction, unlinkStandardAction } from "../../actions";
import { PrerequisiteForm, QuestionSuggestForm, SkillForm, StandardForm } from "./skill-forms";
import { suggestQuestionsForSkill } from "@/server/skills/suggest-questions";

/** Edit one skill: name/description, linked standards (official wording shown), prerequisites. */
export default async function SkillEditorPage({ params }: { params: Promise<{ skillId: string }> }) {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const { skillId } = await params;
  const me = (await getActor())!.user;
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill || skill.deletedAt) return notFound();
  // only a skill of the admin's own school (Skill → Curriculum → Grade.schoolId)
  const cur = await repo.findUnique("Curriculum", { id: skill.curriculumId });
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!grade || String(grade.schoolId) !== String(actor.schoolId ?? "")) return notFound();
  const stdLinks = await repo.findMany("SkillStandard", { skillId });
  const standards = stdLinks.length ? await repo.findMany("Standard", { id: { in: stdLinks.map((l) => l.standardId) } }) : [];
  const pre = await repo.findMany("SkillPrerequisite", { skillId });
  const pool = (await repo.findMany("Skill", { curriculumId: skill.curriculumId, deletedAt: null })).filter((k) => k.id !== skillId).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const name = new Map(pool.map((k) => [String(k.id), String(k.name)]));
  return (
    <AppShell name={String(me.displayName)}>
      <Link href="/admin/curriculum" className="text-sm font-medium text-brand-teal hover:underline">Curriculum</Link>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">{String(skill.name)}</h1>
      <div className="mt-4 max-w-xl"><SkillForm skillId={skillId} name={String(skill.name)} description={String(skill.description ?? "")} /></div>

      <h2 className="mt-10 text-xl font-bold text-brand-navy">Standards</h2>
      <ul className="mt-2 max-w-3xl divide-y divide-slate-200">
        {standards.map((s) => (
          <li key={String(s.id)} className="flex items-start justify-between gap-4 py-3">
            <div><p className="font-medium text-brand-navy">{String(s.code).replace("CCSS.ELA-LITERACY.", "")}</p><p className="text-sm text-slate-600">{String(s.description ?? "")}</p></div>
            <form action={unlinkStandardAction}><input type="hidden" name="skillId" value={skillId} /><input type="hidden" name="code" value={String(s.code)} /><button className="text-sm text-red-700 hover:underline">Remove</button></form>
          </li>
        ))}
      </ul>
      <div className="mt-3"><StandardForm skillId={skillId} /></div>

      <h2 className="mt-10 text-xl font-bold text-brand-navy">Learn First (Prerequisites)</h2>
      {pre.length === 0 ? <p className="mt-2 text-slate-600">None. Students can start this skill straight away.</p> : (
        <ul className="mt-2 max-w-3xl divide-y divide-slate-200">
          {pre.map((p) => (
            <li key={String(p.prerequisiteSkillId)} className="flex items-center justify-between gap-4 py-3">
              <span>{name.get(String(p.prerequisiteSkillId)) ?? "Skill from another grade"} <span className="text-sm text-slate-500">(needs {String(p.minimumMastery)} mastery)</span></span>
              <form action={removePrerequisiteAction}><input type="hidden" name="skillId" value={skillId} /><input type="hidden" name="prerequisiteId" value={String(p.prerequisiteSkillId)} /><button className="text-sm text-red-700 hover:underline">Remove</button></form>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3"><PrerequisiteForm skillId={skillId} pool={pool.map((k) => ({ id: String(k.id), name: String(k.name) }))} /></div>

      <h2 className="mt-10 text-xl font-bold text-brand-navy">Find matching questions</h2>
      <QuestionSuggest skillId={skillId} />
    </AppShell>
  );
}

async function QuestionSuggest({ skillId }: { skillId: string }) {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const { group, candidates } = await suggestQuestionsForSkill(repo, actor, skillId);
  if (!group) return <p className="mt-2 text-slate-600">This skill has no MAP goal area linked yet (Admin → MAP Classification), so there is nothing to match against. Link it first, then come back here.</p>;
  if (!candidates.length) return <p className="mt-2 text-slate-600">No published questions of other skills share this skill's MAP area right now.</p>;
  return (
    <>
      <p className="mt-2 text-sm text-slate-600">Published questions of OTHER skills (any grade) whose own MAP area matches this skill&apos;s — tick the ones that fit and move them here. Questions are never moved automatically.</p>
      <QuestionSuggestForm skillId={skillId} candidates={candidates} />
    </>
  );
}
