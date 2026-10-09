import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { accessibleClasses } from "@/server/teacher/assign";
import { respondOverview } from "@/server/curriculum-map/respond";
import { classRespondWork } from "@/server/curriculum-map/respond-assign";

export const metadata = { title: "Respond to Reading" };

/** ✍️ Teacher: Respond to Reading of a class — Assign, Preview and follow who finished. */
export default async function TeacherRespond({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const all = await readableClasses(repo, actor);
  const own = new Set((await accessibleClasses(repo, actor)).map((c) => String(c.id)));
  const grades = await repo.findMany("Grade", { schoolId: actor.schoolId });
  const gradeOf = (c: Record<string, unknown>) => Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0);
  const classes = all.map((c) => ({ id: String(c.id), name: String(c.name), grade: gradeOf(c) })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  const k = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const overview = k ? (await respondOverview(repo, actor)).find((g) => g.grade === k.grade) : undefined;
  const work = k ? await classRespondWork(repo, actor, k.id) : [];
  const canAssign = Boolean(k && own.has(k.id) && actor.role === "TEACHER");
  const sentBySet = new Map<string, (typeof work)[number]>();
  for (const w of work) if (!sentBySet.has(w.setCode)) sentBySet.set(w.setCode, w);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="✍️" title="Respond to Reading" subtitle="Send each Text Set’s writing task: every student gets the version that fits them. Students write in their book and tap “I finished”." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!k ? <p className="text-slate-600">No classes yet.</p> : (
        <>
          <nav aria-label="Classes" className="flex flex-wrap gap-2">
            {classes.map((c) => <Link key={c.id} href={`/teacher/respond?classId=${c.id}`} aria-current={c.id === k.id ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === k.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{c.name}</Link>)}
          </nav>
          {!overview ? <p className="mt-6 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">Grade {k.grade} has no Respond to Reading on the Curriculum Map.</p> : overview.units.map((u) => (
            <section key={u.unit} className="mt-6">
              <h2 className="text-xl font-bold text-brand-navy">{u.unit}</h2>
              <ul className="mt-2 grid gap-3 md:grid-cols-2">
                {u.sets.map((x) => {
                  const ready = x.levels.BELOW || x.levels.ON || x.levels.ABOVE;
                  const sent = sentBySet.get(x.setCode);
                  return (
                    <li key={x.setCode} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <p className="font-bold text-brand-navy">✍️ {x.heading}</p>
                      {x.sharedRead && <p className="text-sm text-slate-600">📖 {x.sharedRead}</p>}
                      <p className="mt-1 text-sm">{sent ? <span className={sent.finished === sent.students ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>{sent.finished === sent.students ? "✅ Finished" : `⏳ ${sent.finished} of ${sent.students} finished`}</span> : ready ? <span className="text-slate-500">Not sent yet</span> : <span className="text-slate-500">Activity not added yet</span>}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canAssign && ready && <Link href={`/teacher/respond/assign?classId=${k.id}&code=${x.setCode}`} className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">⭐ Assign</Link>}
                        <Link href={`/admin/curriculum-map/respond/${x.setCode}`} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">👀 Preview</Link>
                        {sent && <Link href={`/teacher/respond/${sent.id}`} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📋 Follow up</Link>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {work.length > 0 && (
            <section className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-brand-navy">Sent to {k.name}</h2>
              <table className="mt-2 w-full text-left text-sm">
                <thead><tr className="border-b text-slate-500"><th className="py-2">Task</th><th>Sent</th><th>Due</th><th>Finished</th><th></th></tr></thead>
                <tbody>{work.map((w) => (
                  <tr key={w.id} className="border-b last:border-0"><td className="py-2">{w.title.replace(/^Respond to Reading · /, "")}</td><td>{w.createdAt.slice(0, 10)}</td><td>{w.dueAt?.slice(0, 10) ?? "—"}</td><td className="tabular-nums">{w.finished} / {w.students}</td><td><Link href={`/teacher/respond/${w.id}`} className="font-semibold text-brand-teal hover:underline">Open</Link></td></tr>
                ))}</tbody>
              </table>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
