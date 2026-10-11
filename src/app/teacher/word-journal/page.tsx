import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { classJournal, journalClasses } from "@/server/vocabulary/service";

export const metadata = { title: "Word journals" };

/** ✍️ Class word journals (read-only): each student's own sentence and “not an example” for the words they added. */
export default async function WordJournalPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = await journalClasses(repo, actor);
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0]?.id ?? "";
  const entries = classId ? await classJournal(repo, actor, classId) : [];
  const byStudent = new Map<string, typeof entries>();
  for (const e of entries) byStudent.set(e.studentId, [...(byStudent.get(e.studentId) ?? []), e]);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="✍️" title="Word Journals" subtitle="Words students added with their own sentence and a sentence that is not an example. A quick way to see who really understands a word." />
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No classes yet.</p> : (
        <>
          <nav className="mb-4 flex flex-wrap gap-2" aria-label="Class">{classes.map((c) => <a key={c.id} href={`/teacher/word-journal?classId=${c.id}`} className={chip(c.id === classId)}>{c.name}</a>)}</nav>
          {!entries.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No journal words in this class yet. Students add them on the My Words page.</p> : (
            <div className="grid gap-4 lg:grid-cols-2">{[...byStudent.entries()].map(([sid, list]) => (
              <section key={sid} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <h2 className="font-bold text-brand-navy">{list[0].studentName} <span className="text-sm font-normal text-slate-500">· {list.length} word{list.length === 1 ? "" : "s"}</span></h2>
                <ul className="mt-2 space-y-2">{list.map((e) => (
                  <li key={e.word} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p><b className="text-brand-navy">{e.word}</b>{e.definition && <span className="text-slate-600"> — {e.definition}</span>}</p>
                    <p className="mt-1 text-emerald-900"><b>Example:</b> {e.myExample}</p>
                    {e.notExample && <p className="text-red-900"><b>Not an example:</b> {e.notExample}</p>}
                  </li>
                ))}</ul>
              </section>
            ))}</div>
          )}
        </>
      )}
    </AppShell>
  );
}
