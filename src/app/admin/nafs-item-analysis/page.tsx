import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { mostMissedNafsQuestions, MIN_ITEM_ATTEMPTS } from "@/server/nafs/item-analysis";
import { RichInline } from "@/components/rich-inline";

export const metadata = { title: "NAFS Item Analysis" };

/**
 * 📊 Internal item-analysis (teacher/admin only, never shown to students or parents): the NAFS bank questions
 * students most often get wrong, from the NAFS center's own adaptive practice answers — for curriculum review of
 * the question bank. Same NAFS access as the NAFS center itself (Grade 6 teachers and admins).
 */
export default async function NafsItemAnalysisPage() {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher?msg=" + encodeURIComponent("NAFS is for Grade 6 teachers only."));
  const me = (await getActor())!.user;
  const rows = await mostMissedNafsQuestions(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/nafs", label: "NAFS" }} icon="📊" title="NAFS Item Analysis"
        subtitle={`The NAFS bank questions students most often get wrong, from the NAFS center's own practice answers — worst first. Only questions with ${MIN_ITEM_ATTEMPTS}+ recorded answers are shown. For curriculum review of the question bank only; students and parents never see this.`} />
      {!rows.length ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No NAFS question has enough practice answers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-3">Question</th>
                <th className="p-3">NAFS skill</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Wrong</th>
                <th className="p-3">Miss rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top last:border-0">
                  <td className="max-w-md p-3" data-content lang="en"><RichInline text={r.stem} /></td>
                  <td className="p-3">{r.skill}</td>
                  <td className="p-3 tabular-nums">{r.attempts}</td>
                  <td className="p-3 tabular-nums">{r.wrong}</td>
                  <td className="p-3 tabular-nums font-semibold text-red-800">{r.missRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
