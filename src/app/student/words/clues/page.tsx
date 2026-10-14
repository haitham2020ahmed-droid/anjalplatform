import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { CLUE_LABELS, clueCoach } from "@/server/vocabulary/service";

export const metadata = { title: "Context clue coach" };

/** 🔎 Context clue coach: my accuracy per kind of clue, a tip for the one I miss most, and where to practise it. */
export default async function ClueCoachPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const c = await clueCoach(repo, actor);
  const tip = c.focus ? CLUE_LABELS[c.focus.type] : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/words?tab=saved", label: "My Words" }} icon="🔎" title="Context Clue Coach" subtitle="When you meet a new word, the words around it often tell you what it means. Practise the kind of clue you miss most." />
      {!c.stats.length ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No context clue questions are ready for your grade yet. Ask your teacher.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {c.focus && tip && (
            <section className="rounded-3xl bg-white p-5 ring-2 ring-brand-gold">
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Practise next</p>
              <h2 className="mt-1 text-2xl font-bold text-brand-navy">{tip.label} clues</h2>
              <p className="mt-2 text-slate-800">{tip.tip}</p>
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-slate-700"><b>Example:</b> {tip.example}</p>
              <p className="mt-3 text-sm text-slate-600">{c.focus.total ? `You answered ${c.focus.right} of ${c.focus.total} correctly.` : "You have not tried these yet."} {c.focus.questions} question{c.focus.questions === 1 ? "" : "s"} use this clue.</p>
              {c.practiceSkillId && <Link href={`/practice/${c.practiceSkillId}?from=free`} className="mt-4 inline-block rounded-2xl bg-brand-navy px-5 py-3 font-bold text-white hover:bg-brand-purple">📘 Practise {c.practiceSkillName}</Link>}
            </section>
          )}
          <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-brand-navy">My clue types</h2>
            <ul className="mt-2 space-y-2">{c.stats.map((x) => (
              <li key={x.type} className="flex items-center gap-3 text-sm">
                <span className="w-40 font-semibold text-slate-800">{x.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={`block h-2 rounded-full ${x.accuracy === null ? "" : x.accuracy >= 80 ? "bg-emerald-500" : x.accuracy >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${x.accuracy ?? 0}%` }} /></span>
                <span className="w-24 text-right text-slate-600">{x.accuracy === null ? "not tried" : `${x.accuracy}% (${x.total})`}</span>
              </li>
            ))}</ul>
            <p className="mt-3 text-xs text-slate-400">The coach chooses the clue type with the lowest score, so it changes as you improve.</p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
