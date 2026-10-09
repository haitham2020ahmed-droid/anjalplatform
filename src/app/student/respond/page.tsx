import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentRespondList } from "@/server/curriculum-map/respond";
import { studentRespondWork } from "@/server/curriculum-map/respond-assign";

export const metadata = { title: "Respond to Reading" };

/** ✍️ Respond to Reading for students: my tasks first, then every Text Set of my grade. */
export default async function StudentRespondList() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [v, tasks] = await Promise.all([studentRespondList(repo, actor), studentRespondWork(repo, actor)]);
  const todo = tasks.filter((t) => !t.finishedAt), done = tasks.filter((t) => t.finishedAt);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="✍️" title="Respond to Reading" subtitle="Read the task, write your answer in your book, then tap “I finished”." />
      {tasks.length > 0 && (
        <section className="rounded-3xl bg-gradient-to-br from-violet-50 to-white p-5 ring-1 ring-violet-200">
          <h2 className="text-xl font-bold text-brand-navy">📝 My Tasks</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {[...todo, ...done].map((t) => (
              <li key={t.assignmentId}><Link href={`/student/respond/${t.setCode}`} className={`lift block rounded-2xl p-4 ring-1 ${t.finishedAt ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-violet-200"}`}>
                <p className="text-lg font-bold text-brand-navy">{t.finishedAt ? "✅" : "✍️"} {t.heading}</p>
                <p className="text-sm text-slate-600">{t.finishedAt ? `Finished ${t.finishedAt.slice(0, 10)}${t.score !== null ? ` · Score ${t.score}/4` : ""}` : t.dueAt ? `Due ${t.dueAt.slice(0, 10)}` : "To do"}</p>
                {t.feedback && <p className="mt-1 text-sm text-violet-900">💬 {t.feedback}</p>}
              </Link></li>
            ))}
          </ul>
        </section>
      )}
      {v.units.length === 0 ? (!tasks.length && <p className="mt-6 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No activities yet.</p>) : v.units.map((u) => (
        <section key={u.unit} className="mt-6">
          <h2 className="text-xl font-bold text-brand-navy">{u.unit}</h2>
          <ul className="mt-2 grid gap-3 md:grid-cols-2">
            {u.sets.map((x) => (
              <li key={x.setCode}><Link href={`/student/respond/${x.setCode}`} className="lift block rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-lg font-bold text-brand-navy">✍️ {x.heading}</p>{x.sharedRead && <p className="text-sm text-slate-600">📖 {x.sharedRead}</p>}
              </Link></li>
            ))}
          </ul>
        </section>
      ))}
    </AppShell>
  );
}
