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

export const metadata = { title: "Teacher Home" };

/**
 * 🏠 Teacher Home — no reports here (they are all in Reports). Three small cards (my students · work sent this week ·
 * needs attention), the Needs Attention list (no practice in 7+ days; stuck on a skill = 15+ questions and a score
 * under 50) and quick buttons. Data: src/server/teacher/needs-attention.ts (own classes only, bounded).
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
  const q = k ? `?classId=${k.id}` : "";
  const card = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal";
  const quick = "flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-navy shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal";
  const cards = [
    { label: "My students", value: sum.students, href: "/teacher/students", icon: "👥" },
    { label: "Work sent this week", value: sum.workThisWeek, href: "/teacher/assignments", icon: "📤" },
    { label: "Needs attention", value: sum.needsAttention, href: "#needs-attention", icon: "🚨", alert: sum.needsAttention > 0 },
    { label: "Writing to grade", value: toGrade, href: `/teacher/writing${q}`, icon: "✍️" },
  ];
  const quickLinks: [string, string, string][] = [
    ["🗂️", "New Plan", `/teacher/plans${q}`],
    ["📝", "New Test", `/teacher/assessments${q}`],
    ["🧭", "Curriculum Map", "/admin/curriculum-map"],
    ["🗺️", "MAP", `/teacher/map-center${q}`],
    ["🛟", "Support plan", `/teacher/plans/support${q}`],
    ["🏁", "Live Challenge", `/teacher/games${q}`],
    ["📅", "My Week", `/teacher/week${q}`],
    ["📨", "Messages", "/teacher/messages"],
    ["⬇️", "Download Accounts", `/teacher/accounts${q}`],
    ["📥", "Upload MAP Scores", `/teacher/map-entry${q}`],
  ];
  return (
    <AppShell name={String(me.displayName)}>
      <header className="mb-4">
        <p className="text-sm text-slate-500">{t("Hello, {name}", { name: String(me.displayName) })}</p>
        <h1 className="text-3xl font-semibold text-brand-navy">{t("Home")}</h1>
      </header>

      <section aria-label={t("At a glance")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} prefetch={false} href={c.href} className={card}>
            <span className="flex items-center justify-between"><span dir="ltr" className={`text-3xl font-semibold tabular-nums ${c.alert ? "text-red-700" : "text-brand-navy"}`}>{c.value}</span><span aria-hidden="true" className="text-xl">{c.icon}</span></span>
            <span className="mt-1 block text-sm font-semibold text-slate-600">{t(c.label)}</span>
          </Link>
        ))}
      </section>

      <section aria-label={t("Quick actions")} className="mt-5">
        <h2 className="mb-2 text-lg font-semibold text-brand-navy">{t("Quick actions")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {k && <AddStudentButton classId={k.id} className={k.name} />}
          {quickLinks.map(([icon, label, href]) => <Link key={label} prefetch={false} href={href} className={quick}><span aria-hidden="true">{icon}</span>{t(label)}</Link>)}
        </div>
      </section>

      <section id="needs-attention" aria-labelledby="na-h" className="group/na mt-5 rounded-2xl bg-white shadow-card ring-1 ring-slate-200/70">
        <h2 id="na-h" className="border-b px-4 py-3 text-lg font-semibold text-brand-navy">🚨 {t("Needs attention")}</h2>
        <p className="px-4 pt-2 text-xs text-slate-500">{t("No practice for 7 days or more · stuck on a skill (15+ questions and a score under 50).")}</p>
        {sum.list.length === 0 ? <p className="p-4 text-sm text-slate-600">🟢 {t("Everyone is on track.")}</p> : (
          <ul className="divide-y divide-slate-100">
            {sum.list.slice(0, 30).map((r, ix) => (
              <li key={r.studentId} className={`${ix > 5 ? "hidden group-has-[:checked]/na:flex" : "flex"} flex-wrap items-center justify-between gap-2 px-4 py-2.5`}>
                <div className="min-w-0">
                  <Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link>
                  <span className="ms-2 text-xs text-slate-500"><bdi>{r.className}</bdi></span>
                  <p className="text-sm text-slate-600">
                    {r.stuck.length > 0 && <span title={r.stuck.map((k) => `${k.skill} (${k.questions}, ${k.score}%)`).join(" · ")}>🧩 {t("Stuck on")}: {r.stuck[0].skill} <span className="text-slate-400">({r.stuck[0].score}%)</span>{r.stuck.length > 1 && <span className="ms-1 rounded-full bg-slate-100 px-2 text-xs text-slate-600">{t("+{n} more", { n: r.stuck.length - 1 })}</span>}</span>}
                    {r.stuck.length === 0 && <span>⏰ {r.neverPractised ? t("Has not practised yet") : t("No practice for {n} days", { n: r.idleDays ?? 0 })}</span>}
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
