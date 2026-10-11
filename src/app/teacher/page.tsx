import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BigTile, TileGroup, EmptyState } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { maybeRunDaily } from "@/server/insights/daily";
import { scanAlerts } from "@/server/insights/alerts";
import { teacherHomeData } from "@/server/teacher/home";
import { goalProgress } from "@/server/admin/school-goals";
import { GoalsTable } from "@/components/home/goals-table";
import { AddStudentButton, ClassSelect, SkillFinder } from "@/components/teacher/home-widgets";
import { AssignSkillHost } from "./assign-dialog";

export const metadata = { title: "Teacher Home" };

/**
 * 🏠 Teacher Home (UI reorg Phase 3), top to bottom — for the selected class only:
 *   class selector · "Hello, [name] — Grade X · N students" + Add Student / Upload Roster / Download Accounts /
 *   Upload MAP Scores · Find a skill and assign it · Needs your attention (≤ 3 cards) · My Class · Programs · Resources.
 * Data: src/server/teacher/home.ts (bounded reads). Every other teacher page stays one click away in the side menu.
 */
export default async function TeacherHome({ searchParams }: { searchParams?: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const sp = (await searchParams) ?? {};
  // the daily learning job and the student-alert scan: in the background, at most once a day / every 3 hours
  await maybeRunDaily(repo, actor.schoolId).catch(() => false);
  if (actor.schoolId) await scanAlerts(repo, actor.schoolId).catch(() => 0);
  const me = (await getActor())!.user;
  const { t } = await getT();
  const h = await teacherHomeData(repo, actor, sp.classId ?? null).catch(() => teacherHomeData(repo, actor, null));
  const k = h.klass;
  const goals = k ? await goalProgress(repo, actor, await repo.findMany("Class", { id: k.id }), new Date()).catch(() => null) : null;
  const q = k ? `?classId=${k.id}` : "";
  const quick = "lift flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  return (
    <AppShell name={String(me.displayName)}>
      {h.classes.length > 1 && k && <div className="mb-4 flex justify-end"><ClassSelect classes={h.classes} value={k.id} /></div>}

      <header className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
          {t("Hello, {name}", { name: String(me.displayName) })}
        </h1>
        <p className="mt-1 text-lg text-slate-600">
          {k ? <><bdi>{k.name}</bdi> · {t("Grade {n}", { n: k.grade })} · {t("{n} students", { n: k.students })}</> : t("You do not teach any class yet.")}
        </p>
        {k && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AddStudentButton classId={k.id} className={k.name} />
            <Link prefetch={false} href={`/teacher/accounts/roster${q}`} className={quick}><span aria-hidden="true">📤</span> {t("Upload Roster")}</Link>
            <Link prefetch={false} href={`/teacher/accounts${q}`} className={quick}><span aria-hidden="true">⬇️</span> {t("Download Accounts")}</Link>
            <Link prefetch={false} href={`/teacher/map-entry${q}`} className={quick}><span aria-hidden="true">🗺️</span> {t("Upload MAP Scores")}</Link>
          </div>
        )}
      </header>

      {k && <SkillFinder classGrade={k.grade} noCurriculum={h.noCurriculum ? h.noCurriculumMessage : null} canAssign={actor.role === "TEACHER"} />}
      {k && <AssignSkillHost classId={k.id} className={k.name} students={h.students} />}

      {k && (
        <section aria-labelledby="attention-h" className="mt-8">
          <h2 id="attention-h" className="mb-3 text-xl font-semibold text-brand-navy"><span aria-hidden="true">🔔</span> {t("Needs your attention")}</h2>
          {h.attention.length === 0 ? <EmptyState compact icon="✅" title="Nothing needs your attention right now" /> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {h.attention.map((a) => (
                <Link key={a.kind} prefetch={false} href={a.href} className="lift flex min-h-24 items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-amber-200 hover:ring-amber-400">
                  <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-50 text-3xl">{a.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-3xl font-semibold tabular-nums text-amber-800" dir="ltr">{a.count}</span>
                    <span className="block font-semibold text-slate-900">{t(a.title)}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <TileGroup title="My Class" icon="👥" cols={4}>
        <BigTile href={k ? `/teacher/classes/${k.id}` : "/teacher/classes"} icon="👥" label="My Students" hint="Class list, accounts and each student’s page" tour="students" />
        <BigTile href={`/teacher/plans${q}`} icon="🗂️" label="Plans" hint="Make any plan and Assign it" tour="plans" />
        <BigTile href={`/teacher/assessments${q}`} icon="📝" label="Assessments" hint="Build a test from skills" tour="assessments" />
        <BigTile href={`/teacher/games${q}`} icon="🏁" label="Live Challenge" hint="The whole class plays together" />
      </TileGroup>
      <TileGroup title="Programs" icon="🧭">
        <BigTile href="/teacher/map-center" icon="🗺️" label="MAP" hint="Scores and results" />
        <BigTile href="/admin/curriculum-map" icon="🧭" label="Curriculum Map" hint="Units and lessons" />
        <BigTile href={`/teacher/rti-plan${q}`} icon="🛟" label="RTI Program" hint="RTI groups and weekly sessions" />
      </TileGroup>
      <TileGroup title="Resources" icon="📚">
        <BigTile href="/admin/questions?status=PUBLISHED" icon="📚" label="Question Bank" hint="All questions by skill" />
        <BigTile href="/admin/grammar" icon="🔤" label="Grammar" hint="Every grade’s grammar skills" />
        <BigTile href={`/teacher/reports${q}`} icon="📊" label="Reports" hint="Every report in one place" />
      </TileGroup>

      {goals && goals.rows.length > 0 && (
        <details className="mt-8 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-lg font-semibold text-brand-navy"><span aria-hidden="true">🎯</span> {t("School goals this week")}</summary>
          <div className="mt-3"><GoalsTable data={goals} /></div>
        </details>
      )}
      {!k && <div className="mt-6"><EmptyState icon="🏫" title="No students in this class yet" text="Ask the school admin to add your class." action={{ href: "/guide", label: "Help" }} /></div>}
    </AppShell>
  );
}
