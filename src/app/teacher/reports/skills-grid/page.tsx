import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReportHeader } from "@/components/report-kit";
import { EmptyState } from "@/components/ui-kit";
import { SkillStar, StarLegend } from "@/components/skills/skill-star";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { cellDetail, GRID_PLANS, isGridPlan, skillsGrid, type CellDetail } from "@/server/skills/skills-grid";
import { safeIfBehind } from "@/server/db/schema-errors";
import { getT } from "@/i18n/server";
import { setStudentSkillGoalAction } from "../../stars-notice-actions";
import { TEACHER_WORD, type StarStatus } from "@/lib/skill-stars";

export const metadata = { title: "Skills grid" };

type SP = { classId?: string; plan?: string; weak?: string; student?: string; key?: string };
const day = (v: string | null) => (v ? v.slice(0, 10) : "—");

/**
 * ⭐ Reports → Skills grid: students × skills with the five star icons (the ONE status of each skill, skills/status.ts).
 * Filter by class, by plan (MAP plan · Curriculum · Year plan · custom) and "skills most of the class hasn't mastered";
 * a cell opens its detail (dates, questions, accuracy, reviews, self-check). Each student's weekly goal is a column.
 */
export default async function SkillsGridPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const plan = isGridPlan(sp.plan) ? sp.plan : "ALL";
  const g = await safeIfBehind("skills-grid", () => skillsGrid(repo, actor, { classId: sp.classId ?? null, plan, weakOnly: sp.weak === "1" }), null);
  let detail: CellDetail | null = null;
  if (g && sp.student && sp.key) { try { detail = await cellDetail(repo, actor, sp.student, sp.key); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; } }
  const href = (o: Partial<SP>) => `/teacher/reports/skills-grid?${new URLSearchParams(Object.entries({ classId: g?.classId ?? "", plan, ...(sp.weak === "1" ? { weak: "1" } : {}), ...o }).filter(([, v]) => v) as [string, string][])}`;
  const all = g ? g.students.flatMap((s) => g.skills.map((k) => g.cells[s.id][k.key])) : [];
  const tiles = [
    { label: "Skills shown", value: g?.skills.length ?? 0 },
    { label: "Stars in the class", value: all.filter((v) => v.status === "MASTERED").length },
    { label: "Need support", value: all.filter((v) => v.needsSupport).length },
    { label: "Needs review", value: all.filter((v) => v.status === "NEEDS_REVIEW").length },
  ];
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} title="Skills grid" who={g?.className ? <bdi>{g.className}</bdi> : undefined}
        subtitle="Every student × every skill: one star each, the same as on every page." />
      <StarLegend t={t} className="mb-3" />
      {!g ? <EmptyState icon="🛠️" title="The database needs an update" text="Run npx prisma db push, then open this page again." /> : (
        <>
          <form method="get" action="/teacher/reports/skills-grid" className="mb-3 flex flex-wrap items-end gap-2 text-sm" data-testid="grid-filters">
            <label className="flex flex-col font-semibold text-slate-700">{t("Class")}
              <select name="classId" defaultValue={g.classId ?? ""} className="h-10 rounded-lg border border-slate-300 px-2 font-normal">{g.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="flex flex-col font-semibold text-slate-700">{t("Plan")}
              <select name="plan" defaultValue={plan} className="h-10 rounded-lg border border-slate-300 px-2 font-normal">{GRID_PLANS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}</select></label>
            <label className="inline-flex h-10 items-center gap-2 font-semibold text-slate-700"><input type="checkbox" name="weak" value="1" defaultChecked={g.weakOnly} className="h-4 w-4" />{t("Skills most of the class hasn't mastered")}</label>
            <button className="h-10 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
          </form>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiles.map((x) => <p key={x.label} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200"><span className="block text-xl font-bold tabular-nums text-brand-navy" dir="ltr">{x.value}</span><span className="text-xs text-slate-600">{t(x.label)}</span></p>)}
          </div>
          {detail && <Detail d={detail} t={t} close={href({})} />}
          {!g.students.length || !g.skills.length ? <EmptyState icon="⭐" title="No skills to show yet" text="Stars appear when students practise skills or when you assign them." /> : (
            <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200" data-testid="skills-grid">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 align-bottom">
                    <th className="sticky start-0 z-10 bg-white px-3 py-2 text-start">{t("Student")}</th>
                    <th className="px-2 py-2 text-start text-xs font-semibold text-slate-500">{t("Weekly goal")}</th>
                    {g.skills.map((k) => (
                      <th key={k.key} className="px-1 py-2 text-center text-xs font-semibold text-slate-700" title={k.name}>
                        <span className="mx-auto block max-w-[6.5rem] truncate">{k.name}</span>
                        <span className="block font-normal text-amber-800" dir="ltr">⭐ {k.mastered}/{k.total}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.students.map((st) => (
                    <tr key={st.id} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className="sticky start-0 z-10 bg-white px-3 py-1.5 text-start font-semibold"><Link prefetch={false} href={`/teacher/students/${st.id}`} className="text-brand-navy hover:underline"><bdi>{st.name}</bdi></Link></th>
                      <td className="px-2 py-1.5 text-xs">
                        {st.goal ? <span data-testid="grid-goal" className={st.goal.done ? "font-semibold text-emerald-700" : "text-slate-700"} dir="ltr">🎯 {st.goal.mastered}/{st.goal.target}</span>
                          : actor.role === "TEACHER" ? (
                            <form action={setStudentSkillGoalAction} className="flex items-center gap-1"><input type="hidden" name="studentId" value={st.id} />
                              <select name="target" defaultValue="2" aria-label={t("Weekly goal")} className="h-7 rounded border border-slate-300 text-xs">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                              <button className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-navy ring-1 ring-slate-300">{t("Set")}</button></form>
                          ) : <span className="text-slate-400">—</span>}
                      </td>
                      {g.skills.map((k) => {
                        const v = g.cells[st.id][k.key];
                        return (
                          <td key={k.key} className="px-1 py-1.5 text-center" data-status={v.status}>
                            <Link prefetch={false} href={href({ student: st.id, key: k.key })} className="inline-flex rounded p-0.5 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-teal" aria-label={`${st.name} · ${k.name}`}>
                              <SkillStar info={v} t={t} label={`${st.name} · ${k.name}`} inLink />
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function Detail({ d, t, close }: { d: CellDetail; t: (s: string, v?: Record<string, string | number>) => string; close: string }) {
  const v = d.view;
  return (
    <section data-testid="cell-detail" aria-label={t("Skill detail")} className="mb-3 rounded-2xl bg-white p-4 ring-1 ring-brand-teal">
      <div className="flex flex-wrap items-center gap-2">
        <SkillStar info={v} t={t} label={d.skill} size={20} />
        <h2 className="text-lg font-bold text-brand-navy"><bdi>{d.student}</bdi> · {d.skill}</h2>
        <Link prefetch={false} href={close} className="ms-auto text-sm font-semibold text-brand-teal underline">{t("Close")}</Link>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">{t("Questions")}</dt><dd className="font-semibold" dir="ltr">{v.answered}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Accuracy")}</dt><dd className="font-semibold" dir="ltr">{d.accuracy === null ? "—" : `${d.accuracy}%`}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Mastery")}</dt><dd className="font-semibold" dir="ltr">{v.score}%</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Started")}</dt><dd className="font-semibold" dir="ltr">{day(v.startedAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Mastered")}</dt><dd className="font-semibold" dir="ltr">{day(v.masteredAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Review check")}</dt><dd className="font-semibold" dir="ltr">{day(v.reviewDueAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Self-check")}</dt><dd className="font-semibold">{v.selfCheck === "HAPPY" ? "😊" : v.selfCheck === "OK" ? "😐" : v.selfCheck === "UNSURE" ? "😟" : "—"}{d.mismatch && <span data-testid="self-mismatch" className="ms-1 rounded-full bg-rose-50 px-2 text-xs text-rose-800 ring-1 ring-rose-200">{t(d.mismatch)}</span>}</dd></div>
        <div><dt className="text-xs text-slate-500">{t("Level")}</dt><dd className="font-semibold" dir="ltr">{v.level}</dd></div>
      </dl>
      {d.reviews.length > 0 && <p className="mt-2 text-sm text-slate-700">{t("Reviews")}: {d.reviews.map((r) => `${day(r.at)} ${r.outcome === "PASS" ? "✓" : r.outcome === "FAIL" ? "🔄" : r.outcome === "GUESSING" ? t("not counted") : t("missed in the mixed review")}${r.of ? ` (${r.right}/${r.of})` : ""}`).join(" · ")}</p>}
      {d.history.length > 0 && <p className="mt-1 text-xs text-slate-500">{d.history.map((h) => `${day(h.at)} ${t(TEACHER_WORD[h.status as StarStatus] ?? h.status)}`).join(" → ")}</p>}
    </section>
  );
}
