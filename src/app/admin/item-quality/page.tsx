import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { itemQuality, MIN_ANSWERS, type ItemFlag } from "@/server/admin/item-quality";

export const metadata = { title: "Question quality" };
const FLAG: Record<ItemFlag, [string, string, string]> = {
  TOO_EASY: ["🟢 Too easy for its level", "bg-emerald-50 text-emerald-800 ring-emerald-200", "Move it down a level, or make it harder"],
  TOO_HARD: ["🔴 Too hard for its level", "bg-red-50 text-red-800 ring-red-200", "Check the answer key, or move it up a level"],
  GUESSED: ["⚡ Often guessed", "bg-orange-50 text-orange-900 ring-orange-200", "Shorten or clarify the question or its passage"],
  UNUSED_OPTION: ["🎯 Option never chosen", "bg-violet-50 text-violet-900 ring-violet-200", "Replace it with a more believable wrong answer"],
};

/** 🔬 Data-driven content decisions: questions whose real answers do not fit their level. */
export default async function ItemQualityPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const { rows, checked } = await itemQuality(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Question Bank" }} icon="🔬" title="Question quality"
        subtitle={`From the students' own answers: every published question with ${MIN_ANSWERS}+ answers is checked against its level. ${checked} checked · ${rows.length} need attention.`}>
        <Link href="/admin/bank-gaps" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">🕳 Bank gaps</Link>
      </PageHeader>
      <ul className="mb-5 grid gap-2 text-sm sm:grid-cols-2">{(Object.keys(FLAG) as ItemFlag[]).map((f) => <li key={f} className={`rounded-xl px-3 py-2 ring-1 ${FLAG[f][1]}`}><b>{FLAG[f][0]}</b> · {FLAG[f][2]}</li>)}</ul>
      {rows.length === 0 ? <p className="rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">{checked ? "✅ Every checked question fits its level." : `No question has ${MIN_ANSWERS} answers yet: this report fills in as students practise.`}</p> : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">Question</th><th className="p-3">Place</th><th className="p-3">Answers</th><th className="p-3">Correct</th><th className="p-3">Guessed</th><th className="p-3">Why</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="max-w-md p-3"><Link href={`/admin/questions/${r.id}`} className="font-medium text-brand-navy hover:underline">{r.stem.slice(0, 140)}</Link></td>
                <td className="p-3"><code className="text-xs">{r.place ?? "—"}</code></td>
                <td className="p-3 tabular-nums">{r.answers}</td><td className="p-3 tabular-nums">{r.correctPct}%</td><td className="p-3 tabular-nums">{r.rapidPct}%</td>
                <td className="p-3"><div className="flex flex-wrap gap-1">{r.flags.map((f) => <span key={f} className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${FLAG[f][1]}`}>{FLAG[f][0]}{f === "UNUSED_OPTION" ? `: ${r.unused.join(", ")}` : ""}</span>)}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
