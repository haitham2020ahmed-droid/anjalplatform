import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { LEVEL_NAMES, studentArticles } from "@/server/readmaster/service";

/** ⭐ ReadMaster for students: my reading Lexile and the articles of my grade. */
export default async function StudentReadMaster() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const v = await studentArticles(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/student" className="text-brand-teal hover:underline">← My work</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy"><span aria-hidden="true">⭐</span> ReadMaster</h1>
      <section className="mt-4 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
        <p className="text-sm text-slate-600">My reading Lexile</p>
        <p className="text-4xl font-bold text-brand-navy">{v.lexile}L</p>
        <p className="text-slate-700">{v.level ? `I read the ${LEVEL_NAMES[v.level]} version of each article.` : ""} Score 75% or more to move up.</p>
      </section>
      {v.articles.length === 0 ? <p className="mt-6 text-slate-600">No articles yet.</p> : (
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {v.articles.map((a) => (
            <li key={a.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-lg font-bold text-brand-navy">{a.title}</p>
              <p className="text-sm text-slate-600">{[a.topic, a.skill].filter(Boolean).join(" · ")}</p>
              {a.done ? <p className="mt-2 text-sm font-semibold text-emerald-800">✓ Done: {a.done.correct}/{a.done.total} ({LEVEL_NAMES[a.done.level]})</p> : <Link href={`/student/readmaster/${a.id}`} className="mt-3 inline-block rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">Read ▶</Link>}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
