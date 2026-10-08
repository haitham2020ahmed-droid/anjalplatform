import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { classRecommendations } from "@/server/map/recommend";
import { assignRecommendationsAction } from "./actions";

export const metadata = { title: "MAP recommendations" };

/** 💡 MAP recommendations: skills each student should work on, from their MAP scores. The teacher chooses. */
export default async function MapRecommendations({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await classRecommendations(repo, actor, classId) : null;
  const isTeacher = actor.role === "TEACHER";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/map-rit", label: "MAP RIT" }} icon="💡" title="MAP recommendations"
        subtitle="After the MAP scores are uploaded, the platform suggests skills for each student (their weakest MAP goal areas, then the skills where their mastery is lowest). Untick what you do not want and assign: it goes to the student's 🗺️ My MAP." />
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">
        {classes.map((c) => <Link key={String(c.id)} href={`/teacher/map-recommendations?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}
      </nav>
      {!v ? <p className="text-slate-600">No classes yet.</p> : v.rows.length === 0 ? (
        <Section><p className="text-slate-600">No MAP scores for {v.className} yet. <Link href="/teacher/map-rit" className="font-semibold text-brand-teal underline">Upload them on the MAP RIT page</Link>.</p></Section>
      ) : (
        <form action={assignRecommendationsAction}>
          <input type="hidden" name="classId" value={classId} />
          <Section title={`${v.className} · Grade ${v.grade} · ${v.rows.length} student(s)`} icon="🗺️" hint={v.withoutScore ? `${v.withoutScore} student(s) have no MAP score yet.` : undefined}>
            <ul className="space-y-3">
              {v.rows.map((r) => (
                <li key={r.studentId} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-brand-navy">{r.name} <span className="ms-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">RIT {r.rit ?? "—"}</span></p>
                    {r.areas.length > 0 && <p className="text-xs text-slate-600">Weakest: {r.areas.map((a) => `${a.name}${a.rit !== null ? ` (${a.rit})` : ""}`).join(" · ")}</p>}
                  </div>
                  {r.skills.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing new to recommend.</p> : (
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {r.skills.map((k) => (
                        <label key={k.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200">
                          <input type="checkbox" name="pick" value={`${r.studentId}|${k.id}`} defaultChecked disabled={!isTeacher} />
                          <span className="flex-1">{k.name}</span><span className="text-xs text-slate-400">{k.mastery !== null ? `${k.mastery}%` : "new"}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {isTeacher && (
              <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Due date (optional)<input type="date" name="dueAt" className="rounded-xl border border-slate-300 px-3 py-2" /></label>
                <button className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-bold text-white shadow hover:bg-brand-purple">✅ Assign selected</button>
              </div>
            )}
          </Section>
        </form>
      )}
    </AppShell>
  );
}
