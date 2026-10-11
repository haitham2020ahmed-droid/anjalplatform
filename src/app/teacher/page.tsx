import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BigTile, TileGroup, EmptyState, PageHero, BTN_PRIMARY } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { maybeRunDaily } from "@/server/insights/daily";
import { scanAlerts } from "@/server/insights/alerts";
import { teacherHomeData } from "@/server/teacher/home";
import { goalProgress } from "@/server/admin/school-goals";
import { GoalsTable } from "@/components/home/goals-table";
import { AddStudentButton, ClassSelect, SkillFinder } from "@/components/teacher/home-widgets";
import { AssignSkillHost } from "./assign-dialog";
import { classToday } from "@/server/teacher/my-week";

export const metadata = { title: "Teacher Home" };

/**
 * 🏠 Teacher Home — one goal: "Your class today". Top to bottom, for the selected class only:
 *   class selector · Your class today (class, grade, students) with three big numbers (worked today · need help ·
 *   not started; each opens its list) and ONE primary button (My Week) · Find a skill and assign it (SkillFinder) ·
 *   four quick links (My Students, Plans, Assessments, Live Challenge) · class accounts and scores (folded) ·
 *   school goals (folded). Everything else is in the side menu.
 * Data: src/server/teacher/home.ts and src/server/teacher/my-week.ts (bounded reads, own classes only).
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
  const [today, goals] = k ? await Promise.all([
    classToday(repo, actor, k.id).catch(() => null),
    goalProgress(repo, actor, await repo.findMany("Class", { id: k.id }), new Date()).catch(() => null),
  ]) : [null, null];
  const q = k ? `?classId=${k.id}` : "";
  const tests = h.attention.find((a) => a.kind === "tests");
  const quick = "lift flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-semibold text-brand-navy shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal";
  const big = [
    { key: "done", label: "Worked today", value: today?.doneToday ?? 0, href: k ? `/teacher/progress${q}` : "/teacher/students", tone: "text-emerald-700", dot: "bg-emerald-400", icon: "✅" },
    { key: "help", label: "Need help", value: today?.needHelp ?? 0, href: k ? `/teacher/intervention${q}` : "/teacher/intervention", tone: "text-orange-700", dot: "bg-orange-400", icon: "🤝" },
    { key: "not", label: "Not started", value: today?.notStarted ?? 0, href: k ? `/teacher/attention?kind=not-started&classId=${k.id}` : "/teacher/students", tone: "text-sky-700", dot: "bg-sky-400", icon: "⏳" },
  ];
  return (
    <AppShell name={String(me.displayName)}>
      {h.classes.length > 1 && k && <div className="mb-4 flex justify-end"><ClassSelect classes={h.classes} value={k.id} /></div>}

      <PageHero tone="teacher" eyebrow={t("Hello, {name}", { name: String(me.displayName) })} title={t("Your class today")}
        subtitle={k ? <><bdi>{k.name}</bdi> · {t("Grade {n}", { n: k.grade })} · {t("{n} students", { n: k.students })}</> : t("You do not teach any class yet.")}
        actions={k ? <Link prefetch={false} href={`/teacher/week${q}`} className={`${BTN_PRIMARY} min-h-12 rounded-2xl px-6`}>{t("Open My Week")}</Link> : null}>
        {k && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {big.map((b) => (
                <Link key={b.key} prefetch={false} href={b.href} className="hero-tile lift flex min-h-28 flex-col justify-center rounded-2xl px-5 py-4">
                  <span className="flex items-center justify-between gap-2">
                    <span dir="ltr" className={`text-5xl font-semibold tabular-nums ${b.tone}`}>{b.value}</span>
                    <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-white text-xl shadow-sm">{b.icon}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 font-semibold text-slate-700"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${b.dot}`} />{t(b.label)}</span>
                </Link>
              ))}
            </div>
            {tests && <p className="mt-3"><Link prefetch={false} href={tests.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-teal underline">{t("Tests with new results")}: {tests.count}</Link></p>}
          </>
        )}
      </PageHero>

      {k && <SkillFinder classGrade={k.grade} noCurriculum={h.noCurriculum ? h.noCurriculumMessage : null} canAssign={actor.role === "TEACHER"} />}
      {k && <AssignSkillHost classId={k.id} className={k.name} students={h.students} />}

      <TileGroup title="My Class" tone="sky" cols={4}>
        <BigTile href="/teacher/students" icon="👥" label="My Students" hint="Class list, accounts and each student’s page" tour="students" tone="sky" />
        <BigTile href={`/teacher/plans${q}`} icon="🗂️" label="Plans" hint="NAFS and custom plans, and all plans sent" tour="plans" tone="violet" />
        <BigTile href={`/teacher/assessments${q}`} icon="📝" label="Assessments" hint="Build a test from skills" tour="assessments" tone="sun" />
        <BigTile href={`/teacher/games${q}`} icon="🏁" label="Live Challenge" hint="The whole class plays together" tone="rose" />
      </TileGroup>

      {k && (
        <details className="mt-8 rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-200/80 sm:px-6">
          <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold text-brand-navy">{t("Class accounts and scores")}</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AddStudentButton classId={k.id} className={k.name} />
            <Link prefetch={false} href={`/teacher/accounts/roster${q}`} className={quick}>{t("Upload Roster")}</Link>
            <Link prefetch={false} href={`/teacher/accounts${q}`} className={quick}>{t("Download Accounts")}</Link>
            <Link prefetch={false} href={`/teacher/map-entry${q}`} className={quick}>{t("Upload MAP Scores")}</Link>
          </div>
        </details>
      )}

      {goals && goals.rows.length > 0 && (
        <details className="mt-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-slate-200/80 sm:px-6">
          <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold text-brand-navy">{t("School goals this week")}</summary>
          <div className="mt-3"><GoalsTable data={goals} /></div>
        </details>
      )}
      {!k && <div className="mt-6"><EmptyState icon="🏫" title="No students in this class yet" text="Ask the school admin to add your class." action={{ href: "/guide", label: "Help" }} /></div>}
    </AppShell>
  );
}
