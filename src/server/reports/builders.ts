/**
 * Report builders: analytics services (Phases 7-9) → ReportDoc.
 *
 * Builders add no new calculations and no new access rules of their own: every
 * number comes from the same service the dashboards use (studentAnalytics,
 * studentDetail, classOverview, classComparison, standardsReport), and those
 * services enforce row-level access (canAccessStudent / assertClassAccess /
 * analytics:school). A report therefore always matches the screen.
 */
import type { Period } from "../../analytics/periods";
import { bandDistribution } from "../../analytics/stats";
import {
  bandLabel, domainCodeFromLabel, domainLabel, gradeName, groupLabel, periodLabel, proficiencyText, t, type Locale,
} from "../../reports/i18n";
import type { Branding, Kpi, MetaItem, ReportDoc, ReportKind, Section, TableRow } from "../../reports/model";
import { ForbiddenError, assertCan, type Actor } from "../auth/rbac";
import { pairedGrowth } from "../analytics/growth";
import { classComparison, standardsReport, studentAnalytics } from "../analytics/reports";
import type { Repo } from "../seeding/repo";
import { classOverview, studentDetail, teacherClasses } from "../teacher/queries";

export interface BuildContext {
  repo: Repo;
  actor: Actor;
  locale: Locale;
  period: Period;
  now: Date;
  generatedBy: string;
  branding: Branding;
}

const num = (v: unknown) => Number(v ?? 0);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
/** ASCII-only, filesystem-safe piece of a file name. */
export const slug = (s: string) => s.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";

function base(ctx: BuildContext, kind: ReportKind, meta: MetaItem[], sections: Section[], primaryTable: string, stemParts: string[]): ReportDoc {
  const L = ctx.locale;
  return {
    kind, locale: L, title: t(L, `title.${kind}`), subtitle: t(L, "subtitle"), branding: ctx.branding,
    meta: [...meta, { label: t(L, "meta.period"), value: periodLabel(L, ctx.period) }],
    sections, primaryTable,
    fileStem: [`${kind}-report`, ...stemParts.map(slug), ctx.now.toISOString().slice(0, 10), L].join("_"),
    generatedAt: ctx.now, generatedBy: ctx.generatedBy,
  };
}

function notes(L: Locale, keys: Parameters<typeof t>[1][]): Section {
  return { type: "notes", title: t(L, "sec.notes"), items: [...keys, ...(L === "ar" ? (["note.english"] as const) : [])].map((k) => t(L, k)) };
}

const standardsTable = (L: Locale, s: Awaited<ReturnType<typeof standardsReport>>): Section => ({
  type: "table", id: "standards", title: t(L, "sec.standards"),
  columns: [
    { key: "code", label: t(L, "col.standard"), kind: "latin", width: 1.3, nowrap: true },
    { key: "description", label: t(L, "col.description"), kind: "latin", width: 4.5 },
    { key: "answers", label: t(L, "col.answers"), kind: "int", width: 1 },
    { key: "students", label: t(L, "col.students"), kind: "int", width: 1 },
    { key: "accuracy", label: t(L, "col.accuracy"), kind: "pct", width: 1 },
  ],
  rows: s.rows.map((r) => ({ code: r.short, description: r.description, answers: r.attempts, students: r.students, accuracy: r.accuracyPct })),
  empty: t(L, "noData"),
  note: t(L, "note.standardsMin", { n: s.notAssessed }),
});

// ------------------------------------------------------------------ student

export async function buildStudentReport(ctx: BuildContext, studentId: string): Promise<ReportDoc> {
  const { repo, actor, period } = ctx;
  const L = ctx.locale;
  const a = await studentAnalytics(repo, actor, studentId, period); // access checked inside
  const d = await studentDetail(repo, actor, studentId);
  // Headline growth = mean PAIRED skill growth (each skill vs itself), matching the growth table.
  // The overall-average change (a.growth.growth) falls whenever a new skill is started, so it would
  // show "decline" next to a table of gains.
  const paired = pairedGrowth(a.growth);
  const tone = (v: number | null, good: number, warn: number): Kpi["tone"] => (v === null ? "neutral" : v >= good ? "good" : v >= warn ? "warn" : "bad");

  const kpis: Kpi[] = [
    { label: t(L, "kpi.questions"), value: a.questions, kind: "int" },
    { label: t(L, "kpi.accuracy"), value: a.accuracyPct, kind: "pct", tone: tone(a.accuracyPct, 75, 60) },
    { label: t(L, "kpi.minutes"), value: a.minutes, kind: "int" },
    { label: t(L, "kpi.sessions"), value: a.sessions, kind: "int" },
    { label: t(L, "kpi.mastered"), value: a.skillsMastered, kind: "int", tone: "good" },
    { label: t(L, "kpi.developing"), value: a.skillsDeveloping, kind: "int", tone: "warn" },
    { label: t(L, "kpi.needSupport"), value: a.skillsNeedingIntervention, kind: "int", tone: a.skillsNeedingIntervention ? "bad" : "good" },
    { label: t(L, "kpi.curriculum"), value: a.curriculumProgressPct, kind: "pct" },
    { label: t(L, "kpi.growth"), value: paired, kind: "signed", tone: paired === null ? "neutral" : paired > 0 ? "good" : paired < 0 ? "bad" : "neutral" },
    { label: t(L, "kpi.avgSeconds"), value: a.avgSeconds, kind: "dec" },
    ...(a.readingRange ? [{ label: t(L, "kpi.readingRange"), value: a.readingRange, kind: "latin" as const }] : []),
  ];

  const skills: TableRow[] = d.skills.map((s) => ({ skill: s.name, band: s.band, score: s.score, questions: s.attempts, accuracy: s.accuracyPct, last: day(s.lastPracticed) }));
  const growth: TableRow[] = [...a.growth.skills].sort((x, y) => y.growth - x.growth).map((s) => ({ skill: s.name, area: domainLabel(L, s.domain), start: s.start, now: s.now, change: s.growth }));
  const domains: TableRow[] = d.domains.map((x) => ({ area: domainLabel(L, domainCodeFromLabel(x.label) ?? x.label), level: proficiencyText(L, x.level) }));
  const map: TableRow[] = a.importedMap.map((m) => ({ date: m.testDate, subject: m.subject, goal: m.goalArea, rit: m.rit, pct: m.percentile }));

  const sections: Section[] = [
    { type: "kpis", title: t(L, "sec.summary"), items: kpis },
    { type: "bars", title: t(L, "sec.units"), items: a.unitProgress.map((u) => ({ label: `${t(L, "unit")} ${u.unit}`, value: u.pct })), max: 100, kind: "pct" },
    {
      type: "table", id: "skills", title: t(L, "sec.skills"), empty: t(L, "noData"),
      columns: [
        { key: "skill", label: t(L, "col.skill"), kind: "latin", width: 3.4 },
        { key: "band", label: t(L, "col.level"), kind: "band", width: 1.6 },
        { key: "score", label: t(L, "col.score"), kind: "int", width: 1 },
        { key: "questions", label: t(L, "col.questions"), kind: "int", width: 1 },
        { key: "accuracy", label: t(L, "col.accuracy"), kind: "pct", width: 1 },
        { key: "last", label: t(L, "col.lastPractised"), kind: "date", width: 1.5 },
      ],
      rows: skills,
    },
    {
      type: "table", id: "growth", title: t(L, "sec.growth"), empty: t(L, "noData"), note: t(L, "note.growth"),
      columns: [
        { key: "skill", label: t(L, "col.skill"), kind: "latin", width: 3.4 },
        { key: "area", label: t(L, "col.area"), kind: "text", width: 2 },
        { key: "start", label: t(L, "col.start"), kind: "int", width: 1 },
        { key: "now", label: t(L, "col.now"), kind: "int", width: 1 },
        { key: "change", label: t(L, "col.change"), kind: "signed", width: 1 },
      ],
      rows: growth,
    },
    ...(domains.length
      ? [{
          type: "table" as const, id: "domains", title: t(L, "sec.domains"), empty: t(L, "noData"),
          columns: [
            { key: "area", label: t(L, "col.area"), kind: "text" as const, width: 2 },
            { key: "level", label: t(L, "col.level"), kind: "text" as const, width: 2 },
          ],
          rows: domains,
        }]
      : []),
    {
      type: "table", id: "map", title: t(L, "sec.map"), sheet: "MAP Growth", empty: t(L, "note.noMap"),
      columns: [
        { key: "date", label: t(L, "col.testDate"), kind: "date", width: 1.3 },
        { key: "subject", label: t(L, "col.subject"), kind: "latin", width: 1.6 },
        { key: "goal", label: t(L, "col.goalArea"), kind: "latin", width: 3 },
        { key: "rit", label: t(L, "col.rit"), kind: "int", width: 1 },
        { key: "pct", label: t(L, "col.percentile"), kind: "int", width: 1 },
      ],
      rows: map,
    },
    notes(L, ["note.internal", "note.map"]),
  ];
  const meta: MetaItem[] = [
    { label: t(L, "meta.student"), value: d.name, isolate: "auto" },
    { label: t(L, "meta.studentNumber"), value: d.studentNumber, isolate: "latin" },
    { label: t(L, "meta.grade"), value: gradeName(L, d.grade) },
    ...(d.className ? [{ label: t(L, "meta.class"), value: d.className, isolate: "latin" as const }] : []),
  ];
  return base(ctx, "student", meta, sections, "skills", [d.studentNumber]);
}

// -------------------------------------------------------------------- class

export async function buildClassReport(ctx: BuildContext, classId: string): Promise<ReportDoc> {
  const { repo, actor, period } = ctx;
  const L = ctx.locale;
  const o = await classOverview(repo, actor, classId, period); // access checked inside
  const c = await classComparison(repo, actor, classId, period);
  const s = await standardsReport(repo, actor, { classId }, period);
  const numbers = new Map((o.students.length ? await repo.findMany("Student", { id: { in: o.students.map((x) => x.studentId) } }) : []).map((r) => [String(r.id), String(r.studentNumber)]));

  const k = o.kpis;
  const kpis: Kpi[] = [
    { label: t(L, "kpi.students"), value: k.students, kind: "int" },
    { label: t(L, "kpi.active"), value: k.activeStudents, kind: "int" },
    { label: t(L, "kpi.questions"), value: k.questions, kind: "int" },
    { label: t(L, "kpi.accuracy"), value: k.accuracyPct, kind: "pct", tone: k.accuracyPct === null ? "neutral" : k.accuracyPct >= 75 ? "good" : k.accuracyPct >= 60 ? "warn" : "bad" },
    { label: t(L, "kpi.avgMastery"), value: k.avgMastery, kind: "int" },
    { label: t(L, "kpi.minutes"), value: k.minutes, kind: "int" },
    { label: t(L, "kpi.skillsMasteredTotal"), value: k.skillsMastered, kind: "int", tone: "good" },
    { label: t(L, "kpi.studentsNeedSupport"), value: k.needSupport, kind: "int", tone: k.needSupport ? "bad" : "good" },
  ];
  const cmpLabel = [t(L, "cmp.class", { name: o.className }), t(L, "cmp.grade", { level: o.grade }), t(L, "cmp.school")];
  const skillCols = [
    { key: "skill", label: t(L, "col.skill"), kind: "latin" as const, width: 4 },
    { key: "avg", label: t(L, "col.avgMastery"), kind: "int" as const, width: 1.2 },
    { key: "students", label: t(L, "col.students"), kind: "int" as const, width: 1 },
  ];
  const sections: Section[] = [
    { type: "kpis", title: t(L, "sec.summary"), items: kpis },
    {
      type: "table", id: "students", title: t(L, "sec.students"), empty: t(L, "noData"),
      columns: [
        { key: "name", label: t(L, "col.student"), kind: "name", width: 2.2 },
        { key: "number", label: t(L, "col.studentNumber"), kind: "latin", width: 1.4, nowrap: true },
        { key: "group", label: t(L, "col.group"), kind: "text", width: 1.4 },
        { key: "placement", label: t(L, "col.placement"), kind: "text", width: 1.5 },
        { key: "avg", label: t(L, "col.avgMastery"), kind: "int", width: 1.1 },
        { key: "mastered", label: t(L, "col.skillsMastered"), kind: "int", width: 1.1 },
        { key: "questions", label: t(L, "col.questions"), kind: "int", width: 1.25 },
        { key: "accuracy", label: t(L, "col.accuracy"), kind: "pct", width: 1.25 },
        { key: "minutes", label: t(L, "col.minutes"), kind: "int", width: 1.15 },
        { key: "last", label: t(L, "col.lastActive"), kind: "date", width: 1.6 },
        { key: "alerts", label: t(L, "col.alerts"), kind: "int", width: 1 },
      ],
      rows: o.students.map((r) => ({
        name: r.name, number: numbers.get(r.studentId) ?? null, group: r.group ? groupLabel(L, r.group) : null, placement: r.placement ? proficiencyText(L, r.placement) : null,
        avg: r.avgMastery, mastered: r.skillsMastered, questions: r.answered, accuracy: r.accuracyPct, minutes: r.minutes, last: day(r.lastActive), alerts: r.openAlerts,
      })),
    },
    {
      type: "table", id: "comparison", title: t(L, "sec.comparison"), empty: t(L, "noData"), note: t(L, "note.suppressed"),
      columns: [
        { key: "group", label: t(L, "col.comparisonGroup"), kind: "text", width: 2.6 },
        { key: "students", label: t(L, "col.students"), kind: "int", width: 1 },
        { key: "withData", label: t(L, "col.withData"), kind: "int", width: 1 },
        { key: "avg", label: t(L, "col.avgMastery"), kind: "dec", width: 1.1 },
        { key: "accuracy", label: t(L, "col.accuracy"), kind: "pct", width: 1 },
        { key: "growth", label: t(L, "col.meanGrowth"), kind: "signed", width: 1.1 },
      ],
      rows: c.rows.map((r, i) => ({
        group: r.suppressed ? `${cmpLabel[i] ?? r.label} · ${t(L, "hidden")}` : cmpLabel[i] ?? r.label,
        students: r.students, withData: r.studentsWithData, avg: r.avgMastery, accuracy: r.accuracyPct, growth: r.meanGrowth,
      })),
    },
    {
      type: "table", id: "external", title: t(L, "sec.external"), empty: t(L, "noData"),
      columns: [
        { key: "benchmark", label: t(L, "col.benchmark"), kind: "text", width: 3 },
        { key: "value", label: t(L, "col.value"), kind: "dec", width: 1 },
        { key: "source", label: t(L, "col.source"), kind: "latin", width: 2 },
      ],
      rows: c.external.map((e) => ({
        benchmark: e.available ? t(L, e.scope === "NATIONAL" ? "ext.national" : "ext.district") : t(L, e.scope === "NATIONAL" ? "ext.national.none" : "ext.district.none"),
        value: e.available ? e.value ?? null : null, source: e.available ? e.source ?? null : null,
      })),
    },
    { type: "bars", title: t(L, "sec.distribution"), items: c.distribution.map((b) => ({ label: bandLabel(L, b.label), value: b.count })), max: Math.max(1, ...c.distribution.map((b) => b.count)), kind: "int" },
    { type: "table", id: "weak", title: t(L, "sec.weak"), empty: t(L, "noData"), columns: skillCols, rows: o.weakSkills.map((x) => ({ skill: x.name, avg: x.avgMastery, students: x.students })) },
    { type: "table", id: "strong", title: t(L, "sec.strong"), empty: t(L, "noData"), columns: skillCols, rows: o.strongSkills.map((x) => ({ skill: x.name, avg: x.avgMastery, students: x.students })) },
    standardsTable(L, s),
    notes(L, ["note.internal", "note.growth", "note.suppressed"]),
  ];
  const meta: MetaItem[] = [
    { label: t(L, "meta.class"), value: o.className, isolate: "latin" },
    { label: t(L, "meta.grade"), value: gradeName(L, o.grade) },
  ];
  return base(ctx, "class", meta, sections, "students", [o.className]);
}

// ---------------------------------------------------------------- standards

export async function buildStandardsReport(ctx: BuildContext, scope: { classId: string } | { school: true }): Promise<ReportDoc> {
  const L = ctx.locale;
  const s = await standardsReport(ctx.repo, ctx.actor, scope, ctx.period); // access checked inside
  let meta: MetaItem[];
  let stem: string;
  if ("classId" in scope) {
    const klass = (await ctx.repo.findUnique("Class", { id: scope.classId }))!;
    const grade = await ctx.repo.findUnique("Grade", { id: klass.gradeId });
    meta = [{ label: t(L, "meta.class"), value: String(klass.name), isolate: "latin" }, { label: t(L, "meta.grade"), value: gradeName(L, num(grade?.level)) }];
    stem = String(klass.name);
  } else {
    meta = [{ label: t(L, "meta.scope"), value: t(L, "scope.school") }];
    stem = "school";
  }
  return base(ctx, "standards", meta, [standardsTable(L, s), notes(L, ["note.internal"])], "standards", [stem]);
}

// ------------------------------------------------------------------- school

export async function buildSchoolReport(ctx: BuildContext): Promise<ReportDoc> {
  const { repo, actor, period } = ctx;
  const L = ctx.locale;
  assertCan(actor, "analytics:school");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const classes = await teacherClasses(repo, actor);
  const own = new Set((await repo.findMany("Class", { schoolId: actor.schoolId, deletedAt: null })).map((c) => String(c.id)));
  const rows: TableRow[] = [];
  let students = 0, active = 0, questions = 0, correctWeighted = 0, needSupport = 0, alerts = 0;
  const mastery: number[] = [];
  for (const c of classes.filter((x) => own.has(x.classId)).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name))) {
    const o = await classOverview(repo, actor, c.classId, period);
    const k = o.kpis;
    rows.push({ grade: gradeName(L, c.grade), class: c.name, students: k.students, active: k.activeStudents, questions: k.questions, accuracy: k.accuracyPct, avg: k.avgMastery, need: k.needSupport, alerts: c.openAlerts });
    students += k.students; active += k.activeStudents; questions += k.questions; needSupport += k.needSupport; alerts += c.openAlerts;
    if (k.accuracyPct !== null) correctWeighted += (k.accuracyPct * k.questions) / 100;
    for (const st of o.students) if (st.avgMastery !== null) mastery.push(st.avgMastery);
  }
  const s = await standardsReport(repo, actor, { school: true }, period);
  const accuracy = questions ? Math.round((100 * correctWeighted) / questions) : null;
  const avgMastery = mastery.length ? Math.round(mastery.reduce((a, b) => a + b, 0) / mastery.length) : null;
  const dist = bandDistribution(mastery);
  const sections: Section[] = [
    {
      type: "kpis", title: t(L, "sec.summary"), items: [
        { label: t(L, "kpi.classes"), value: rows.length, kind: "int" },
        { label: t(L, "kpi.students"), value: students, kind: "int" },
        { label: t(L, "kpi.active"), value: active, kind: "int" },
        { label: t(L, "kpi.questions"), value: questions, kind: "int" },
        { label: t(L, "kpi.accuracy"), value: accuracy, kind: "pct" },
        { label: t(L, "kpi.avgMastery"), value: avgMastery, kind: "int" },
        { label: t(L, "kpi.studentsNeedSupport"), value: needSupport, kind: "int", tone: needSupport ? "bad" : "good" },
        { label: t(L, "col.alerts"), value: alerts, kind: "int", tone: alerts ? "warn" : "good" },
      ],
    },
    {
      type: "table", id: "classes", title: t(L, "sec.classes"), empty: t(L, "noData"),
      columns: [
        { key: "grade", label: t(L, "col.grade"), kind: "text", width: 1.6 },
        { key: "class", label: t(L, "col.class"), kind: "latin", width: 1, nowrap: true },
        { key: "students", label: t(L, "col.students"), kind: "int", width: 1 },
        { key: "active", label: t(L, "col.active"), kind: "int", width: 1 },
        { key: "questions", label: t(L, "col.questions"), kind: "int", width: 1 },
        { key: "accuracy", label: t(L, "col.accuracy"), kind: "pct", width: 1 },
        { key: "avg", label: t(L, "col.avgMastery"), kind: "int", width: 1.1 },
        { key: "need", label: t(L, "col.needSupport"), kind: "int", width: 1.2 },
        { key: "alerts", label: t(L, "col.alerts"), kind: "int", width: 1.1 },
      ],
      rows,
    },
    { type: "bars", title: t(L, "sec.distribution"), items: dist.map((b) => ({ label: bandLabel(L, b.label), value: b.count })), max: Math.max(1, ...dist.map((b) => b.count)), kind: "int" },
    standardsTable(L, s),
    notes(L, ["note.internal"]),
  ];
  return base(ctx, "school", [{ label: t(L, "meta.scope"), value: t(L, "scope.school") }], sections, "classes", ["school"]);
}

