import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { unclassifiedQuestions } from "@/server/curriculum-map/questions";
import { autoClassifyAction, classifyAction } from "./actions";
import { PageHeader } from "@/components/page-header";

/** 🏷️ Curriculum questions without a platform skill: give each one a skill of its grade. */
export default async function UnclassifiedPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { rows, skills } = await unclassifiedQuestions(repo, actor.schoolId!);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Question Bank" }} icon="🏷️" title="Classify curriculum questions" subtitle={<>These questions are on the Curriculum Map but have no platform skill yet (“Unclassified”). Give each a skill of its grade: they then also count in adaptive practice and skill reports. Their place on the map does not change.</>} />
      {sp.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {rows.length === 0 ? <p className="mt-6 rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">Nothing to classify. ✅</p> : (
        <>
        <form action={autoClassifyAction} className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-sm text-amber-900"><b>Optional.</b> These questions already work on the Curriculum Map. Linking them to a platform skill adds them to skill searches and MAP recommendations.</p>
          <button className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">🪄 Auto-classify by standard</button>
        </form>
        <form action={classifyAction} className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">{rows.length} question(s). Choose a skill for the ones you want, then save (empty = leave for later).</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-2">Question</th><th>Place</th><th>Skill</th></tr></thead>
            <tbody>{rows.slice(0, 300).map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="max-w-md py-2 pe-3"><Link href={`/admin/questions/${r.id}`} className="text-brand-navy hover:underline">{r.stem}</Link></td>
                <td className="pe-3"><code className="text-xs">{r.mapCode ?? "—"}</code></td>
                <td><select name={`skill:${r.id}`} defaultValue="" aria-label="Skill" className="max-w-xs rounded-lg border border-slate-300 px-2 py-1"><option value="">— choose (Grade {r.grade}) —</option>{skills.filter((k) => k.grade === r.grade).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></td>
              </tr>
            ))}</tbody>
          </table>
          {rows.length > 300 && <p className="mt-2 text-sm text-slate-500">Showing the first 300; save, and the next ones appear.</p>}
          <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">Save skills</button>
        </form>
        </>
      )}
    </AppShell>
  );
}
