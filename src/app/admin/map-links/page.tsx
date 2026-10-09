import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { mapLinks } from "@/server/map/map-more";
import { applySuggestionsAction, linkFamilyAction } from "./actions";

export const metadata = { title: "Bank ↔ MAP" };

/** 🔗 Every skill of the bank with its MAP goal area: what is not linked yet, the suggestion from its standard. */
export default async function MapLinksPage({ searchParams }: { searchParams: Promise<{ msg?: string; all?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const v = await mapLinks(repo, actor);
  const missing = v.rows.filter((r) => !r.areaCode);
  const shown = sp.all ? v.rows : missing.length ? missing : v.rows;
  const nameOf = (c: string | null) => v.areas.find((a) => a.code === c);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/skills", label: "Skills" }} icon="🔗" title="Question Bank ↔ MAP Goal Areas"
        subtitle={<>A skill’s questions are used for MAP plans, small groups and the mid-unit check only when the skill has a MAP goal area. <b>{missing.length}</b> of {v.rows.length} skills have none. The suggestion comes from the skill’s CCSS standard (L.x.1 → Grammar, L.x.2 → Mechanics, L.x.4–6 and RL/RI.x.4 → Vocabulary, RL → Literary, RI → Informational, W → Writing).</>}>
        {missing.some((r) => r.suggested) && <form action={applySuggestionsAction}><button className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">✓ Apply all suggestions ({missing.filter((r) => r.suggested).length})</button></form>}
        <a href={sp.all ? "/admin/map-links" : "/admin/map-links?all=1"} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{sp.all ? "Only unlinked" : "Show all skills"}</a>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!missing.length && !sp.all && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900 ring-1 ring-emerald-200">✅ Every skill is linked to a MAP goal area.</p>}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b text-xs text-slate-500"><th className="p-3">Skill</th><th className="p-2">Grades</th><th className="p-2">Questions</th><th className="p-2">Standard</th><th className="p-2">MAP goal area</th><th className="p-2" /></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.familyId} className="border-b last:border-0">
              <td className="p-3"><b className="text-brand-navy">{r.family}</b>{r.skills.length > 1 && <span className="block text-xs text-slate-500">{r.skills.join(" · ")}</span>}</td>
              <td className="p-2">{r.grades.join(", ")}</td><td className="p-2 tabular-nums">{r.questions}</td><td className="p-2">{r.standard ?? "—"}</td>
              <td className="p-2">
                <form action={linkFamilyAction} className="flex items-center gap-2">
                  <input type="hidden" name="familyId" value={r.familyId} />
                  <select name="area" defaultValue={r.areaCode ?? r.suggested ?? ""} className="rounded-lg border border-slate-300 px-2 py-1.5">
                    <option value="">— none —</option>
                    {v.areas.map((a) => <option key={a.code} value={a.code}>{a.group} · {a.name}</option>)}
                  </select>
                  <button className="rounded-lg bg-brand-navy px-3 py-1.5 font-semibold text-white">Save</button>
                </form>
              </td>
              <td className="p-2 text-xs">{r.areaCode ? <span className="text-emerald-700">✓ {nameOf(r.areaCode)?.group}</span> : r.suggested ? <span className="text-amber-800">suggested: {nameOf(r.suggested)?.name}</span> : <span className="text-slate-400">no suggestion</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </AppShell>
  );
}
