import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { maybeRunDaily } from "@/server/insights/daily";
import { scanAlerts } from "@/server/insights/alerts";
import { teacherHomeData } from "@/server/teacher/home";
import { AddStudentButton, SkillFinder } from "@/components/teacher/home-widgets";
import { AssignHostAll } from "./assign-host-all";
import { teacherHomeSummary, type TeacherHomeSummary } from "@/server/teacher/needs-attention";
import { writingToGrade } from "@/server/writing/locked";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";

export const metadata = { title: "Teacher Home" };

/**
 * 🏠 Teacher Home — what needs doing today, nothing else. No page tiles or quick links: every page lives in ONE place,
 * the side menu (Update 15). At a glance (my students · work sent this week · needs attention · writing to grade, as
 * numbers), the Needs Attention list (no practice in 7+ days; stuck on a skill = 15+ questions and a score under 50),
 * Add Student and Find a skill. Data: src/server/teacher/needs-attention.ts (own classes only, bounded).
 */
export default async function TeacherHome({ searchParams }: { searchParams?: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const sp = (await searchParams) ?? {};
  // the daily learning job and the student-alert scan: in the background, at most once a day / every 3 hours
  await maybeRunDaily(repo, actor.schoolId).catch(() => false);
  if (actor.schoolId) await scanAlerts(repo, actor.schoolId).catch(() => 0);
  const me = (await getActor())!.user;
  const { t } = await getT();
  const [h, sum, toGrade] = await Promise.all([
    teacherHomeData(repo, actor, sp.classId ?? null).catch(() => teacherHomeData(repo, actor, null)),
    teacherHomeSummary(repo, actor).catch(() => ({ students: 0, workThisWeek: 0, needsAttention: 0, list: [] as TeacherHomeSummary["list"] })),
    writingToGrade(repo, actor).catch(() => 0),
  ]);
  const k = h.klass;
  const cards: { label: string; value: number; line: LineIconName; alert?: boolean }[] = [
    { label: "My students", value: sum.students, line: "users" },
    { label: "Work sent this week", value: sum.workThisWeek, line: "send" },
    { label: "Needs attention", value: sum.needsAttention, line: "alert", alert: sum.needsAttention > 0 },
    { label: "Writing to grade", value: toGrade, line: "pen" },
  ];
  return (
    <AppShell name={String(me.displayName)}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-medium text-slate-500">{t("Hello, {name}", { name: String(me.displayName) })}</p>
          <h1 className="mt-0.5 text-[28px] font-semibold tracking-tight text-brand-navy">{t("Home")}</h1>
          {k && <p className="mt-1 text-sm text-slate-500"><bdi>{k.name}</bdi> · {t("Grade {n}", { n: k.grade })}</p>}
        </div>
        {k && <div className="w-full sm:w-44"><AddStudentButton classId={k.id} className={k.name} /></div>}
      </header>

      <section aria-label={t("At a glance")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <span className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">{t(c.label)}</span>
                <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ${c.alert ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-slate-50 text-slate-500 ring-slate-200"}`}><LineIcon name={c.line} className="h-4 w-4" /></span>
              </span>
              <span dir="ltr" className={`mt-2 block text-3xl font-semibold tabular-nums tracking-tight ${c.alert ? "text-rose-700" : "text-brand-navy"}`}>{c.value}</span>
            </>
          );
          // the numbers are not links to pages (the menu has them); "Needs attention" jumps to its list below
          return c.alert
            ? <a key={c.label} href="#needs-attention" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-rose-200 hover:ring-rose-300">{body}</a>
            : <div key={c.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">{body}</div>;
        })}
      </section>

      <section id="needs-attention" aria-labelledby="na-h" className="group/na mt-6 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <h2 id="na-h" className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-base font-semibold text-brand-navy"><LineIcon name="alert" className="h-5 w-5 text-rose-600" />{t("Needs attention")}</h2>
        <p className="px-4 pt-2 text-xs text-slate-500">{t("No practice for 7 days or more · stuck on a skill (15+ questions and a score under 50).")}</p>
        {sum.list.length === 0 ? <p className="p-4 text-sm text-slate-600">{t("Everyone is on track.")}</p> : (
          <ul className="divide-y divide-slate-100">
            {sum.list.slice(0, 30).map((r, ix) => (
              <li key={r.studentId} className={`${ix > 5 ? "hidden group-has-[:checked]/na:flex" : "flex"} flex-wrap items-center justify-between gap-2 px-4 py-2.5`}>
                <div className="min-w-0">
                  <Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link>
                  <span className="ms-2 text-xs text-slate-500"><bdi>{r.className}</bdi></span>
                  <p className="text-sm text-slate-600">
                    {r.stuck.length > 0 && <span title={r.stuck.map((k) => `${k.skill} (${k.questions}, ${k.score}%)`).join(" · ")}>{t("Stuck on")}: {r.stuck[0].skill} <span className="text-slate-400">({r.stuck[0].score}%)</span>{r.stuck.length > 1 && <span className="ms-1 rounded-full bg-slate-100 px-2 text-xs text-slate-600">{t("+{n} more", { n: r.stuck.length - 1 })}</span>}</span>}
                    {r.stuck.length === 0 && <span>{r.neverPractised ? t("Has not practised yet") : t("No practice for {n} days", { n: r.idleDays ?? 0 })}</span>}
                  </p>
                </div>
                {r.stuck.length > 0
                  ? <Link prefetch={false} href={`/teacher/plans?${new URLSearchParams([["tab", "custom"], ["classId", r.classId], ["who", "student"], ["sid", r.studentId], ...r.stuck.map((k) => ["add", k.skillId] as [string, string])])}`} className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t("Create Plan")}</Link>
                  : <Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t("Open")}</Link>}
              </li>
            ))}
          </ul>
        )}
        {sum.list.length > 6 && <p className="border-t border-slate-100 px-4 py-2"><label className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand-teal"><input type="checkbox" className="peer sr-only" data-na-toggle /> <span className="group-has-[:checked]/na:hidden">{t("Show all ({n})", { n: Math.min(30, sum.list.length) })}</span><span className="hidden group-has-[:checked]/na:inline">{t("Show fewer")}</span></label></p>}
        {sum.list.length > 30 && <p className="px-4 pb-2 text-sm text-slate-600">{t("… and {n} more", { n: sum.list.length - 30 })}</p>}
      </section>



      {k && <div className="mt-5"><SkillFinder classGrade={k.grade} noCurriculum={h.noCurriculum ? h.noCurriculumMessage : null} canAssign={actor.role === "TEACHER"} /></div>}
      {k && <AssignHostAll classId={k.id} className={k.name} students={h.students} />}
      {!k && <div className="mt-6"><EmptyState icon="🏫" title="No students in this class yet" text="Ask the school admin to add your class." action={{ href: "/guide", label: "Help" }} /></div>}
    </AppShell>
  );
}
