/**
 * Excel exports built outside the ReportDoc engine (students dashboard, alerts, department week, MAP class matrix),
 * in the shared document design: frozen header row with filters, column widths, real numbers and dates, colour fills
 * that always keep their words, shaded rows, in-cell bars for percentages, page numbers when printed, and a
 * "Read me" sheet that explains every column.
 *
 * The `…Rows` functions are the exact table each route wrote before the redesign (same columns, same values);
 * the `…Workbook` functions only add the design. A test compares the two.
 */
import { readMeSheet, workbookXlsx, type Sheet, type SheetColumnKind, type SheetTone } from "../../imports/questions/template-files";
import type { ClassProgress } from "../insights/progress";
import type { alertList } from "../insights/alerts";
import type { DeptSummary } from "../insights/department";
import type { classMatrix } from "../map/map-more";
import { GROUPS } from "../map/map-plan";

type AlertRows = Awaited<ReturnType<typeof alertList>>;
type Matrix = Awaited<ReturnType<typeof classMatrix>>;
type Subject = "READING" | "LANGUAGE";

/** Column spec: header, format, width, meaning (for the Read me sheet), optional colour fills and in-cell bar. */
type Col = { h: string; k?: SheetColumnKind; w: number; m: string; tones?: Record<string, SheetTone>; bar?: boolean };

function designed(name: string, cols: Col[], rows: string[][]): Sheet {
  const tones: Record<number, Record<string, SheetTone>> = {};
  cols.forEach((c, i) => { if (c.tones) tones[i] = c.tones; });
  return {
    name, rows, headerStyle: true, freeze: true, report: true,
    widths: cols.map((c) => c.w), kinds: cols.map((c) => c.k), tones,
    bars: cols.map((c, i) => (c.bar ? i : -1)).filter((i) => i >= 0),
  };
}
const readMe = (title: string, intro: string[], sheets: { sheet: string; cols: Col[] }[]) => {
  const legend = new Map<string, [SheetTone, string]>();
  for (const s of sheets) for (const c of s.cols) for (const [v, tone] of Object.entries(c.tones ?? {})) legend.set(v, [tone, `${c.h}: ${v}`]);
  return readMeSheet(title, intro, sheets.flatMap((s) => s.cols.map((c): [string, string] => [sheets.length > 1 ? `${s.sheet} · ${c.h}` : c.h, c.m])), [...legend].map(([v, [tone, m]]) => [v, tone, m]));
};

// ------------------------------------------------------------------ 📈 students dashboard

const STATUS_TONES: Record<string, SheetTone> = { "ON TRACK": "good", MET: "good", "AT RISK": "warn", MISSED: "bad", "NO DATA": "neutral" };
/** the level as staff read it (the stored BELOW / ON / ABOVE stay as they are) */
const LEVEL_WORD: Record<string, string> = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };
const LEVEL_TONES: Record<string, SheetTone> = { ABOVE: "good", ON: "info", BELOW: "bad", Exceeding: "good", Meeting: "info", Approaching: "bad" };
const PLAN_TONES: Record<string, SheetTone> = { INTENSIVE: "bad", TARGETED: "warn", CORE: "good" };

const PROGRESS_COLS: Col[] = [
  { h: "Student", w: 30, m: "The student's name." },
  { h: "Student ID", w: 14, m: "The school's student number." },
  { h: "Status", w: 13, m: "Progress towards the MAP spring target: ON TRACK, AT RISK, MET, MISSED or NO DATA.", tones: STATUS_TONES },
  { h: "Why", w: 40, m: "The reason for the status, in words." },
  { h: "Level", w: 12, m: "The student's confirmed overall level (Approaching / Meeting / Exceeding).", tones: LEVEL_TONES },
  { h: "Answers", k: "int", w: 10, m: "Practice questions answered." },
  { h: "Correct", k: "int", w: 10, m: "Of those, answered correctly." },
  { h: "Accuracy %", k: "int", w: 11, m: "Correct ÷ answers × 100 (the bar shows it from 0 to 100).", bar: true },
  { h: "Skills mastered", k: "int", w: 10, m: "Skills at Mastered." },
  { h: "Skills needing work", k: "int", w: 11, m: "Skills below Proficient with enough answers." },
  { h: "Minutes this week", k: "int", w: 10, m: "Practice minutes this week." },
  { h: "Minutes this month", k: "int", w: 10, m: "Practice minutes this month." },
  { h: "Minutes total", k: "int", w: 10, m: "All practice minutes." },
  { h: "Tasks done", k: "int", w: 9, m: "Assignments completed." },
  { h: "Tasks pending", k: "int", w: 9, m: "Assignments not finished yet (not late)." },
  { h: "Tasks late", k: "int", w: 9, m: "Assignments past their due date." },
  { h: "Last active", k: "date", w: 12, m: "The last day the student practised." },
  { h: "MAP Fall RIT", k: "int", w: 10, m: "The fall MAP Growth RIT score (official, as imported)." },
  { h: "MAP latest RIT", k: "int", w: 10, m: "The latest MAP Growth RIT score." },
  { h: "Latest term", w: 12, m: "The term of the latest MAP test." },
  { h: "Spring target", k: "int", w: 10, m: "The spring RIT target (fall RIT + projected growth)." },
  { h: "Growth needed", k: "int", w: 10, m: "RIT points still needed to reach the target." },
  { h: "Plan", w: 12, m: "Support intensity: INTENSIVE, TARGETED or CORE.", tones: PLAN_TONES },
  { h: "Weakest goal areas", w: 40, m: "The MAP goal areas to focus on first." },
];

export function progressRows(v: ClassProgress): string[][] {
  const head = ["Student", "Student ID", "Status", "Why", "Level", "Answers", "Correct", "Accuracy %", "Skills mastered", "Skills needing work", "Minutes this week", "Minutes this month", "Minutes total", "Tasks done", "Tasks pending", "Tasks late", "Last active", "MAP Fall RIT", "MAP latest RIT", "Latest term", "Spring target", "Growth needed", "Plan", "Weakest goal areas"];
  const rows = v.rows.map((r) => [r.name, r.number, r.status.replace("_", " "), r.statusWhy, r.level ? LEVEL_WORD[r.level] ?? r.level : "", String(r.practice.answers), String(r.practice.correct), r.practice.accuracy === null ? "" : String(r.practice.accuracy), String(r.mastered), String(r.needsWork), String(r.practice.week.minutes), String(r.practice.month.minutes), String(r.practice.totalMinutes), String(r.work.done), String(r.work.pending), String(r.work.late), r.practice.lastActive?.slice(0, 10) ?? "", String(r.map?.fall?.rit ?? ""), String(r.map?.latest?.rit ?? ""), r.map?.latest?.term ?? "", String(r.map?.springTarget ?? ""), String(r.map?.gap ?? ""), r.intensity ?? "", r.weakest.join(", ")]);
  return [head, ...rows];
}

export function progressWorkbook(v: ClassProgress): Uint8Array {
  const name = v.className.slice(0, 30) || "Class";
  return workbookXlsx([
    designed(name, PROGRESS_COLS, progressRows(v)),
    readMe(`Students dashboard · ${v.className} · ${v.subject === "LANGUAGE" ? "Language" : "Reading"}`, ["One row per student, with every column of the Students dashboard.", "Filter the Status or Plan column to find who needs help first."], [{ sheet: name, cols: PROGRESS_COLS }]),
  ]);
}

// ------------------------------------------------------------------ 🚨 alerts

const ALERT_COLS: Col[] = [
  { h: "Date", k: "date", w: 12, m: "When the alert was raised." },
  { h: "Student", w: 28, m: "The student's name." },
  { h: "Class", w: 12, m: "The student's class." },
  { h: "Reason", w: 24, m: "Why the platform raised the alert." },
  { h: "Details", w: 60, m: "What the platform saw, in words." },
  { h: "Status", w: 14, m: "Not handled (still open) or Handled.", tones: { "Not handled": "bad", Handled: "good" } },
  { h: "What was done", w: 40, m: "The action the teacher recorded." },
  { h: "By", w: 22, m: "Who handled it." },
  { h: "Handled on", k: "date", w: 12, m: "When it was handled." },
  { h: "Days open", k: "int", w: 10, m: "Days since the alert was raised (open alerts only)." },
];

export function alertsRows(rows: AlertRows): string[][] {
  const head = ["Date", "Student", "Class", "Reason", "Details", "Status", "What was done", "By", "Handled on", "Days open"];
  const data = rows.map((r) => [r.createdAt.slice(0, 10), r.name, r.className, r.title, r.detail, r.status === "OPEN" ? "Not handled" : "Handled", r.action ?? "", r.handledBy ?? "", r.handledAt?.slice(0, 10) ?? "", r.status === "OPEN" ? String(r.ageDays) : ""]);
  return [head, ...data];
}

export function alertsWorkbook(rows: AlertRows): Uint8Array {
  return workbookXlsx([
    designed("Alerts", ALERT_COLS, alertsRows(rows)),
    readMe("Student alerts", ["Every student alert with what was done about it.", "Sort by Days open to see the oldest open alerts first."], [{ sheet: "Alerts", cols: ALERT_COLS }]),
  ]);
}

// ------------------------------------------------------------------ 🏫 department week

const DEPT_COLS: Col[] = [
  { h: "Grade", k: "int", w: 8, m: "The grade." },
  { h: "Class", w: 12, m: "The class." },
  { h: "Teacher", w: 24, m: "The class teacher." },
  { h: "Students", k: "int", w: 10, m: "Students in the class." },
  { h: "Practised this week", k: "int", w: 12, m: "Students who practised this week." },
  { h: "Practised %", k: "int", w: 11, m: "Practised this week ÷ students × 100.", bar: true },
  { h: "Answers this week", k: "int", w: 11, m: "Practice answers this week." },
  { h: "Minutes this week", k: "int", w: 11, m: "Practice minutes this week." },
  { h: "Accuracy %", k: "int", w: 11, m: "Share of this week's answers that were right.", bar: true },
  { h: "Tasks done", k: "int", w: 9, m: "Assignments completed." },
  { h: "Late", k: "int", w: 8, m: "Assignments past their due date." },
  { h: "MAP tested", k: "int", w: 10, m: "Students with a MAP Growth result." },
  { h: "On track", k: "int", w: 9, m: "Students on track for their MAP spring target." },
  { h: "At risk", k: "int", w: 9, m: "Students at risk of missing it." },
  { h: "Alerts open", k: "int", w: 9, m: "Student alerts not handled yet." },
  { h: "Alerts handled", k: "int", w: 10, m: "Student alerts handled." },
  { h: "Oldest open (days)", k: "int", w: 11, m: "Age of the oldest open alert." },
];
const WEAK_COLS: Col[] = [
  { h: "Grade", k: "int", w: 8, m: "The grade." },
  { h: "Skill", w: 40, m: "One of the grade's hardest skills this week." },
  { h: "Accuracy %", k: "int", w: 12, m: "Share of answers that were right.", bar: true },
  { h: "Answers", k: "int", w: 10, m: "Answers to this skill." },
  { h: "Students", k: "int", w: 10, m: "Students who answered it." },
];

export function departmentRows(d: DeptSummary): { classes: string[][]; weak: string[][] } {
  const head = ["Grade", "Class", "Teacher", "Students", "Practised this week", "Practised %", "Answers this week", "Minutes this week", "Accuracy %", "Tasks done", "Late", "MAP tested", "On track", "At risk", "Alerts open", "Alerts handled", "Oldest open (days)"];
  const rows = d.classes.map((c) => [String(c.grade), c.className, c.teacher, String(c.students), String(c.activeWeek), String(c.activePct), String(c.answersWeek), String(c.minutesWeek), c.accuracy === null ? "" : String(c.accuracy), String(c.done), String(c.late), String(c.tested), String(c.onTrack), String(c.atRisk), String(c.alertsOpen), String(c.alertsHandled), c.oldestOpenDays === null ? "" : String(c.oldestOpenDays)]);
  const weak = [["Grade", "Skill", "Accuracy %", "Answers", "Students"], ...d.weakest.flatMap((g) => g.skills.map((k) => [String(g.grade), k.name, String(k.accuracy), String(k.answers), String(k.students)]))];
  return { classes: [head, ...rows], weak };
}

export function departmentWorkbook(d: DeptSummary): Uint8Array {
  const r = departmentRows(d);
  return workbookXlsx([
    designed(`Week ${d.week}`, DEPT_COLS, r.classes),
    designed("Hardest skills", WEAK_COLS, r.weak),
    readMe(`Department week ${d.week}`, ["Sheet 1: one row per class for this week. Sheet 2: the hardest skills of each grade."], [{ sheet: `Week ${d.week}`, cols: DEPT_COLS }, { sheet: "Hardest skills", cols: WEAK_COLS }]),
  ]);
}

// ------------------------------------------------------------------ 🗺️ MAP class matrix

const DESCRIPTOR_TONES: Record<string, SheetTone> = { Low: "bad", LoAvg: "warn", Avg: "info", HiAvg: "good", High: "good" };
const AREA_TONES: Record<string, SheetTone> = { FOCUS: "bad", MAINTAIN: "info", EXTEND: "good" };

function matrixCols(subject: Subject): Col[] {
  const groups = GROUPS.filter((g) => g.subject === subject);
  return [
    { h: "Student", w: 30, m: "The student's name." },
    { h: "Student ID", w: 14, m: "The school's student number." },
    { h: "Term", w: 12, m: "The MAP term of the result." },
    { h: "RIT", k: "int", w: 8, m: "MAP Growth RIT score (official, as imported)." },
    { h: "Band", w: 10, m: "The RIT band." },
    { h: "Percentile", k: "int", w: 11, m: "NWEA achievement percentile (1–99).", bar: true },
    { h: "Descriptor", w: 11, m: "Low (<21st), LoAvg (21–40), Avg (41–60), HiAvg (61–80), High (>80th percentile).", tones: DESCRIPTOR_TONES },
    { h: "Fall RIT", k: "int", w: 9, m: "The fall RIT." },
    { h: "Spring goal", k: "int", w: 10, m: "The projected spring RIT." },
    { h: "Now (estimate)", k: "int", w: 11, m: "The platform's estimate of the RIT now (not an official score)." },
    { h: "Rapid guessing %", k: "int", w: 11, m: "Share of the MAP test answered too fast (30%+ suggests a retest)." },
    { h: "Retest?", w: 9, m: "yes = consider a retest.", tones: { yes: "warn" } },
    ...groups.flatMap((g): Col[] => [
      { h: `${g.name} RIT`, k: "int", w: 10, m: `${g.name}: goal-area RIT.` },
      { h: `${g.name} band`, w: 10, m: `${g.name}: goal-area RIT band.` },
      { h: `${g.name} descriptor`, w: 11, m: `${g.name}: Low … High.`, tones: DESCRIPTOR_TONES },
      { h: `${g.name} status`, w: 11, m: `${g.name}: FOCUS (teach first), MAINTAIN or EXTEND.`, tones: AREA_TONES },
    ]),
    { h: "Plan", w: 14, m: "The student's MAP plan." },
  ];
}

export function mapMatrixRows(v: Matrix, subject: Subject): string[][] {
  const groups = GROUPS.filter((g) => g.subject === subject);
  const head = ["Student", "Student ID", "Term", "RIT", "Band", "Percentile", "Descriptor", "Fall RIT", "Spring goal", "Now (estimate)", "Rapid guessing %", "Retest?", ...groups.flatMap((g) => [`${g.name} RIT`, `${g.name} band`, `${g.name} descriptor`, `${g.name} status`]), "Plan"];
  const rows = v.rows.map((r) => { const o = r.profile.overall; return [r.name, r.number, r.profile.term ?? "", String(o?.rit ?? ""), o?.band ?? "", String(o?.percentile ?? ""), o?.descriptor ?? "", String(r.profile.fall?.rit ?? ""), String(r.profile.fall?.projection ?? ""), String(r.estimate ?? ""), String(o?.rapidGuessPct ?? ""), r.retest ? "yes" : "", ...groups.flatMap((g) => { const a = r.profile.areas.find((x) => x.group === g.key); return [String(a?.rit ?? ""), a?.band ?? "", a?.descriptor ?? "", a?.status ?? ""]; }), r.plan ?? ""]; });
  return [head, ...rows];
}

export function mapMatrixWorkbook(v: Matrix, subject: Subject): Uint8Array {
  const name = `${v.className}`.slice(0, 30) || "Class";
  const cols = matrixCols(subject);
  return workbookXlsx([
    designed(name, cols, mapMatrixRows(v, subject)),
    readMe(`MAP class matrix · ${v.className} · ${subject === "LANGUAGE" ? "Language Usage" : "Reading"}`, ["MAP Growth values are shown exactly as imported from NWEA.", "Filter a status column on FOCUS to form a teaching group."], [{ sheet: name, cols }]),
  ]);
}
