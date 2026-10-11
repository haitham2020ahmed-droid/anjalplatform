import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { levelStory } from "@/server/insights/level-story";
import { tierLine } from "@/server/tiers/views";
import { ReadingScalesHelp } from "@/components/reading-level";

export const metadata = { title: "Level Story" };
const CHIP = { ABOVE: "bg-emerald-600 text-white", ON: "bg-sky-600 text-white", BELOW: "bg-rose-500 text-white" } as const;
const NAME = { ABOVE: "Above", ON: "On", BELOW: "Below" } as const;

/** 🧭 Why a student is at their level: every section, every source, every change. */
export default async function LevelStoryPage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  let v;
  try { v = await levelStory(repo, actor, studentId); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{e.message}</p></AppShell>; }
  const card = "rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200";
  // the tier next to the level (Update 39C): they answer different questions, so they can differ
  const tier = await tierLine(repo, studentId).catch(() => null);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/students/${studentId}`, label: v.student.name }} icon="🧭" title={`Level Story · ${v.student.name}`} subtitle={`${v.student.className} · Grade ${v.student.grade} — where each level comes from. The platform uses every source, the most direct and recent first.`}>
        <Link href="/teacher/levels" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">🎯 Change a level</Link>
      </PageHeader>
      {tier && <p className="mb-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">🧭 <b>Support tier: Tier {tier.tier}</b>{tier.since ? ` since ${tier.since}` : ""} — {tier.reason} <span className="text-slate-500">The level says where the student works against the grade; the tier says how much extra support they get now (it also weighs checks, MAP, fluency and interventions), so the two can differ. <Link href={`/teacher/tiers/${studentId}`} className="font-semibold text-brand-teal underline">Tier history</Link></span></p>}
      {v.conflict && <p role="alert" className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-amber-950 ring-1 ring-amber-300">⚖️ <b>The data disagree:</b> {v.conflict.high.source} says <b>Above</b>, {v.conflict.low.source} says <b>Below</b>. {v.conflict.note}</p>}
      <section className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {v.sections.map((x) => (
          <div key={x.key} className={card}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{x.name}</p>
            <p className="mt-2"><span className={`rounded-full px-3 py-1 text-lg font-bold ${CHIP[x.level]}`}>{NAME[x.level]} Level</span></p>
            <p className="mt-3 text-sm font-semibold text-brand-navy">From: {x.fromName}</p>
            <p className="text-xs text-slate-600">{x.reason}</p>
          </div>
        ))}
      </section>
      <section className={`${card} mb-6`}>
        <h2 className="text-lg font-bold text-brand-navy">What every source says</h2>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2">Source</th><th>Says</th><th>Details</th><th>Date</th></tr></thead>
          <tbody>
            {v.sources.map((x) => (
              <tr key={x.key} className="border-b border-slate-100">
                <td className="py-2 font-medium text-slate-800">{x.name}</td>
                <td>{x.level ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CHIP[x.level]}`}>{NAME[x.level]}</span> : <span className="text-xs text-slate-400">—</span>}</td>
                <td className="text-slate-600">{x.detail}</td>
                <td className="whitespace-nowrap text-xs text-slate-500">{x.date ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ReadingScalesHelp className="mt-3" />
        <p className="mt-3 text-xs text-slate-500">Order of trust: the teacher’s choice (30 days) → their own work in the section → platform results (30 days) → Diagnostic Test → Lexile (ReadMaster, then MAP) → MAP percentile.</p>
      </section>
      <section className={card}>
        <h2 className="text-lg font-bold text-brand-navy">Changes</h2>
        {!v.history.length ? <p className="mt-2 text-sm text-slate-600">No change recorded yet.</p> : (
          <ol className="mt-3 space-y-2 border-s-2 border-slate-200 ps-4">
            {v.history.map((h, i) => (
              <li key={i} className="text-sm">
                <span className="text-xs text-slate-500">{h.date}</span> · <b>{h.section}</b>: {h.from ? `${NAME[h.from as keyof typeof NAME] ?? h.from} → ` : ""}<b>{NAME[h.to as keyof typeof NAME] ?? h.to}</b> <span className="text-slate-600">({h.source}{h.reason ? ` — ${h.reason}` : ""})</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </AppShell>
  );
}
