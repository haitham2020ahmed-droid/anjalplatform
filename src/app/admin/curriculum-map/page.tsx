import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { curriculumMapView, type MapViewNode } from "@/server/curriculum-map/view";
import { can } from "@/server/auth/rbac";
import { accessibleClasses } from "@/server/teacher/assign";
import { rosterForGrade } from "@/server/curriculum-map/levels";
import { MapAssignButton, MapAssignHost, type RosterClass } from "@/components/curriculum-map/assign-button";
import { assignPlaceAction } from "./actions";

export const metadata = { title: "Curriculum Map" };

/**
 * 🧭 Curriculum Map (read only): Grade → Book → Unit → Text Set / Selection (Shared Read, Genre) → Category (skills) → Level.
 * 📥 marks the nodes questions are placed on (Concept Vocabulary; Above/On/Below levels), with their count and “➕ Add question”.
 */
export default async function CurriculumMapPage({ searchParams }: { searchParams: Promise<{ grade?: string; unit?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  // teachers see only the grades they teach
  const myClasses = actor.role === "TEACHER" ? await accessibleClasses(repo, actor) : [];
  const myGradeIds = new Set(myClasses.map((c) => String(c.gradeId)));
  const myLevels = actor.role === "TEACHER" ? new Set((await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => myGradeIds.has(String(g.id))).map((g) => Number(g.level))) : null;
  const wanted = Number(sp.grade) || undefined;
  let v = await curriculumMapView(repo, actor, myLevels && wanted && !myLevels.has(wanted) ? [...myLevels][0] : wanted ?? (myLevels ? [...myLevels].sort()[0] : undefined));
  if (myLevels) {
    if (v.level !== null && !myLevels.has(v.level) && myLevels.size) v = await curriculumMapView(repo, actor, [...myLevels].sort()[0]);
    v = { ...v, grades: v.grades.filter((g) => myLevels.has(g.level)) };
    if (!v.grades.length) v = { ...v, book: null, level: null };
  }
  // the teacher's classes of this grade, with students and levels, for the ⭐ Assign dialog
  const roster: RosterClass[] = actor.role === "TEACHER" && v.level !== null ? await rosterForGrade(repo, actor, v.level) : [];
  const planClassId = roster[0]?.id ?? null;
  // one unit at a time (tabs): smaller pages, faster, easier to read
  const units = v.book?.children ?? [];
  const unitIx = Math.min(Math.max(0, (Number(sp.unit) || 1) - 1), Math.max(0, units.length - 1));
  const canAdd = can(actor, "questions:edit");
  const isTeacher = actor.role === "TEACHER";
  const badge = (n: MapViewNode) => n.acceptsQuestions && (
    <span className="ms-2 inline-flex flex-wrap items-center gap-1.5 text-xs">
{!isTeacher && (<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-300" title={`Accepts questions · ID ${n.code}`}>
        <span aria-hidden="true">📥</span> <code className="font-mono text-[11px] text-emerald-700">{n.code}</code>
      </span>)}
      <Link prefetch={false} href={`/admin/questions?status=PUBLISHED&map=${n.code}`} className="rounded-full px-2 py-0.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal" title="These questions in the Question Bank">{n.questions} question{n.questions === 1 ? "" : "s"}</Link>
      {canAdd && <Link prefetch={false} href={`/admin/curriculum-map/place/${n.code}`} className="rounded-full bg-brand-navy px-2 py-0.5 font-semibold text-white hover:bg-brand-purple" title="One question, or many from a ready template">➕ Add questions</Link>}
      {isTeacher && n.questions > 0 && (
        <>
          <MapAssignButton code={n.code} label="Assign" levels={false} />
          <Link prefetch={false} href={`/admin/questions?status=PUBLISHED&map=${n.code}`} className="rounded-full px-2 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-50" title="Open these questions, star ☆ the ones you want and assign them">☆ Choose questions</Link>
        </>
      )}
    </span>
  );
  const catColor: Record<string, string> = { CONCEPT_VOCABULARY: "border-sky-300 bg-sky-50/50", ANALYZE_CRAFT_AND_STRUCTURE: "border-amber-300 bg-amber-50/50", RESPOND_TO_READING: "border-violet-300 bg-violet-50/50" };
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="🧭" title="Curriculum Map"
        subtitle={isTeacher ? "Choose a unit, then assign a place (⭐), choose single questions (☆) or plan the whole unit (🗂️). Analyze Craft / Respond to Reading are adaptive: 🛟 → Below → On → Above → 🚀." : "Grade → Book → Unit → Text Set / Selection → Category → Level. Questions are placed only on the 📥 places; they are also in the Question Bank."}>
        <Link prefetch={false} href="/admin/questions/import?to=curriculum" className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📥 Import</Link>
        <Link href={`/admin/curriculum-map/bridge?grade=${v.level ?? 5}`} className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 ring-1 ring-indigo-300 hover:bg-indigo-100">🌉 Bridge</Link>
        {isTeacher && <Link href="/teacher/plans" className="rounded-xl bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-900 ring-1 ring-violet-300 hover:bg-violet-200">🗂️ Skill plans</Link>}
      </PageHeader>
      {v.grades.length === 0 ? <p className="mt-6 rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">The Curriculum Map has not been created yet.</p> : (
        <>
          <div className="sticky top-[60px] z-30 -mx-2 rounded-2xl bg-slate-50/95 px-2 py-2 print:static">
          <nav aria-label="Grades" className="flex flex-wrap gap-2">
            {v.grades.map((g) => (
              <Link key={g.level} href={`/admin/curriculum-map?grade=${g.level}`} aria-current={g.level === v.level ? "page" : undefined}
                className={`rounded-full px-5 py-2 font-semibold ${g.level === v.level ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>Grade {g.level}</Link>
            ))}
          </nav>
            {v.book && (<nav aria-label="Units" className="mt-2 flex flex-wrap gap-2">
                {units.map((u, i) => (
                  <Link key={u.id} href={`/admin/curriculum-map?grade=${v.level}&unit=${i + 1}`} prefetch={false} aria-current={i === unitIx ? "page" : undefined}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition ${i === unitIx ? "bg-brand-teal text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{u.title.split(":")[0]}</Link>
                ))}
              </nav>)}
          </div>
          {v.book && (
            <section className="mt-5">
              <p className="text-lg font-bold text-brand-navy">Grade {v.level} · <span aria-hidden="true">📗</span> {v.book.title} <span className="text-sm font-normal text-slate-500">· {v.attachmentNodes} question attachment nodes · {v.questions} questions placed</span></p>

              {units.slice(unitIx, unitIx + 1).map((u) => (
                <details key={u.id} className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200" open>
                  {isTeacher && planClassId && <div className="flex justify-end px-5 pt-3"><Link href={`/teacher/plans?classId=${planClassId}&unit=${unitIx + 1}`} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-violet-700">🗂️ Plan this unit (select all + assign + PDF)</Link></div>}
                  <summary className="cursor-pointer px-5 py-3 text-lg font-bold text-brand-navy">{u.title} <span className="text-sm font-normal text-slate-500">· {u.children.length} {u.children[0]?.kind === "SELECTION" ? "selections" : "text sets"}</span></summary>
                  <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
                    {u.children.map((s) => (
                      <article key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-slate-900">{s.heading}</h3>{s.genre && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{s.genre}</span>}</div>
                        {s.sharedRead && <p className="mt-0.5 text-sm text-slate-500">📖 {s.sharedRead}</p>}
                        <ul className="mt-3 space-y-2">
                          {s.children.map((c) => (
                            <li key={c.id} className={`rounded-lg border-s-4 p-3 ${catColor[c.categoryType ?? ""] ?? ""}`}>
                              <p className="font-semibold text-slate-900">{c.title}{c.skills && <span className="font-normal"> ({c.skills})</span>}{badge(c)}
                                {actor.role === "TEACHER" && c.children.length > 0 && <MapAssignButton code={c.code} label="Assign (adaptive / by level)" levels={true} />}</p>
                              {c.children.length > 0 && (
                                <ul className="mt-2 flex flex-wrap gap-2">
                                  {c.children.map((l) => <li key={l.id} className="rounded-lg bg-white px-2.5 py-1 text-sm ring-1 ring-slate-200">{l.title}{badge(l)}</li>)}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </details>
              ))}
            </section>
          )}
        </>
      )}
      {actor.role === "TEACHER" && <MapAssignHost classes={roster} assign={assignPlaceAction} />}
    </AppShell>
  );
}
