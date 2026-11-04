import Link from "next/link";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { AssignmentSummary } from "../../server/teacher/assignments";
import type { ClassOverview as Overview, GroupName } from "../../server/teacher/queries";
import { AtAGlance, BandBar, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "../report-kit";
import { RichInline } from "@/components/rich-inline";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";

const fmtMin = (t: TFn, m: number) => (m >= 60 ? t("{h} h {m} min", { h: Math.floor(m / 60), m: m % 60 }) : t("{m} min", { m }));

const GROUP_STYLE: Record<GroupName, string> = {
  Intervention: "border-amber-400",
  Developing: "border-teal-300",
  Meeting: "border-teal-600",
  Advanced: "border-brand-gold",
};

export async function ClassOverviewView({ o, assignments, resolveAction, heatMap, badgeOf, t: tIn }: {
  o: Overview;
  /** Games Part 3: the avatar + favorite badge emblem shown next to each student's name */
  badgeOf?: Record<string, React.ReactNode>;
  assignments: AssignmentSummary[];
  resolveAction?: (f: FormData) => void | Promise<void>;
  heatMap: React.ReactNode;
  /** interface words (the page passes its own; otherwise read from the request) */
  t?: TFn;
}) {
  const t = tIn ?? (await getT()).t;
  const k = o.kpis;
  return (
    <div>
      <ReportHeader back={{ href: "/teacher", label: t("All classes") }} icon="🏫" title={t("Class {name}", { name: o.className })}
        subtitle={t("Who needs help, what to reteach and how every student is doing — all from practice on the platform.")}
        who={o.className}>
        <Link href={`/teacher/classes/${o.classId}/analytics`} className="rounded-xl border-2 border-brand-navy px-5 py-2 font-semibold text-brand-navy hover:bg-white">{t("Progress and growth")}</Link>
        <Link href={`/teacher/assignments/new?classId=${o.classId}`} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{t("New assignment")}</Link>
      </ReportHeader>

      <AtAGlance items={[
        { icon: "🙋", label: t("Students"), value: String(k.students), meaning: t("{n} practised", { n: k.activeStudents }), tone: k.activeStudents < k.students ? "warn" : "good" },
        { icon: "✍️", label: t("Questions answered"), value: String(k.questions), meaning: t("Practice time: {time}", { time: fmtMin(t, k.minutes) }) },
        { icon: "🎯", label: t("Accuracy"), value: k.accuracyPct === null ? "–" : `${k.accuracyPct}%`, meaning: t("of all answers were right"), tone: toneOfPct(k.accuracyPct) },
        { icon: "⭐", label: t("Skills mastered"), value: String(k.skillsMastered), meaning: k.avgMastery === null ? t("no skill started yet") : t("average star score {n} (0–100)", { n: k.avgMastery }) },
        { icon: "🙌", label: t("Need support"), value: String(k.needSupport), meaning: k.needSupport ? t("students listed below") : t("nobody right now"), tone: k.needSupport ? "bad" : "good" },
      ]} />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Callout kind="help" items={o.alerts.slice(0, 5).map((a) => a.message)}>{!o.alerts.length ? t("No student needs extra support right now.") : null}</Callout>
        <Callout kind="next" items={[
          o.weakSkills[0] ? <>{t("Reteach")} <b>{o.weakSkills[0].name}</b> ({t("⭐ {n} of {m} students", { n: o.weakSkills[0].mastered, m: o.weakSkills[0].students })})</> : null,
          o.alerts[0] ? <>{t("For {name}:", { name: o.alerts[0].message.split(" ")[0] })} {o.alerts[0].nextAction ? t(o.alerts[0].nextAction) : ""}</> : null,
          o.hardQuestions[0] ? t("Go over the hardest question below with the class.") : null,
        ]}>{!o.weakSkills.length && !o.alerts.length ? t("Keep the daily practice going.") : null}</Callout>
      </div>

      {o.alerts.length > 0 && (
        <ReportSection title={t("Students Who May Need Support")} icon="🙋" id="alerts">
          <ul className="space-y-2">
            {o.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border-s-4 border-amber-400 bg-white p-4 ring-1 ring-slate-200">
                <div className="min-w-0">
                  <Link href={`/teacher/students/${a.studentId}`} className="font-semibold text-brand-navy hover:text-brand-teal">{a.message}</Link>
                  <p className="mt-1 text-sm text-slate-600">{t("Next step:")} {a.nextAction ? t(a.nextAction) : ""}</p>
                </div>
                <form action={resolveAction} className="print:hidden">
                  <input type="hidden" name="alertId" value={a.id} /><input type="hidden" name="classId" value={o.classId} />
                  <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">{t("Mark as handled")}</button>
                </form>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      <ReportSection title={t("Groups")} icon="👥" hint={t("Based on the placement check, or on the average star score for students who have not taken it.")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(o.groups) as GroupName[]).map((g) => (
            <div key={g} className={["rounded-xl border-t-4 bg-white p-4 ring-1 ring-slate-200", GROUP_STYLE[g]].join(" ")}>
              <h3 className="font-semibold text-brand-navy">{t(g)} <span className="font-normal text-slate-500">({o.groups[g].length})</span></h3>
              <p className="mt-1 text-sm text-slate-700">{o.groups[g].length ? o.groups[g].join(", ") : t("No students")}</p>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection title={t("Mastery by Skill")} icon="🧩" id="map">
        {heatMap}
      </ReportSection>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <ReportSection title={t("Skills to Reteach")} icon="🔁" hint={t("Skills fewer than half of the students who started them have mastered (⭐).")}>
          <SimpleBar unit="%" items={o.weakSkills.map((s) => ({ label: s.name, value: Math.round((100 * s.mastered) / s.students), display: `${t("⭐ {n} of {m} students", { n: s.mastered, m: s.students })}${s.needsHelp ? ` · ${t("{n} need help", { n: s.needsHelp })}` : ""}`, band: "LOW" }))} />
          {o.weakSkills.length === 0 && <p className="text-slate-600">{t("No skill to reteach. Skills appear once 3 or more students have started them.")}</p>}
        </ReportSection>
        <ReportSection title={t("Class Strengths")} icon="💪" hint={t("Skills half or more of the students who started them have mastered (⭐).")}>
          <SimpleBar unit="%" items={o.strongSkills.map((s) => ({ label: s.name, value: Math.round((100 * s.mastered) / s.students), display: t("⭐ {n} of {m} students", { n: s.mastered, m: s.students }), band: s.mastered === s.students ? "GOOD" : "OK" }))} />
          {o.strongSkills.length === 0 && <p className="text-slate-600">{t("No skill mastered by half the class yet.")}</p>}
        </ReportSection>
      </div>

      {o.hardQuestions.length > 0 && (
        <ReportSection title={t("Hardest Questions for This Class")} icon="❗">
          <ul className="divide-y divide-slate-100">
            {o.hardQuestions.map((q) => (
              <li key={q.questionId} className="grid gap-1 py-2 md:grid-cols-[minmax(0,1fr)_10rem]">
                <span><span className="text-sm text-slate-500">{q.skill}</span><br /><RichInline text={q.stem} /></span>
                <span className="tabular-nums text-slate-600 md:text-right">{t("{n}% correct", { n: q.accuracyPct })}<br /><span className="text-sm">{t("{n} answers", { n: q.attempts })}</span></span>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      <ReportSection title={t("Students")} icon="👩‍🎓" id="students">
        <ReportTable label={t("Students")}
          cols={[{ key: "n", label: t("Student") }, { key: "g", label: t("Group") }, { key: "p", label: t("Placement") }, { key: "m", label: t("Avg star score"), num: true }, { key: "ms", label: t("⭐ Mastered"), num: true }, { key: "a", label: t("Answered"), num: true }, { key: "acc", label: t("Accuracy"), num: true }, { key: "t", label: t("Time"), num: true }, { key: "al", label: t("Alerts"), num: true }]}
          rows={o.students.map((s) => ({
            id: s.studentId, flag: s.openAlerts ? "warn" : undefined, sort: { n: s.name, m: s.avgMastery, ms: s.skillsMastered, acc: s.accuracyPct, t: s.minutes, al: s.openAlerts },
            cells: {
              n: <span className="inline-flex items-center gap-2">{badgeOf?.[s.studentId]}<Link href={`/teacher/students/${s.studentId}`} className="text-brand-navy hover:text-brand-teal">{s.name}</Link></span>,
              g: s.group ? t(s.group) : "–", p: s.placement ? t(s.placement) : t("Not taken"), m: s.avgMastery ?? "–", ms: s.skillsMastered, a: s.answered,
              acc: s.accuracyPct === null ? "–" : `${s.accuracyPct}%`, t: fmtMin(t, s.minutes),
              al: s.openAlerts ? <span className="rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900">! {s.openAlerts}</span> : "–",
            },
          }))} />
      </ReportSection>

      <ReportSection title={t("Assignments")} icon="📋" id="assign">
        {assignments.length === 0 ? <p className="text-slate-600">{t("No assignments yet. Assign skills or a unit with a due date.")}</p> : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-brand-navy">{a.title}</span>
                  <span className="text-sm text-slate-600">{a.dueAt ? t("Due {date}", { date: a.dueAt.slice(0, 10) }) : t("No due date")}, {t("target mastery {n}", { n: a.targetMastery })}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{t("{done} completed, {doing} in progress, {todo} not started", { done: a.counts.COMPLETED, doing: a.counts.IN_PROGRESS, todo: a.counts.NOT_STARTED })}{a.counts.OVERDUE ? `, ${t("{n} overdue", { n: a.counts.OVERDUE })}` : ""}</p>
                <BandBar className="mt-2" height="h-3" legend={false} parts={[{ key: "DONE", value: a.counts.COMPLETED }, { key: "OK", value: a.counts.IN_PROGRESS, label: t("In progress") }, { key: "PENDING", value: a.counts.NOT_STARTED, label: t("Not started") }, { key: "LATE", value: a.counts.OVERDUE ?? 0, label: t("Overdue") }]} />
              </li>
            ))}
          </ul>
        )}
      </ReportSection>
    </div>
  );
}
