/**
 * Update 39C report exports (PDF / Excel / CSV through /api/reports): grammar results, live games, the RTI weekly plan,
 * the school's Below / On / Above distribution, ReadMaster results and the ReadRise export. Every number comes from
 * the SAME loader the page uses (which also checks access), so a file always matches the screen. These reports are
 * written in English (the curriculum's language); the Arabic option of the older reports does not apply.
 */
import type { Column, Kpi, MetaItem, ReportDoc, ReportKind, Section, TableRow } from "../../reports/model";
import type { BuildContext } from "./builders";
import { slug } from "./builders";
import { classGrammarReport, schoolGrammarReport } from "./grammar-report";
import { classGamesReport } from "./games-report";
import { rtiWeeklyPlan } from "../tiers/weekly-plan";
import { schoolLevels } from "./level-distribution";
import { classReadMasterReport, readMasterAnalytics, type ReadMasterAnalytics } from "./readmaster-report";
import { classReport as readRiseClass, schoolDashboard as readRiseSchool } from "../readrise/dashboards";

export const EXTRA_KINDS = ["grammar", "games", "rti", "levels", "readmaster", "readrise"] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];
export const isExtraKind = (k: string): k is ExtraKind => (EXTRA_KINDS as readonly string[]).includes(k);
/** which extra kinds are school-wide (need analytics:school) for a scope */
export const EXTRA_SCHOOL: Record<ExtraKind, "never" | "always" | "scope"> = { grammar: "scope", games: "never", rti: "never", levels: "always", readmaster: "scope", readrise: "scope" };

export const RR_EXPORT_NOTE = "ReadRise Level (estimate): ReadRise's own reading level on a Lexile-like scale — an estimate from first-try article scores, not an official Lexile measure and not the MAP Lexile.";
const TITLES: Record<ExtraKind, string> = {
  grammar: "Grammar Results", games: "Live Games Report", rti: "RTI Weekly Plan", levels: "Below / On / Above Distribution", readmaster: "ReadMaster Results", readrise: "ReadRise Report",
};
const col = (key: string, label: string, kind: Column["kind"], width = 1, nowrap = false): Column => ({ key, label, kind, width, nowrap });
const num = (v: number | null | undefined) => (v === null || v === undefined ? null : v);

function doc(ctx: BuildContext, kind: ExtraKind, subtitle: string, meta: MetaItem[], sections: Section[], primary: string, stem: string[]): ReportDoc {
  return {
    kind: kind as ReportKind, locale: "en", title: TITLES[kind], subtitle, branding: ctx.branding, meta, sections, primaryTable: primary,
    fileStem: [`${kind}-report`, ...stem.map(slug), ctx.now.toISOString().slice(0, 10), "en"].join("_"), generatedAt: ctx.now, generatedBy: ctx.generatedBy,
  };
}
const table = (id: string, title: string, columns: Column[], rows: TableRow[], note?: string, sheet?: string): Section => ({ type: "table", id, title, columns, rows, empty: "No data yet.", ...(note ? { note } : {}), ...(sheet ? { sheet } : {}) });
const kpis = (title: string, items: Kpi[]): Section => ({ type: "kpis", title, items });

const RM_NOTES = [
  "Reading Lexile = ReadMaster's own reading level (75%+ on an article raises it, under 50% lowers it). It is not the MAP Lexile and not the ReadRise Level.",
  "Counted = read at the student's own level or higher (it moves the reading Lexile and skill mastery). Practice = a lower level: saved, but nothing changes.",
];
/** The ReadMaster analytics tables (by student, text, skill, reading below level) — the same numbers as the page. */
function rmAnalyticsTables(x: ReadMasterAnalytics): Section[] {
  return [
    table("students", "By student", [col("name", "Student", "name", 2.2), col("grade", "Grade", "int"), col("texts", "Texts read", "int"), col("counted", "Counted", "int"), col("practice", "Practice", "int"), col("avg", "Avg score", "pct"), col("start", "Reading Lexile start", "int"), col("now", "Reading Lexile now", "int"), col("change", "Change", "signed"), col("last", "Last read", "date")],
      x.students.map((s) => ({ name: s.name, grade: num(s.grade), texts: s.texts, counted: s.counted, practice: s.practice, avg: num(s.avgScore), start: num(s.lexileStart), now: num(s.lexileNow), change: num(s.change), last: s.lastRead }))),
    table("texts", "By text", [col("title", "Text", "latin", 3), col("grade", "Grade", "int"), col("skill", "Skill", "latin", 2), col("readers", "Readers", "int"), col("avg", "Avg score", "pct"), col("below", "Below avg", "pct"), col("on", "On avg", "pct"), col("above", "Above avg", "pct"), col("practice", "Practice", "int")],
      x.texts.map((t) => ({ title: t.title, grade: t.grade, skill: t.skill, readers: t.readers, avg: num(t.avgScore), below: num(t.byLevel.BELOW.avg), on: num(t.byLevel.ON.avg), above: num(t.byLevel.ABOVE.avg), practice: t.practice }))),
    table("skills", "By skill", [col("skill", "Skill", "latin", 3), col("texts", "Texts", "int"), col("readers", "Readers", "int"), col("counted", "Counted", "int"), col("accuracy", "Accuracy", "pct"), col("practice", "Practice", "int"), col("pacc", "Practice accuracy", "pct")],
      x.skills.map((k) => ({ skill: k.skill, texts: k.texts, readers: k.readers, counted: k.counted, accuracy: num(k.accuracy), practice: k.practice, pacc: num(k.practiceAccuracy) }))),
    table("below", "Reading below their level", [col("name", "Student", "name", 2.2), col("grade", "Grade", "int"), col("lower", "Lower-level reads", "int"), col("reads", "All reads", "int"), col("share", "Share", "pct"), col("last", "Last lower read", "date")],
      x.below.map((b) => ({ name: b.name, grade: num(b.grade), lower: b.lower, reads: b.reads, share: num(b.share), last: b.last }))),
  ];
}

export async function buildExtraReport(ctx: BuildContext, kind: ExtraKind, opts: { classId?: string; scope?: "class" | "school"; days: number }): Promise<ReportDoc> {
  const { repo, actor, now } = ctx;
  const days = opts.days;
  const win: MetaItem = { label: "Window", value: `last ${days} days` };
  if (kind === "grammar" && opts.scope === "school") {
    const rows = await schoolGrammarReport(repo, actor, { days, now });
    return doc(ctx, kind, "Grammar and mechanics skills · every class", [{ label: "Scope", value: "Whole school" }, win], [
      table("classes", "Classes", [col("cls", "Class", "latin", 1.2, true), col("grade", "Grade", "int"), col("students", "Students", "int"), col("practised", "Practised", "int"), col("answers", "Answers", "int"), col("accuracy", "Accuracy", "pct"), col("mastery", "Avg mastery", "int"), col("reteach", "Skills to reteach", "int")],
        rows.map((r) => ({ cls: r.name, grade: r.grade, students: r.students, practised: r.practised, answers: r.answers, accuracy: num(r.accuracy), mastery: num(r.avgMastery), reteach: r.reteachSkills })), "Accuracy leaves rapid guesses out."),
    ], "classes", ["school"]);
  }
  if (kind === "grammar") {
    const r = await classGrammarReport(repo, actor, opts.classId!, { days, now });
    return doc(ctx, kind, "Grammar and mechanics skills", [{ label: "Class", value: r.className, isolate: "latin" }, { label: "Grade", value: String(r.grade) }, win], [
      kpis("Summary", [{ label: "Students", value: r.summary.students, kind: "int" }, { label: "Practised", value: r.summary.practised, kind: "int", glance: true, hint: "students who practised grammar in this window" }, { label: "Answers", value: r.summary.answers, kind: "int" }, { label: "Accuracy", value: r.summary.accuracy, kind: "pct", glance: true, hint: "of careful answers were right (rapid guesses left out)" }, { label: "Rapid guesses", value: r.summary.rapid, kind: "int" }, { label: "Avg mastery", value: r.summary.avgMastery, kind: "int", glance: true, hint: "average grammar skill score (0–100)" }, { label: "Skills to reteach", value: r.summary.reteachSkills, kind: "int", tone: r.summary.reteachSkills ? "warn" : "good", glance: true, hint: "skills the class should be taught again" }]),
      table("students", "Students", [col("name", "Student", "name", 2.2), col("answers", "Answers", "int"), col("accuracy", "Accuracy", "pct"), col("mastery", "Avg mastery", "int"), col("skills", "Skills practised", "int"), col("reteach", "Skills to reteach", "int"), col("error", "Most common error", "text", 3)],
        r.students.map((x) => ({ name: x.name, answers: x.answers, accuracy: num(x.accuracy), mastery: num(x.avgMastery), skills: x.skillsPractised, reteach: x.reteach, error: x.topError }))),
      table("skills", "Skills", [col("skill", "Skill", "latin", 3), col("practised", "Students", "int"), col("answers", "Answers", "int"), col("accuracy", "Accuracy", "pct"), col("mastery", "Avg mastery", "int"), col("reteach", "To reteach", "int"), col("error", "Most common error", "text", 3)],
        r.skills.map((x) => ({ skill: x.name, practised: x.practised, answers: x.answers, accuracy: num(x.accuracy), mastery: num(x.avgMastery), reteach: x.reteach.length, error: x.topError?.label ?? null }))),
      table("errors", "Common error types", [col("error", "Error", "text", 3), col("count", "Wrong answers", "int"), col("students", "Students", "int"), col("fix", "Teaching move", "text", 4)], r.errors.map((e) => ({ error: e.label, count: e.count, students: e.students, fix: e.fix }))),
      table("reteach", "Recommended reteach", [col("skill", "Skill", "latin", 2.5), col("students", "Students", "text", 4), col("move", "Teaching move", "text", 4)], r.reteach.map((x) => ({ skill: x.name, students: x.students.map((s) => s.name).join(", "), move: x.move ? `${x.error ? `${x.error}: ` : ""}${x.move}` : null }))),
    ], "students", [r.className]);
  }
  if (kind === "games") {
    const r = await classGamesReport(repo, actor, opts.classId!, { days, now });
    return doc(ctx, kind, "Live games · participation, accuracy, rapid guesses", [{ label: "Class", value: r.className, isolate: "latin" }, win], [
      kpis("Summary", [{ label: "Games", value: r.summary.games, kind: "int", glance: true, hint: "live games played in this window" }, { label: "Students joined", value: r.summary.joined, kind: "int" }, { label: "Participation", value: r.summary.participation, kind: "pct", glance: true, hint: "of the class joined the games" }, { label: "Answers", value: r.summary.answers, kind: "int" }, { label: "Accuracy", value: r.summary.accuracy, kind: "pct", glance: true, hint: "of answers were right" }, { label: "Rapid guesses", value: r.summary.rapidPct, kind: "pct", tone: (r.summary.rapidPct ?? 0) >= 20 ? "warn" : "neutral", glance: true, hint: "of answers came too fast to be read" }]),
      table("students", "Students", [col("name", "Student", "name", 2.2), col("games", "Games", "int"), col("answers", "Answers", "int"), col("accuracy", "Accuracy", "pct"), col("rapid", "Rapid %", "pct"), col("points", "Points", "int")], r.students.map((x) => ({ name: x.name, games: x.games, answers: x.answers, accuracy: num(x.accuracy), rapid: num(x.rapidPct), points: x.points }))),
      table("games", "Games", [col("date", "Date", "date"), col("title", "Game", "latin", 3), col("questions", "Questions", "int"), col("players", "Players", "int"), col("participation", "Participation", "pct"), col("accuracy", "Accuracy", "pct"), col("rapid", "Rapid %", "pct")], r.games.map((g) => ({ date: g.date, title: g.title, questions: g.questions, players: g.players, participation: num(g.participation), accuracy: num(g.accuracy), rapid: num(g.rapidPct) }))),
      table("skills", "Accuracy by skill", [col("skill", "Skill", "latin", 3), col("answers", "Answers", "int"), col("accuracy", "Accuracy", "pct"), col("rapid", "Rapid %", "pct")], r.skills.map((x) => ({ skill: x.name, answers: x.answers, accuracy: num(x.accuracy), rapid: num(x.rapidPct) }))),
      table("missed", "Most missed questions", [col("stem", "Question", "latin", 5), col("skill", "Skill", "latin", 2), col("answers", "Answers", "int"), col("accuracy", "Accuracy", "pct"), col("wrong", "Most chosen wrong answer", "latin", 3)], r.missed.map((m) => ({ stem: m.stem, skill: m.skill, answers: m.answers, accuracy: num(m.accuracy), wrong: m.commonWrong }))),
    ], "students", [r.className]);
  }
  if (kind === "rti") {
    const p = await rtiWeeklyPlan(repo, actor, opts.classId!, now);
    const rows: TableRow[] = p.groups.flatMap((g) => g.students.map((st) => ({
      group: g.label, name: st.name, skill: g.focusSkill, lesson: g.lesson?.name ?? "No lesson yet", minutes: g.minutes, next: st.nextCheck,
      last: st.checks.map((c) => `${c.date} ${c.pct}%${c.items ? ` of ${c.items}` : ""}${c.signal === "INVALID" ? " (invalid)" : ""}`).join("; ") || "—", decision: st.decisionText,
    })));
    return doc(ctx, kind, `Week of ${p.weekOf} · Tier 2 and Tier 3 groups`, [{ label: "Class", value: p.className, isolate: "latin" }, { label: "Week", value: `${p.weekOf} – ${p.weekEnd}` }], [
      kpis("Tiers", [{ label: "Students", value: p.counts.students, kind: "int", glance: true, hint: "students in the class" }, { label: "Tier 1", value: p.counts.tier1, kind: "int", glance: true, hint: "core teaching only" }, { label: "Tier 2", value: p.counts.tier2, kind: "int", glance: true, hint: "small-group support this week" }, { label: "Tier 3", value: p.counts.tier3, kind: "int", glance: true, hint: "intensive support this week" }, { label: "Groups", value: p.groups.length, kind: "int", glance: true, hint: "intervention groups to run" }]),
      table("plan", "This week's groups", [col("group", "Group", "latin", 2.6), col("name", "Student", "name", 2), col("lesson", "Intervention lesson", "latin", 2), col("next", "Next check", "date"), col("last", "Last checks", "text", 2.6), col("decision", "Decision", "text", 3)], rows, undefined, "Plan"),
      { type: "notes", title: "Decision rules", items: p.rules },
    ], "plan", [p.className, p.weekOf]);
  }
  if (kind === "levels") {
    const L = await schoolLevels(repo, actor, now);
    const lvCols = [col("below", "Below", "int"), col("on", "On", "int"), col("above", "Above", "int"), col("none", "Not evaluated", "int"), col("dBelow", "Below Δ month", "signed"), col("dOn", "On Δ month", "signed"), col("dAbove", "Above Δ month", "signed")];
    const lv = (r: { now: { below: number; on: number; above: number; none: number }; change: { below: number; on: number; above: number } }) => ({ below: r.now.below, on: r.now.on, above: r.now.above, none: r.now.none, dBelow: r.change.below, dOn: r.change.on, dAbove: r.change.above });
    const tierCols = [col("t1", "Tier 1", "int"), col("t2", "Tier 2", "int"), col("t3", "Tier 3", "int")];
    return doc(ctx, kind, `Confirmed overall level · ${L.asOf} vs ${L.monthAgo}`, [{ label: "Scope", value: "Whole school" }, { label: "Compared with", value: L.monthAgo }], [
      kpis("Whole school", [{ label: "Students", value: L.overall.now.total, kind: "int", glance: true, hint: "students in the school" }, { label: "Below", value: L.overall.pctNow.below, kind: "pct", glance: true, hint: "of students are below grade level" }, { label: "On", value: L.overall.pctNow.on, kind: "pct", glance: true, hint: "of students are on grade level" }, { label: "Above", value: L.overall.pctNow.above, kind: "pct", glance: true, hint: "of students are above grade level" }, { label: "Tier 2", value: L.overall.tiers.tier2, kind: "int" }, { label: "Tier 3", value: L.overall.tiers.tier3, kind: "int" }]),
      table("grades", "By grade", [col("grade", "Grade", "int"), col("total", "Students", "int"), ...lvCols, ...tierCols], L.grades.map((g) => ({ grade: g.grade, total: g.now.total, ...lv(g), t1: g.tiers.tier1, t2: g.tiers.tier2, t3: g.tiers.tier3 }))),
      table("classes", "By class", [col("cls", "Class", "latin", 1.2, true), col("grade", "Grade", "int"), col("total", "Students", "int"), ...lvCols, ...tierCols], L.classes.map((c) => ({ cls: c.name, grade: c.grade, total: c.now.total, ...lv(c), t1: c.tiers.tier1, t2: c.tiers.tier2, t3: c.tiers.tier3 }))),
      table("strands", "By Curriculum-Map strand", [col("strand", "Strand", "latin", 2.5), col("grade", "Grade", "text"), ...lvCols], L.strands.map((x) => ({ strand: x.name, grade: x.grade === null ? "All" : String(x.grade), ...lv(x) }))),
      { type: "notes", title: "Notes", items: ["Level = the confirmed overall level (Below / On / Above Level) the daily job sets from all evidence; a change needs new evidence on two evaluations.", "Δ month = students now minus students 30 days ago, from the level history.", "Strands use each strand's own level (Concept Vocabulary, Analyze Craft and Structure, Respond to Reading)."] },
    ], "classes", ["school"]);
  }
  if (kind === "readmaster" && opts.scope === "school") {
    const x = await readMasterAnalytics(repo, actor, { scope: "school", days, now });
    return doc(ctx, kind, "ReadMaster · whole school: by student, text, skill and reading below level", [{ label: "Scope", value: "Whole school" }, win], [
      kpis("Summary", [{ label: "Readers", value: x.summary.readers, kind: "int", glance: true, hint: "students who read at least one article" }, { label: "Texts read", value: x.summary.reads, kind: "int", glance: true, hint: "reads in this window" }, { label: "Counted", value: x.summary.counted, kind: "int" }, { label: "Practice", value: x.summary.practice, kind: "int" }, { label: "Avg score", value: x.summary.avgScore, kind: "pct", glance: true, hint: "average score of the counted reads" }, { label: "Reading below their level", value: x.summary.belowReaders, kind: "int", glance: true, hint: "students who chose a lower version" }]),
      ...rmAnalyticsTables(x),
      { type: "notes", title: "Notes", items: RM_NOTES },
    ], "students", ["school"]);
  }
  if (kind === "readmaster") {
    const r = await classReadMasterReport(repo, actor, opts.classId!, { days, now });
    const x = await readMasterAnalytics(repo, actor, { scope: "class", classId: opts.classId!, days, now });
    return doc(ctx, kind, "Articles, ReadMaster reading Lexile, accuracy and time", [{ label: "Class", value: r.className, isolate: "latin" }, win], [
      kpis("Summary", [{ label: "Readers", value: r.summary.readers, kind: "int", glance: true, hint: "students who read at least one article" }, { label: "Articles", value: r.summary.articles, kind: "int", glance: true, hint: "articles read in this window" }, { label: "Accuracy", value: r.summary.accuracy, kind: "pct", glance: true, hint: "of answers were right" }, { label: "Avg Lexile change", value: r.summary.avgChange, kind: "signed", glance: true, hint: "average change in ReadMaster's reading Lexile (+ means up)" }, { label: "Minutes (timed)", value: r.summary.minutes, kind: "int" }, { label: "Rapid guesses", value: r.summary.rapidPct, kind: "pct" }]),
      table("students", "Students", [col("name", "Student", "name", 2.2), col("articles", "Articles", "int"), col("start", "Reading Lexile start", "int"), col("now", "Reading Lexile now", "int"), col("change", "Change", "signed"), col("accuracy", "Accuracy", "pct"), col("minutes", "Minutes", "int"), col("rapid", "Rapid answers", "int"), col("last", "Last read", "date")],
        r.students.map((x) => ({ name: x.name, articles: x.articles, start: num(x.lexileStart), now: num(x.lexileNow), change: num(x.change), accuracy: num(x.accuracy), minutes: num(x.minutes), rapid: num(x.rapid), last: x.lastRead }))),
      table("types", "Accuracy by question type", [col("type", "Question type", "text", 3), col("answers", "Answers", "int"), col("accuracy", "Accuracy", "pct"), col("rapid", "Rapid", "int")], r.types.map((x) => ({ type: x.name, answers: x.answers, accuracy: num(x.accuracy), rapid: x.rapid }))),
      ...rmAnalyticsTables(x).slice(1),
      { type: "notes", title: "Notes", items: [...RM_NOTES, "Minutes and rapid answers are recorded since Update 39C; older articles show no time."] },
    ], "students", [r.className]);
  }
  // readrise
  if (opts.scope === "school") {
    const d = await readRiseSchool(repo, actor, now);
    return doc(ctx, "readrise", "ReadRise Level (estimate) · school", [{ label: "Scope", value: "Whole school" }], [
      table("classes", "Classes", [col("cls", "Class", "latin", 1.2, true), col("grade", "Grade", "int"), col("students", "Students", "int"), col("placed", "Placed", "int"), col("median", "Median ReadRise Level (estimate)", "int", 1.6), col("growth", "Avg growth", "signed"), col("perWeek", "Articles / student / week", "dec"), col("goal", "Weekly goal met", "pct")],
        d.classes.map((c) => ({ cls: c.name, grade: c.grade, students: c.students, placed: c.placed, median: num(c.medianLevel), growth: num(c.avgGrowth), perWeek: num(c.perStudentPerWeek), goal: num(c.goalPct) }))),
      table("grades", "Grades", [col("grade", "Grade", "int"), col("students", "Students", "int"), col("placed", "Placed", "int"), col("median", "Median ReadRise Level (estimate)", "int", 1.6), col("band", "Grade band", "latin"), col("growth", "Avg growth", "signed"), col("goal", "Weekly goal met", "pct")],
        d.grades.map((g) => ({ grade: g.grade, students: g.students, placed: g.placed, median: num(g.medianLevel), band: `${g.band.low}–${g.band.high}`, growth: num(g.avgGrowth), goal: num(g.goalPct) }))),
      { type: "notes", title: "Notes", items: [RR_EXPORT_NOTE, "Weekly goal met = share of student-weeks (last 8 weeks) with the weekly number of articles at 75%+ on the first try."] },
    ], "classes", ["school"]);
  }
  const r = await readRiseClass(repo, actor, opts.classId!, now);
  return doc(ctx, "readrise", "ReadRise Level (estimate) · class", [{ label: "Class", value: r.className, isolate: "latin" }, { label: "Grade band", value: `${r.band.low}–${r.band.high}` }], [
    kpis("Summary", [{ label: "Placed", value: r.summary.placed, kind: "int", glance: true, hint: "students with a ReadRise Level (estimate)" }, { label: "Median ReadRise Level (estimate)", value: r.summary.medianLevel, kind: "int", glance: true, hint: "the middle student's level" }, { label: "Avg growth", value: r.summary.avgGrowth, kind: "signed", glance: true, hint: "average change since placement (+ means up)" }, { label: "Below band", value: r.summary.belowBand, kind: "int", glance: true, hint: "students below the grade band" }, { label: "Inactive 14+ days", value: r.summary.inactive, kind: "int", glance: true, hint: "students who have not read for two weeks" }]),
    table("students", "Students", [col("name", "Student", "name", 2.2), col("start", "ReadRise Level start (estimate)", "int", 1.4), col("now", "ReadRise Level now (estimate)", "int", 1.4), col("growth", "Growth", "signed"), col("runs", "Readings", "int"), col("articles", "Articles (first try)", "int"), col("firstTry", "First-try accuracy", "pct"), col("goal", "Weekly goal", "int"), col("met", "Goal weeks met", "text"), col("last", "Last activity", "date")],
      r.students.map((x) => ({ name: x.name, start: num(x.startLevel), now: num(x.level), growth: num(x.growth), runs: x.runs, articles: x.totalArticles, firstTry: num(x.firstTryAvg), goal: x.goal, met: x.placed ? `${x.goalMet} of ${x.goalWeeks}` : "—", last: x.lastActivity ? x.lastActivity.slice(0, 10) : null }))),
    { type: "notes", title: "Notes", items: [RR_EXPORT_NOTE, "First-try accuracy = average score of each article's first reading; only first tries move the level."] },
  ], "students", [r.className]);
}
