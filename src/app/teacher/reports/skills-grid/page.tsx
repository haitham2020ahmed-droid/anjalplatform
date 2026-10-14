import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReportHeader } from "@/components/report-kit";
import { EmptyState } from "@/components/ui-kit";
import { SkillStar, StarLegend, StarLegendLine } from "@/components/skills/skill-star";
import { MySkillsView } from "@/components/skills/my-skills-view";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { cellDetail, GRID_PLANS, isGridPlan, isStrand, skillsGrid, type CellDetail, type SkillsGrid } from "@/server/skills/skills-grid";
import { skillPage, studentSkillsForTeacher, type SkillPage, type StudentSkillsView } from "@/server/skills/student-skills";
import { MY_SKILLS_TABS, STRANDS, STRAND_LABEL, TAB_ICON, TAB_LABEL, type MySkillsTab } from "@/server/skills/my-skills";
import { safeIfBehind } from "@/server/db/schema-errors";
import { getT } from "@/i18n/server";
import { setStudentSkillGoalAction } from "../../stars-notice-actions";
import { sendSkillsFamilyAction, skillActionAction } from "./actions";
import { TEACHER_WORD, type StarStatus } from "@/lib/skill-stars";

export const metadata = { title: "Student Skills" };

type SP = { classId?: string; plan?: string; weak?: string; student?: string; key?: string; strand?: string; page?: string; view?: string; skill?: string; tab?: string; msg?: string; print?: string };
const day = (v: string | null) => (v ? v.slice(0, 10) : "—");
const tabBtn = (on: boolean) => `inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"}`;

/**
 * ⭐ Reports → Student Skills (owner r68 spec C): three views of the ONE skill status (skills/status.ts) —
 *   Skills Grid (default): students × skills with the star icons; filters class, source (Curriculum · MAP · NAFS ·
 *     Grammar · All …), strand, "skills most of the class hasn't mastered"; under each column "12 of 20 mastered"; a cell
 *     opens its detail; a column opens the Skill page; a name opens the Student view; paginated; Print the class grid.
 *   Skill: four name lists, the most-missed questions, Assign to students not mastered · Create small group · Reteach
 *     to whole class (when 40 %+ struggle).
 *   Student: the student's My Skills read-only + the summary line + Create Plan (prefilled with Learning + Review) +
 *     Print (one colourful page) + Send to the family (through the admin's approval).
 */
export default async function SkillsGridPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const plan = isGridPlan(sp.plan) ? sp.plan : "ALL";
  const strand = isStrand(sp.strand) ? sp.strand : null;
  const view = sp.view === "skill" && sp.skill ? "skill" : sp.view === "student" && sp.student ? "student" : "grid";
  const g = await safeIfBehind("skills-grid", () => skillsGrid(repo, actor, { classId: sp.classId ?? null, plan, weakOnly: sp.weak === "1", strand, page: Number(sp.page) || 1 }), null);
  const base = { classId: g?.classId ?? "", plan, ...(sp.weak === "1" ? { weak: "1" } : {}), ...(strand ? { strand } : {}) };
  const href = (o: Partial<SP>) => `/teacher/reports/skills-grid?${new URLSearchParams(Object.entries({ ...base, ...o }).filter(([, v]) => v) as [string, string][])}`;
  let skill: SkillPage | null = null, student: StudentSkillsView | null = null, detail: CellDetail | null = null;
  const forbidden = (e: unknown) => { if (!(e instanceof ForbiddenError || e instanceof ValidationError)) throw e; return null; };
  if (g?.classId && view === "skill") skill = await skillPage(repo, actor, g.classId, sp.skill!).catch(forbidden);
  if (view === "student") student = await studentSkillsForTeacher(repo, actor, sp.student!).catch(forbidden);
  if (g && view === "grid" && sp.student && sp.key) detail = await cellDetail(repo, actor, sp.student, sp.key).catch(forbidden);
  const tabs = (
    <nav aria-label={t("Student Skills")} className="mb-3 flex flex-wrap gap-2 print:hidden" data-testid="student-skills-tabs">
      <Link prefetch={false} href={href({})} aria-current={view === "grid" ? "page" : undefined} className={tabBtn(view === "grid")}>▦ {t("Skills Grid")}</Link>
      {skill && <span aria-current="page" className={tabBtn(true)}>⭐ {skill.name}</span>}
      {student && <span aria-current="page" className={tabBtn(true)}>👤 <bdi>{student.name}</bdi></span>}
    </nav>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} title="Student Skills" who={g?.className ? <bdi>{g.className}</bdi> : undefined}
        subtitle="Every student × every skill: one star each, the same as on every page." />
      {tabs}
      {sp.msg && <p role="status" className="mb-3 rounded-xl bg-teal-50 px-4 py-2 text-sm text-teal-900 ring-1 ring-teal-200 print:hidden">{t(sp.msg)}</p>}
      {!g ? <EmptyState icon="🛠️" title="The database needs an update" text="Run npx prisma db push, then open this page again." />
        : view === "skill" && skill ? <SkillView p={skill} t={t} back={href({})} />
        : view === "student" && student ? <StudentView v={student} t={t} tab={(MY_SKILLS_TABS as readonly string[]).includes(String(sp.tab)) ? sp.tab as MySkillsTab : student.skills.tab} hrefOf={(k) => href({ view: "student", student: student!.studentId, tab: k })} canSend={actor.role !== "PARENT"} />
        : <GridView g={g} t={t} href={href} plan={plan} strand={strand} detail={detail} teacher={actor.role === "TEACHER"} />}
    </AppShell>
  );
}

type T = (s: string, v?: Record<string, string | number>) => string;

function GridView({ g, t, href, plan, strand, detail, teacher }: { g: SkillsGrid; t: T; href: (o: Partial<SP>) => string; plan: string; strand: string | null; detail: CellDetail | null; teacher: boolean }) {
  const all = g.students.flatMap((s) => g.skills.map((k) => g.cells[s.id]?.[k.key]).filter(Boolean));
  const tiles = [
    { label: "Skills shown", value: g.skills.length },
    { label: "Stars in the class", value: all.filter((v) => v.status === "MASTERED").length },
    { label: "Need support", value: all.filter((v) => v.needsSupport).length },
    { label: "Needs review", value: all.filter((v) => v.status === "NEEDS_REVIEW").length },
  ];
  return (
    <>
      <StarLegend t={t} className="mb-3" />
      <form method="get" action="/teacher/reports/skills-grid" className="mb-3 flex flex-wrap items-end gap-2 text-sm print:hidden" data-testid="grid-filters">
        <label className="flex flex-col font-semibold text-slate-700">{t("Class")}
          <select name="classId" defaultValue={g.classId ?? ""} className="h-10 rounded-lg border border-slate-300 px-2 font-normal">{g.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="flex flex-col font-semibold text-slate-700">{t("Source")}
          <select name="plan" defaultValue={plan} className="h-10 rounded-lg border border-slate-300 px-2 font-normal">{GRID_PLANS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}</select></label>
        <label className="flex flex-col font-semibold text-slate-700">{t("Strand")}
          <select name="strand" defaultValue={strand ?? ""} className="h-10 rounded-lg border border-slate-300 px-2 font-normal"><option value="">{t("All strands")}</option>{STRANDS.map((x) => <option key={x} value={x}>{t(STRAND_LABEL[x])}</option>)}</select></label>
        <label className="inline-flex h-10 items-center gap-2 font-semibold text-slate-700"><input type="checkbox" name="weak" value="1" defaultChecked={g.weakOnly} className="h-4 w-4" />{t("Skills most of the class hasn't mastered")}</label>
        <button className="h-10 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        <span className="ms-auto"><PrintButton label={t("Print the class grid")} /></span>
      </form>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((x) => <p key={x.label} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200"><span className="block text-xl font-bold tabular-nums text-brand-navy" dir="ltr">{x.value}</span><span className="text-xs text-slate-600">{t(x.label)}</span></p>)}
      </div>
      {detail && <Detail d={detail} t={t} close={href({ page: String(g.page ?? 1) })} />}
      {!g.students.length || !g.skills.length ? <EmptyState icon="⭐" title="No skills to show yet" text="Stars appear when students practise skills or when you assign them." /> : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 print:overflow-visible print:ring-0" data-testid="skills-grid">
          <table className="min-w-full text-sm print:text-[9px]">
            <thead>
              <tr className="border-b border-slate-200 align-bottom">
                <th className="sticky start-0 z-10 bg-white px-3 py-2 text-start">{t("Student")}</th>
                <th className="px-2 py-2 text-start text-xs font-semibold text-slate-500 print:hidden">{t("Weekly goal")}</th>
                {g.skills.map((k) => (
                  <th key={k.key} className="px-1 py-2 text-center text-xs font-semibold text-slate-700" title={k.name}>
                    <Link prefetch={false} href={href({ view: "skill", skill: k.key })} className="mx-auto block max-w-[6.5rem] truncate text-brand-navy hover:underline">{k.name}</Link>
                    <span className="block font-normal text-amber-800" data-testid="grid-col-count">{t("{n} of {total} mastered", { n: k.mastered, total: k.total })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.students.map((st) => (
                <tr key={st.id} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="sticky start-0 z-10 bg-white px-3 py-1.5 text-start font-semibold"><Link prefetch={false} href={href({ view: "student", student: st.id })} className="text-brand-navy hover:underline"><bdi>{st.name}</bdi></Link></th>
                  <td className="px-2 py-1.5 text-xs print:hidden">
                    {st.goal ? <span data-testid="grid-goal" className={st.goal.done ? "font-semibold text-emerald-700" : "text-slate-700"} dir="ltr">🎯 {st.goal.mastered}/{st.goal.target}</span>
                      : teacher ? (
                        <form action={setStudentSkillGoalAction} className="flex items-center gap-1"><input type="hidden" name="studentId" value={st.id} />
                          <select name="target" defaultValue="2" aria-label={t("Weekly goal")} className="h-7 rounded border border-slate-300 text-xs">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                          <button className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-navy ring-1 ring-slate-300">{t("Set")}</button></form>
                      ) : <span className="text-slate-400">—</span>}
                  </td>
                  {g.skills.map((k) => {
                    const v = g.cells[st.id][k.key];
                    return (
                      <td key={k.key} className="px-1 py-1.5 text-center" data-status={v.status}>
                        <Link prefetch={false} href={href({ student: st.id, key: k.key, page: String(g.page ?? 1) })} className="inline-flex rounded p-0.5 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-teal" aria-label={`${st.name} · ${k.name}`}>
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
      {(g.pages ?? 1) > 1 && (
        <nav aria-label={t("Pages")} className="mt-3 flex flex-wrap items-center gap-2 text-sm print:hidden" data-testid="grid-pages">
          {Array.from({ length: g.pages ?? 1 }, (_, i) => i + 1).map((n) => <Link key={n} prefetch={false} href={href({ page: String(n) })} aria-current={n === g.page ? "page" : undefined} className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 font-semibold ${n === g.page ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`}>{n}</Link>)}
          <span className="text-slate-500">{t("{n} students", { n: g.totalStudents ?? g.students.length })}</span>
        </nav>
      )}
      <div className="mt-3 hidden print:block"><StarLegendLine t={t} /></div>
    </>
  );
}

function SkillView({ p, t, back }: { p: SkillPage; t: T; back: string }) {
  const btn = "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold";
  const act = (action: string, label: string, tone: string, ask: string) => (
    <form action={skillActionAction} className="inline-flex">
      <input type="hidden" name="classId" value={p.classId} /><input type="hidden" name="key" value={p.key} /><input type="hidden" name="action" value={action} />
      <button className={`${btn} ${tone}`} data-action={action} title={ask}>{t(label)}</button>
    </form>
  );
  return (
    <section data-testid="skill-page" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-brand-navy" data-content lang="en">{p.name}</h2>
        <span className="text-sm text-slate-600">{t("{n} of {total} mastered", { n: p.lists.MASTERED.length, total: p.total })}</span>
        <Link prefetch={false} href={back} className="ms-auto text-sm font-semibold text-brand-teal underline">{t("Back to the grid")}</Link>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        {act("NOT_MASTERED", "Assign to students not mastered", "bg-brand-navy text-white hover:bg-brand-purple", "")}
        {act("SMALL_GROUP", "Create small group", "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal", "")}
        {p.reteach && act("RETEACH", "Reteach to whole class", "bg-orange-600 text-white hover:bg-orange-700", "")}
      </div>
      {p.reteach && <p role="status" className="rounded-xl bg-orange-50 px-4 py-2 text-sm text-orange-900 ring-1 ring-orange-200">{t("{n} of {total} students are struggling with this skill: a whole-class reteach may help.", { n: p.struggling, total: p.total })}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["MASTERED", "LEARNING", "REVIEW", "NOT_STARTED"] as MySkillsTab[]).map((k) => (
          <section key={k} data-list={k} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-navy"><span aria-hidden="true">{TAB_ICON[k]}</span>{t(TAB_LABEL[k])} <span className="rounded-full bg-slate-100 px-1.5 text-xs" dir="ltr">{p.lists[k].length}</span></h3>
            {p.lists[k].length ? <ul className="space-y-1 text-sm">{p.lists[k].map((x) => <li key={x.id} className="flex items-center gap-1.5"><SkillStar info={{ status: x.status }} t={t} label={x.name} size={14} /><bdi>{x.name}</bdi></li>)}</ul> : <p className="text-xs text-slate-400">—</p>}
          </section>
        ))}
      </div>
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h3 className="font-semibold text-brand-navy">{t("Most-missed questions")}</h3>
        {p.missed.length ? (
          <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-sm" data-content lang="en">
            {p.missed.map((q) => <li key={q.id}><span className="text-slate-800">{q.stem || "—"}</span> <span className="text-xs text-rose-700" dir="ltr">✗ {q.wrong}/{q.answered}</span></li>)}
          </ol>
        ) : <p className="mt-1 text-sm text-slate-500">{t("No wrong answers yet.")}</p>}
      </section>
    </section>
  );
}

function StudentView({ v, t, tab, hrefOf, canSend }: { v: StudentSkillsView; t: T; tab: MySkillsTab; hrefOf: (k: MySkillsTab) => string; canSend: boolean }) {
  const btn = "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold";
  return (
    <section data-testid="student-skills-view" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-brand-navy"><bdi>{v.name}</bdi>{v.className ? <span className="ms-2 text-sm font-normal text-slate-500"><bdi>{v.className}</bdi></span> : null}</h2>
        <p className="w-full text-sm text-slate-700" data-testid="student-skills-summary">{t("Summary")}: {v.summary}</p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        {v.planHref && <Link prefetch={false} href={v.planHref} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`} data-testid="create-plan">🗂️ {t("Create Plan")}</Link>}
        <PrintButton label={t("Print (one page)")} />
        {canSend && (
          <form action={sendSkillsFamilyAction} className="inline-flex">
            <input type="hidden" name="studentId" value={v.studentId} /><input type="hidden" name="classId" value={v.classId ?? ""} />
            <button className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`} data-testid="send-family">📨 {t("Send to the family")}</button>
          </form>
        )}
      </div>
      <p className="text-xs text-slate-500 print:hidden">{t("Read only: this is exactly what the student sees in My Skills. Sending to the family goes through the school admin's approval.")}</p>
      <div className="rounded-3xl bg-gradient-to-br from-amber-50 via-white to-sky-50 p-4 ring-1 ring-slate-200 print:p-2">
        <MySkillsView v={v.skills} tab={tab} t={t} hrefOf={hrefOf} readOnly />
      </div>
    </section>
  );
}

function Detail({ d, t, close }: { d: CellDetail; t: T; close: string }) {
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
