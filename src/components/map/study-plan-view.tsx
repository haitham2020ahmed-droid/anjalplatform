import type { StudyArea, StudyPlanDoc } from "@/server/map/map-reports";
import Link from "next/link";
import { ReportHead, ReportPage, ordinal } from "./report-ui";
import { SkillStar, StarLegend, StarLegendLine } from "@/components/skills/skill-star";
import { StarAssign } from "@/components/assign/star-assign";
import { groupStagesBySkill, planStarCount, type SkillGroup } from "@/lib/plan-groups";
import { planHref } from "@/lib/plan-links";
import { PlanA, PlanLinksNote, PlanQr } from "@/components/plans/plan-links";
import { assignStudyPlanAction } from "@/app/map-report/actions";
import { SourceSelect } from "@/components/assign/source-select";

type T = (text: string, vars?: Record<string, string | number>) => string;
const same: T = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : text);
const subjectName = (s: string) => (s === "READING" ? "Reading" : "Language Usage");
const STAGE_STYLE = {
  DEVELOP: { bar: "bg-brand-teal", text: "text-brand-teal", note: "Ready to learn now: the student's own RIT band. Most of the practice goes here." },
  REINFORCE: { bar: "bg-amber-400", text: "text-amber-700", note: "From the band below (no longer listed in the student's band): these should be secure — practise the ones not mastered yet." },
  INTRODUCE: { bar: "bg-brand-purple", text: "text-brand-purple", note: "New in the band above: the next step once Develop is going well." },
} as const;

/** ☆ quick-assign on the teacher's plan: the class, its open star assignments (skill id → assignment id), the default due date. */
export interface PlanStarAssign { classId: string; assigned: Record<string, string>; defaultDue: string; track?: string }

/**
 * 🧭 A student's Personal Study Plan: a cover with the RIT of every goal area, then one section per goal area, GROUPED
 * BY SKILL (owner r67): each skill once with its star (the ONE status, skills/status.ts), one Practise button (student)
 * or the ☆ quick-assign (teacher), the MAP statements it covers folded, standard codes small.
 */
export function StudyPlanView({ d, first = true, link = false, hub = false, t = same, star, canAssign = false }: { d: StudyPlanDoc; first?: boolean; link?: boolean; hub?: boolean; t?: T; star?: PlanStarAssign; /** the teacher may Assign ticked skills to this one student (owner: Personal plans need an Assign button too, like Group / Whole-class) */ canAssign?: boolean }) {
  const who = link ? "student" : "teacher";
  // r68: the whole plan's count (the same in the Full and the Short version)
  const count = d.counts ?? planStarCount(d.areas);
  const assign = hub && canAssign && Boolean(d.student.classId);
  const body = (
    <>
      <ReportPage first={first} className="overflow-hidden !p-0">
        <div className="bg-gradient-to-br bg-linear-to-br from-brand-navy via-brand-navy to-brand-teal px-10 pb-12 pt-10 text-white print:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-200">{d.student.school}</p>
          <h1 className="mt-10 text-4xl font-black leading-tight">{d.student.name}&apos;s<br />{t("Personal Study Plan")}</h1>
          <p className="mt-2 text-2xl font-light">MAP Growth · {t(subjectName(d.subject))}</p>
          <p className="mt-6 text-sm text-teal-100">{d.term ?? t("No MAP term yet")} · {t("Grade {n}", { n: d.student.grade })}{d.student.className ? ` · ${d.student.className}` : ""}{d.student.number ? ` · ID ${d.student.number}` : ""}</p>
        </div>
        <div className="p-8 print:px-10">
          {d.overall ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label={t("Overall RIT")} value={String(d.overall.rit)} sub={d.overall.percentile !== null ? `${ordinal(d.overall.percentile)} percentile · ${d.overall.descriptor}` : ""} />
              <Tile label={t("Spring goal")} value={d.overall.projection ? String(d.overall.projection) : "—"} sub={d.overall.projection ? `+${d.overall.projection - d.overall.rit} RIT to grow` : t("from the Fall test")} />
              <Tile label={t("Skills")} value={`${count.mastered} / ${count.total}`} sub={t("{n} of {total} skills mastered", { n: count.mastered, total: count.total })} testId="plan-skills-mastered" />
            </div>
          ) : <p className="text-slate-600">{t("No MAP score yet.")}</p>}
          <h2 className="mt-6 text-lg font-bold text-brand-navy">{t("Goal areas — weakest first")}</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2">{t("Goal area")}</th><th>RIT</th><th>{t("Ready to learn")}</th><th>{t("Skills mastered")}</th></tr></thead>
            <tbody>{d.areas.map((a) => (
              <tr key={a.group} className="border-b last:border-0">
                <td className="py-2 font-semibold text-slate-800">{a.icon} {t(a.name)}{a.focus && <span className="ms-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800">{t("focus")}</span>}</td>
                <td className="tabular-nums">{a.rit ?? "—"}{a.rit !== null && !a.fromGoal && <span className="text-xs text-slate-400" title={t("No goal-area score: the overall RIT is used")}> *</span>}</td>
                <td>{a.stages.find((x) => x.key === "DEVELOP")?.range ?? "—"}</td>
                <td className="tabular-nums">{a.skillsLinked ? `${a.skillsMastered} / ${a.skillsLinked}` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          {d.areas.some((a) => a.rit !== null && !a.fromGoal) && <p className="mt-2 text-xs text-slate-500">* {t("No goal-area score in the MAP file: the overall RIT is used for this area.")}</p>}
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
            <p className="font-bold text-brand-navy">{t("How to use this plan")}</p>
            <ol className="mt-1 list-decimal space-y-0.5 ps-5">
              <li><b>{t("Develop")}</b> — {t("ready to learn now. Start here, focus areas first.")}</li>
              {d.source === "CONTINUUM" && <li><b>{t("Reinforce")}</b> — {t("the band below: practise the skills not mastered yet.")}</li>}
              {d.source === "CONTINUUM" && <li><b>{t("Introduce")}</b> — {t("the band above: the next step.")}</li>}
              <li>{t("Each skill is listed once with its star; open it to see the MAP statements it covers.")}</li>
            </ol>
            <div className="mt-2"><StarLegend who={who} t={t} /></div>
            <PlanLinksNote t={t} className="mt-2" />
          </div>
        </div>
      </ReportPage>
      {d.areas.filter((a) => a.stages.length).map((a) => <AreaPage key={a.group} a={a} d={d} link={link} hub={hub} t={t} star={star} canAssign={assign} />)}
      {assign && <AssignBar d={d} t={t} />}
    </>
  );
  if (!assign) return body;
  return (
    <form action={assignStudyPlanAction}>
      <input type="hidden" name="studentId" value={d.student.id} />
      <input type="hidden" name="classId" value={d.student.classId ?? ""} />
      <input type="hidden" name="subject" value={d.subject} />
      {body}
    </form>
  );
}

/** 📤 The Assign bar at the end of the plan: ticked skills (every row above), a due date, Source → Assign. */
function AssignBar({ d, t }: { d: StudyPlanDoc; t: T }) {
  return (
    <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-end gap-3 rounded-2xl bg-amber-50 p-4 text-sm ring-1 ring-amber-200 print:hidden">
      <label>{t("Start")} <input type="date" name="startAt" className="mt-1 block rounded-md border border-slate-300 px-2 py-1" /></label>
      <label>{t("Due")} <input type="date" name="dueAt" className="mt-1 block rounded-md border border-slate-300 px-2 py-1" /></label>
      <SourceSelect t={t} field="mt-1 block rounded-md border border-slate-300 px-2 py-1 font-normal" className="!text-xs" />
      <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">📤 {t("Assign ticked skills")}</button>
      <span className="text-xs text-slate-500">{t("Ticked skills become one assignment each, for {name}: the questions adjust to their level.", { name: d.student.name })}</span>
    </div>
  );
}

function Tile({ label, value, sub, testId }: { label: string; value: string; sub: string; testId?: string }) {
  return <div data-testid={testId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="text-3xl font-black text-brand-navy tabular-nums">{value}</p><p className="text-xs text-slate-600">{sub}</p></div>;
}

function AreaPage({ a, d, link, hub, t, star, canAssign = false }: { a: StudyArea; d: StudyPlanDoc; link: boolean; hub: boolean; t: T; star?: PlanStarAssign; canAssign?: boolean }) {
  const stages = groupStagesBySkill(a.stages);
  return (
    <ReportPage>
      <ReportHead s={d.student} title={`${t("Personal Study Plan")} · ${t(subjectName(d.subject))}`} term={d.term} />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="flex items-center gap-3 text-3xl font-black text-brand-navy">{a.icon} {t(a.name)}<PlanQr href={planHref({ kind: "study-plan", studentId: d.student.id, subject: d.subject === "LANGUAGE" ? "LANGUAGE" : "READING" }, hub ? "staff" : link ? "student" : "family")} size={48} /></h2>
        <p className="text-sm text-slate-600">RIT <b className="text-lg text-brand-navy">{a.rit}</b>{a.descriptor ? ` · ${a.descriptor}` : ""}{a.percentile !== null ? ` (${ordinal(a.percentile)} percentile)` : ""}{!a.fromGoal ? ` · ${t("overall RIT")}` : ""}</p>
      </div>
      {stages.filter((g) => g.skills.length || g.unlinked.length).map((g) => {
        const st = a.stages.find((x) => x.key === g.key)!;
        const ui = STAGE_STYLE[st.key];
        return (
          <section key={g.key} className="mt-5" data-testid="plan-stage">
            <div className="flex break-after-avoid items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
              <h3 className={`text-lg font-bold ${ui.text}`}><span className={`me-2 inline-block h-3 w-3 rounded-sm align-middle ${ui.bar}`} />{t(st.title)} · {st.range}</h3>
              <p className="text-xs text-slate-500">{t("{n} skills", { n: g.skills.length })}{st.shown < st.total ? ` · ${t("{shown} of {total} statements", { shown: st.shown, total: st.total })}` : ""}</p>
            </div>
            <p className="mt-1 break-after-avoid text-xs text-slate-500">{t(ui.note)}</p>
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {g.skills.map((k) => <SkillRow key={k.key} k={k} link={link} hub={hub} t={t} star={star} canAssign={canAssign} />)}
            </ul>
            {g.unlinked.length > 0 && !link && (
              <details className="mt-2 text-sm text-slate-600">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500">{t("Statements without a platform skill yet ({n})", { n: g.unlinked.length })}</summary>
                <ul className="mt-1 list-disc space-y-0.5 ps-5">{g.unlinked.map((x, i) => <li key={i}>{x.text} <span className="text-[10px] text-slate-400">{x.standards.join(" ")}</span></li>)}</ul>
              </details>
            )}
          </section>
        );
      })}
      <div className="mt-4"><StarLegendLine who={link ? "student" : "teacher"} t={t} /></div>
    </ReportPage>
  );
}

/** One skill: star · name · statements (folded) · Practise (student) or ☆ quick-assign (teacher). */
function SkillRow({ k, link, hub, t, star, canAssign = false }: { k: SkillGroup; link: boolean; hub: boolean; t: T; star?: PlanStarAssign; canAssign?: boolean }) {
  const name = k.skill.name;
  return (
    <li data-testid="plan-skill" data-key={k.key} className="break-inside-avoid px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {canAssign && <input type="checkbox" name="skill" value={k.skill.id} defaultChecked={k.star?.status !== "MASTERED"} className="h-4 w-4 print:hidden" aria-label={t("Assign {name}", { name })} />}
        <SkillStar info={k.star} who={link ? "student" : "teacher"} t={t} label={name} />
        {/* 🔗 r79: the skill's name is a link in every copy (staff → the skill page; student / family → practise it) */}
        <PlanA href={planHref({ kind: "skill", id: k.skill.id, from: "map" }, hub ? "staff" : link ? "student" : "family")} className="font-semibold text-brand-navy">{name}</PlanA>
        {k.standards.length > 0 && <span className="text-[10px] text-slate-400" dir="ltr">{k.standards.slice(0, 4).join(" ")}{k.standards.length > 4 ? " …" : ""}</span>}
        <span className="ms-auto flex items-center gap-2 print:hidden">
          {link && <Link prefetch={false} href={`/practice/${k.skill.id}?from=map`} className="inline-flex min-h-9 items-center rounded-lg bg-brand-navy px-3 text-xs font-semibold text-white hover:bg-brand-purple">▶ {t("Practise")}</Link>}
          {hub && star && <StarAssign refId={k.skill.id} classId={star.classId} assignedId={star.assigned[k.skill.id] ?? null} defaultDue={star.defaultDue} track={star.track ?? "MAP"} label={name} />}
        </span>
      </div>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-xs text-slate-500">{t("MAP statements it covers ({n})", { n: k.statements.length })}</summary>
        <ul className="mt-1 space-y-0.5 ps-4 text-slate-700">{k.statements.map((x, i) => <li key={i} className="list-disc">{x.text} {x.standards.length > 0 && <span className="text-[10px] text-slate-400" dir="ltr">{x.standards.join(" ")}</span>}</li>)}</ul>
      </details>
    </li>
  );
}
