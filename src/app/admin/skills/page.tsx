import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { duplicateSkills, KIND_NAME, masterSkills, SKILL_LISTS } from "@/server/skills/master";
import { mergeAction } from "./actions";

export const metadata = { title: "Skills" };

/** 🧩 The master skills list (every list on the platform reads it) + possible duplicates to merge. */
export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ grade?: string; msg?: string; kind?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const all = await masterSkills(repo, actor.schoolId!);
  const grades = [...new Set(all.map((k) => k.grade))].sort();
  const grade = grades.includes(Number(sp.grade)) ? Number(sp.grade) : grades[0] ?? 4;
  const kinds = [...new Set(all.filter((k) => k.grade === grade).map((k) => k.kind))];
  const list = all.filter((k) => k.grade === grade && (!sp.kind || k.kind === sp.kind));
  const dups = (await duplicateSkills(repo, actor)).filter((d) => d.grade === grade);
  const merged = (await repo.findMany("AuditLog", { action: "skill.merge" })).filter((l) => all.every((k) => k.id !== String(l.entityId))).slice(-20);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Administration" }} icon="🧩" title="Skills (master list)"
        subtitle={<>Every skill of the platform, once. All skill lists (Curriculum, Assign, Games, Grammar, ReadMaster, Question Bank, MAP plans) read this list, so a new skill appears everywhere by itself.</>}>
        <Link href="/admin/map-links" className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">🔗 Link skills to MAP goal areas</Link>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Grade" className="flex flex-wrap gap-2">{grades.map((g) => <Link key={g} href={`/admin/skills?grade=${g}`} className={chip(g === grade)}>Grade {g} ({all.filter((k) => k.grade === g).length})</Link>)}</nav>
      {dups.length > 0 && (
        <section className="mt-5 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <h2 className="text-lg font-bold text-amber-900">⚠️ Possible duplicates ({dups.length})</h2>
          <p className="text-sm text-amber-900">Same grade, same meaning, different names. Check each pair; press <b>Merge</b> only when they really are the same skill. The questions of the other skill move to the kept one; the other skill is switched off, never deleted, and you can undo.</p>
          <ul className="mt-3 space-y-3">{dups.map((d) => (
            <li key={d.key} className="rounded-2xl bg-white p-3 ring-1 ring-amber-200">
              {d.skills.slice(1).map((k) => (
                <form key={k.id} action={mergeAction} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="grade" value={grade} /><input type="hidden" name="keep" value={d.keep} /><input type="hidden" name="merge" value={k.id} />
                  <span>Keep <b>{d.skills[0].name}</b> ({d.skills[0].questions} q) ← merge <b>{k.name}</b> ({k.questions} q)</span>
                  <button className="rounded-lg bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700">Merge</button>
                </form>
              ))}
            </li>
          ))}</ul>
        </section>
      )}
      {merged.length > 0 && (
        <details className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold text-brand-navy">Merged skills ({merged.length}) — undo</summary>
          <ul className="mt-2 space-y-1 text-sm">{merged.map((l) => { const a = (l.after ?? {}) as { intoName?: string }; const b = (l.before ?? {}) as { name?: string }; return (
            <li key={String(l.id)}><form action={mergeAction} className="flex items-center gap-2"><input type="hidden" name="op" value="undo" /><input type="hidden" name="grade" value={grade} /><input type="hidden" name="skillId" value={String(l.entityId)} /><span>{b.name} → {a.intoName}</span><button className="rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-slate-300">↩ Undo</button></form></li>
          ); })}</ul>
        </details>
      )}
      <div className="mt-5 flex flex-wrap gap-2">{[["", "All"], ...kinds.map((k) => [k, KIND_NAME[k]])].map(([k, l]) => <Link key={k} href={`/admin/skills?grade=${grade}${k ? `&kind=${k}` : ""}`} className={chip((sp.kind ?? "") === k)}>{l}</Link>)}</div>
      <div className="mt-3 overflow-x-auto rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-3">Skill</th><th className="px-2">Kind</th><th className="px-2">MAP goal area</th><th className="px-2">Standards</th><th className="px-2">Questions</th><th className="px-2">In a unit</th><th className="px-2"></th></tr></thead>
          <tbody>{list.map((k) => (
            <tr key={k.id} className="border-b last:border-0">
              <td className="py-1.5 pe-3 font-medium">{k.name}</td><td className="px-2">{KIND_NAME[k.kind]}</td><td className="px-2">{k.area ?? <span className="text-amber-700">—</span>}</td>
              <td className="px-2 text-xs">{k.standards.join(", ") || <span className="text-amber-700">—</span>}</td>
              <td className={`px-2 tabular-nums ${k.questions ? "" : "text-amber-700"}`}>{k.questions}</td><td className="px-2">{k.inUnit ? "✓" : "—"}</td>
              <td className="px-2"><Link href={`/admin/questions?status=PUBLISHED&grade=${grade}&skill=${k.id}`} className="text-brand-teal underline">Questions</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer font-semibold">Where skills are listed</summary><ul className="mt-1 list-disc ps-6">{SKILL_LISTS.map((x) => <li key={x}>{x}</li>)}</ul></details>
    </AppShell>
  );
}
