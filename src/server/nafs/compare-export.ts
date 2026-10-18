/**
 * 🇸🇦 NAFS → Reports → Compare as a file (Excel: a sheet per table · PDF: printable), like the other NAFS reports:
 * the same access as the page, rate-limited and audited. The "In one line" sentence, the 4 big numbers, the student
 * table (≤ 6 columns), the students who took only one / too little, the classes side by side, and the summary.
 */
import type { Actor } from "../auth/rbac";
import type { ReportDoc, Section } from "../../reports/model";
import { loadFonts } from "../../reports/fonts";
import { renderHtml } from "../../reports/html";
import { renderXlsx } from "../../reports/xlsx";
import { audit } from "../audit";
import { consumeRateLimit } from "../auth/rate-limit";
import { CONTENT_TYPES, loadBranding, RateLimitedError, REPORT_RATE, type ReportDeps } from "../reports/service";
import { compareAllSummary, comparePracticeSummary, compareTestsSummary, oneLineAll, oneLineUpDown, plainLine } from "../../lib/nafs-compare-summary";
import { ARROW_MARK, ARROW_NAME, ARROW_RULE, CASE_BY_KEY, CASES, nafsCompareAll, nafsComparePractice, nafsCompareTests, PRACTICE_MIN, type AllCompare, type Arrow, type ClassCompareRow, type CompareMode, type PracticeCompare, type TestsCompare } from "./compare";
import { DIFFICULTY_NAME } from "./framework";

const slug = (x: string) => x.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "nafs";
const arrowText = (a: Arrow | null) => (a ? `${ARROW_MARK[a]} ${ARROW_NAME[a]}` : "—");
const ARROW_TONES = { [arrowText("UP")]: "good", [arrowText("SAME")]: "neutral", [arrowText("DOWN")]: "bad" } as const;
const best = (x: number) => (x ? DIFFICULTY_NAME[x as 1 | 2 | 3] : "—");
type Base = Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">;

function classesTable(rows: ClassCompareRow[]): Section {
  return { type: "table", id: "classes", title: "Classes compared", sheet: "Classes", empty: "—",
    columns: [{ key: "name", label: "Class", kind: "latin", nowrap: true }, { key: "compared", label: "Students compared", kind: "int" }, { key: "before", label: "Before", kind: "pct" }, { key: "after", label: "After", kind: "pct" }, { key: "improved", label: "Went up", kind: "int" }, { key: "dropped", label: "Went down", kind: "int" }],
    rows: rows.map((c) => ({ name: c.name, compared: c.compared, before: c.before, after: c.after, improved: c.improved, dropped: c.dropped })) };
}

export function compareTestsDoc(r: TestsCompare, scope: string, base: Base, o: { classId: string | null; admin: boolean }): ReportDoc {
  const sum = compareTestsSummary(r, o);
  return {
    ...base, kind: "class", locale: "en", audience: "teacher", accent: "nafs", title: "NAFS compare: tests & booklets", subtitle: scope, primaryTable: "students", fileStem: `nafs_compare_tests_${slug(scope)}`,
    meta: [{ label: "Group", value: scope, isolate: "auto" }, { label: "Assessment 1 (before)", value: r.a?.title ?? "—", isolate: "auto" }, { label: "Assessment 2 (after)", value: r.b?.title ?? "—", isolate: "auto" }, { label: "Standards in both", value: r.shared.map((c) => c.replace("MOE.", "")).join(", ") || "—", isolate: "latin" }],
    sections: [
      { type: "explain", title: "In one line", paragraphs: [plainLine(oneLineUpDown(r))] },
      { type: "kpis", title: "At a glance", items: [
        { label: "Class average", value: `${r.avgBefore ?? "—"}% → ${r.avgAfter ?? "—"}%`, kind: "latin", glance: true },
        { label: "Went up", value: r.improved, kind: "int", glance: true, tone: "good" }, { label: "Same", value: r.same, kind: "int", glance: true }, { label: "Went down", value: r.dropped, kind: "int", glance: true, tone: r.dropped ? "bad" : "neutral" },
      ] },
      ...(r.fewShared ? [{ type: "explain" as const, title: "Careful", paragraphs: [r.shared.length ? `The two assessments share only ${r.shared.length} of ${r.shared.length + r.onlyA.length + r.onlyB.length} standards: the change uses those standards only.` : "The two assessments share no standard: the whole-test scores are compared."] }] : []),
      { type: "table", id: "students", title: "Students", sheet: "Students", empty: "No student has results in both yet.", note: ARROW_RULE,
        columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "before", label: "Before", kind: "pct" }, { key: "after", label: "After", kind: "pct" }, { key: "change", label: "Change", kind: "signed" }, { key: "arrow", label: "Up or down", kind: "text", tones: ARROW_TONES }, { key: "whole", label: "Whole test change", kind: "signed" }],
        rows: r.rows.map((x) => ({ name: x.name, before: x.before, after: x.after, change: x.change, arrow: arrowText(x.arrow), whole: x.wholeChange })) },
      { type: "table", id: "only", title: "Took only one of the two", sheet: "Only one", empty: "Everyone took both.",
        columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "took", label: "Took", kind: "text", width: 2 }, { key: "pct", label: "Score", kind: "pct" }],
        rows: r.onlyOne.map((x) => ({ name: x.name, className: x.className, took: (x.took === "A" ? r.a?.title : r.b?.title) ?? "—", pct: x.pct })) },
      { type: "table", id: "standards", title: "Standards in both", sheet: "Standards", empty: "The two share no standard.",
        columns: [{ key: "short", label: "Standard", kind: "latin", nowrap: true }, { key: "text", label: "What it measures", kind: "text", width: 3 }, { key: "before", label: "Before", kind: "pct" }, { key: "after", label: "After", kind: "pct" }, { key: "change", label: "Change", kind: "signed" }],
        rows: r.standards.map((x) => ({ short: x.short, text: x.text, before: x.before, after: x.after, change: x.change })) },
      ...(r.classes.length > 1 ? [classesTable(r.classes)] : []),
      { type: "notes", title: "Summary", items: [...sum.lines.map(plainLine), ARROW_RULE, "Fair comparison: the change uses the standards (S01–S13) both assessments have; the whole-test change is shown too."] },
    ],
  };
}

export function comparePracticeDoc(r: PracticeCompare, scope: string, base: Base, o: { classId: string | null; admin: boolean }): ReportDoc {
  const sum = comparePracticeSummary(r, o);
  return {
    ...base, kind: "class", locale: "en", audience: "teacher", accent: "nafs", title: "NAFS compare: practice", subtitle: scope, primaryTable: "students", fileStem: `nafs_compare_practice_${slug(scope)}`,
    meta: [{ label: "Group", value: scope, isolate: "auto" }, { label: "Period 1 (before)", value: `${r.a.from} → ${r.a.to}`, isolate: "latin" }, { label: "Period 2 (after)", value: `${r.b.from} → ${r.b.to}`, isolate: "latin" }],
    sections: [
      { type: "explain", title: "In one line", paragraphs: [plainLine(oneLineUpDown(r))] },
      { type: "kpis", title: "At a glance", items: [
        { label: "Accuracy", value: `${r.avgBefore ?? "—"}% → ${r.avgAfter ?? "—"}%`, kind: "latin", glance: true },
        { label: "Went up", value: r.improved, kind: "int", glance: true, tone: "good" }, { label: "Same", value: r.same, kind: "int", glance: true }, { label: "Went down", value: r.dropped, kind: "int", glance: true, tone: r.dropped ? "bad" : "neutral" },
      ] },
      { type: "table", id: "students", title: "Students", sheet: "Students", empty: "No student practised enough in both periods yet.", note: `${ARROW_RULE} Quick guesses are left out; at least ${PRACTICE_MIN} careful answers in each period.`,
        columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "acc", label: "Accuracy", kind: "latin", nowrap: true }, { key: "change", label: "Change", kind: "signed" }, { key: "arrow", label: "Up or down", kind: "text", tones: ARROW_TONES }, { key: "level", label: "Hardest level", kind: "text", nowrap: true }, { key: "mastered", label: "Mastered", kind: "latin", nowrap: true }],
        rows: r.rows.map((x) => ({ name: x.name, acc: `${x.a.pct ?? "—"}% → ${x.b.pct ?? "—"}%`, change: x.change, arrow: arrowText(x.arrow), level: `${best(x.a.best)} → ${best(x.b.best)}`, mastered: `${x.a.mastered} → ${x.b.mastered}` })) },
      { type: "table", id: "few", title: "Not enough practice to compare yet", sheet: "Too little", empty: "—",
        columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "a", label: "Answers before", kind: "int" }, { key: "b", label: "Answers after", kind: "int" }],
        rows: r.tooFew.map((x) => ({ name: x.name, className: x.className, a: x.a.answers, b: x.b.answers })) },
      ...(r.classes.length > 1 ? [classesTable(r.classes)] : []),
      { type: "notes", title: "Summary", items: [...sum.lines.map(plainLine), ARROW_RULE, "Quick guesses (under 3 seconds) and practices with more than 20% guesses are left out."] },
    ],
  };
}

export function compareAllDoc(r: AllCompare, scope: string, base: Base, o: { classId: string | null; admin: boolean }): ReportDoc {
  const sum = compareAllSummary(r, o);
  const four = CASES.slice(0, 4);
  return {
    ...base, kind: "class", locale: "en", audience: "teacher", accent: "nafs", title: "NAFS compare: tests and practice", subtitle: scope, primaryTable: "students", fileStem: `nafs_compare_all_${slug(scope)}`,
    meta: [{ label: "Group", value: scope, isolate: "auto" }, { label: "Tests", value: `${r.tests.a?.title ?? "—"} → ${r.tests.b?.title ?? "—"}`, isolate: "auto" }, { label: "Practice", value: `${r.practice.a.from}–${r.practice.a.to} → ${r.practice.b.from}–${r.practice.b.to}`, isolate: "latin" }],
    sections: [
      { type: "explain", title: "In one line", paragraphs: [plainLine(oneLineAll(r))] },
      { type: "kpis", title: "At a glance", items: four.map((c) => ({ label: c.name, value: r.counts[c.key], kind: "int" as const, glance: true })) },
      { type: "table", id: "students", title: "Students", sheet: "Students", empty: "No students.",
        columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "tests", label: "Tests", kind: "text", tones: ARROW_TONES }, { key: "practice", label: "Practice", kind: "text", tones: ARROW_TONES }, { key: "meaning", label: "What it means", kind: "text", width: 2.5 }, { key: "action", label: "What to do", kind: "text", width: 2.5 }],
        rows: r.groups.flatMap((g) => g.rows.map((x) => ({ name: x.name, tests: arrowText(x.tests), practice: arrowText(x.practice), meaning: CASE_BY_KEY.get(x.case)!.name, action: CASE_BY_KEY.get(x.case)!.action }))) },
      { type: "notes", title: "Summary", items: [...sum.lines.map(plainLine), ARROW_RULE] },
    ],
  };
}

/** The comparison as a file: same access as the page; rate-limited and audited. */
export async function exportNafsCompare(deps: ReportDeps, actor: Actor, req: { mode: CompareMode; classId?: string | null; a?: string | null; b?: string | null; from?: unknown; to?: unknown; preset?: unknown; format: "pdf" | "xlsx" }): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  const rl = await consumeRateLimit(repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));
  const { warning: _w, ...branding } = await loadBranding(repo, String(actor.schoolId), deps.brandingDir);
  const me = await repo.findUnique("User", { id: actor.userId });
  const base = { branding, generatedAt: now, generatedBy: String(me?.displayName ?? "") };
  const admin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const opts = { classId: req.classId ?? null, a: req.a ?? null, b: req.b ?? null, from: req.from, to: req.to, preset: req.preset };
  const o = { classId: req.classId ?? null, admin };
  const className = async () => (req.classId ? (await repo.findUnique("Class", { id: req.classId }))?.name : null);
  const scope = String((await className()) ?? (admin ? "All Grade 6 classes" : "All my Grade 6 classes"));
  const doc = req.mode === "practice" ? comparePracticeDoc(await nafsComparePractice(repo, actor, opts, now), scope, base, o)
    : req.mode === "all" ? compareAllDoc(await nafsCompareAll(repo, actor, opts, now), scope, base, o)
    : compareTestsDoc(await nafsCompareTests(repo, actor, opts), scope, base, o);
  let bytes: Uint8Array;
  if (req.format === "pdf") {
    if (!deps.pdf) throw new Error("PDF rendering is not configured.");
    const fonts = loadFonts(deps.fontDir);
    bytes = await deps.pdf.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
  } else bytes = renderXlsx(doc);
  await audit(repo, { actorId: actor.userId, action: "report.export", entityType: "NafsCompare", entityId: req.classId ?? "all", after: { kind: "nafs-compare", mode: req.mode, format: req.format, classId: req.classId ?? null, bytes: bytes.length }, at: now });
  return { bytes, contentType: CONTENT_TYPES[req.format], filename: `${doc.fileStem}.${req.format}` };
}
