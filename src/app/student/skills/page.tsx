import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { mySkills, type MySkill } from "@/server/game/skill-games";

export const metadata = { title: "My skills" };

const ICON: Record<string, string> = { Reading: "📖", Vocabulary: "🔤", Grammar: "✏️", Language: "📝", Other: "⭐" };

/** 🧩 My skills: what my teacher assigned first, then every other skill of my grade to practise or play. */
export default async function MySkillsPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const v = await mySkills(repo, actor);
  const card = (k: MySkill) => (
    <li key={k.id} className="lift flex flex-col justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div>
        <p className="font-bold text-brand-navy">{ICON[k.kindName] ?? "⭐"} {k.name}</p>
        {k.assigned && <p className="mt-1 text-xs text-slate-600">{k.status === "COMPLETED" ? "✅ Done" : k.status === "OVERDUE" ? "⏰ Late — you can still finish" : k.dueAt ? `📅 Due ${k.dueAt.slice(0, 10)}` : "From my teacher"}</p>}
        {k.assigned && k.progress !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.round(Number(k.progress) * (Number(k.progress) <= 1 ? 100 : 1))}%` }} /></div>}
      </div>
      <div className="flex gap-2">
        <Link href={`/practice/${k.id}${k.assigned ? "" : "?from=free"}`} className="flex-1 rounded-xl bg-brand-navy px-3 py-2 text-center text-sm font-bold text-white hover:bg-brand-purple">📘 Practise</Link>
        <Link href={`/game/${k.id}`} className="flex-1 rounded-xl bg-brand-gold px-3 py-2 text-center text-sm font-bold text-brand-navy hover:brightness-95">🎮 Play</Link>
      </div>
    </li>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🧩" title="My Skills" subtitle="Start with the skills from your teacher. Then pick any skill to practise or play — it opens at the right level for you." />
      <section>
        <h2 className="text-xl font-extrabold text-brand-navy">⭐ From My Teacher</h2>
        {v.assigned.length === 0 ? <p className="mt-2 rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">Nothing assigned right now. Pick a skill below!</p> : <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{v.assigned.map(card)}</ul>}
      </section>
      {v.free.map((g) => (
        <section key={g.kind} className="mt-8">
          <h2 className="text-xl font-extrabold text-brand-navy">{ICON[g.kind] ?? "⭐"} {g.kind}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{g.skills.map(card)}</ul>
        </section>
      ))}
    </AppShell>
  );
}
