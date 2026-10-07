import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ActionForm } from "@/components/admin/action-form";
import { card } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { DEFAULT_TARGET, bandTargets, skillCoverage } from "@/server/admin/ai-bank";
import { listQuestions } from "@/server/admin/questions";
import { generateMissingAction } from "../actions";

/** Question coverage per skill, with “Generate Missing” (admins) and the AI review queue. */
export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const actor = await requireActor({ permission: "questions:read" });
  const me = (await getActor())!.user;
  const grade = [4, 5, 6].includes(Number((await searchParams).grade)) ? Number((await searchParams).grade) : 4;
  const rows = await skillCoverage(repo, actor, grade);
  const { aiPending } = await listQuestions(repo, actor, { aiOnly: true, limit: 0 });
  const t = bandTargets(DEFAULT_TARGET);
  const mayGenerate = can(actor, "questions:generate");
  const needing = rows.filter((r) => r.needed > 0).length;
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={actor.role === "TEACHER" ? "/teacher" : "/admin"} className="text-brand-teal hover:underline">← Back</Link></p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy">Question bank coverage</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/questions?status=DRAFT&ai=1" className="rounded-xl bg-amber-100 px-4 py-2 font-semibold text-amber-900">AI drafts to review ({aiPending})</Link>
          {mayGenerate && <Link href="/admin/question-bank/generate" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Generate questions</Link>}
        </div>
      </div>
      <p className="mt-2 max-w-3xl text-slate-600">
        Target per skill: {DEFAULT_TARGET} approved questions ({t.easy} easy · {t.medium} medium · {t.hard} hard). Easy = levels 1–2, medium = 3–5, hard = 6–7.
        Only approved questions are used in practice and placement. “Still needed” counts drafts awaiting review, so nothing is generated twice.
      </p>
      <nav className="mt-4 flex gap-2" aria-label="Grade">
        {[4, 5, 6].map((g) => <Link key={g} href={`/admin/question-bank?grade=${g}`} aria-current={g === grade ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${g === grade ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>Grade {g}</Link>)}
      </nav>
      <section className={card}>
        <p className="text-sm text-slate-600">{rows.length} skills · {needing} below target</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-2">Skill</th><th>Approved</th><th>Easy</th><th>Medium</th><th>Hard</th><th>Awaiting review</th><th>Still needed</th>{mayGenerate && <th />}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.skillId} className="border-b align-middle last:border-0">
                  <td className="py-2"><span className="font-semibold text-brand-navy">{r.name}</span> <span className="text-xs text-slate-500">{r.code}</span></td>
                  <td>{r.approved} / {r.target}</td>
                  <td>{r.approvedByBand.easy}/{t.easy}</td>
                  <td>{r.approvedByBand.medium}/{t.medium}</td>
                  <td>{r.approvedByBand.hard}/{t.hard}</td>
                  <td>{r.pendingReview}</td>
                  <td>{r.needed === 0 ? <span className="text-brand-teal">✓ 0</span> : <span className="font-semibold text-amber-800">{r.needed} ({r.neededByBand.easy}E · {r.neededByBand.medium}M · {r.neededByBand.hard}H)</span>}</td>
                  {mayGenerate && (
                    <td className="py-1">
                      {r.needed > 0 && (
                        <ActionForm action={generateMissingAction} submit={`Generate missing (${Math.min(20, r.needed)})`} className="flex flex-col items-start gap-1">
                          <input type="hidden" name="skillId" value={r.skillId} />
                        </ActionForm>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
