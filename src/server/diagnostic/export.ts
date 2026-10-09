/**
 * ⬇ Diagnostic reports as files: PDF (rendered by the report engine), Excel (one sheet per table) and CSV (the
 * master table, or the student's standards). Same permissions as the pages; rate-limited and audited.
 */
import { renderCsv } from "../../reports/csv";
import { loadFonts } from "../../reports/fonts";
import { renderHtml } from "../../reports/html";
import type { ReportDoc, ReportFormat } from "../../reports/model";
import { renderXlsx } from "../../reports/xlsx";
import { audit } from "../audit";
import type { Actor } from "../auth/rbac";
import { consumeRateLimit } from "../auth/rate-limit";
import { ForbiddenError } from "../auth/rbac";
import { CONTENT_TYPES, loadBranding, RateLimitedError, REPORT_RATE, type ReportDeps } from "../reports/service";
import { classDiagnosticReport, studentDiagnosticReport, type ClassDiagnosticReport, type StudentDiagnosticReport } from "./report";
import { STRAND_LABEL, TIERS } from "./standards";

const LV: Record<string, string> = { ABOVE: "Above Level", ON: "On Level", BELOW: "Below Level" };
const slug = (x: string) => x.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";

export function classDoc(r: ClassDiagnosticReport, base: Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">): ReportDoc {
  const S = r.summary;
  return {
    ...base, kind: "class", locale: "en", title: `${r.title} — Analysis`, subtitle: r.scope, primaryTable: "students", fileStem: `diagnostic_${slug(r.scope)}_${r.date}`,
    meta: [{ label: "Grade", value: String(r.grade) }, { label: "Year", value: r.year, isolate: "latin" }, { label: "Group", value: r.scope, isolate: "auto" }, { label: "Date", value: r.date, isolate: "latin" }],
    sections: [
      { type: "kpis", title: "Executive Summary", items: [
        { label: "Assessed", value: `${S.assessed} / ${S.roster}`, kind: "latin" }, { label: "Mean score", value: S.mean, kind: "pct" }, { label: "Median", value: S.median, kind: "pct" },
        { label: "Range", value: `${S.min}% – ${S.max}%`, kind: "latin" }, { label: "Above / On / Below", value: `${S.levels.ABOVE} / ${S.levels.ON} / ${S.levels.BELOW}`, kind: "latin" }, { label: "Not taken yet", value: S.roster - S.assessed, kind: "int", tone: S.roster - S.assessed ? "warn" : "good" },
      ] },
      { type: "notes", title: "Key Findings", items: [
        ...(S.best ? [`Highest-performing standard: ${S.best.label} (${S.best.code}) at ${S.best.pct}%.`] : []),
        ...(S.focus.length ? [`Priority focus: ${S.focus.map((f) => `${f.label} (${f.code}) at ${f.pct}%`).join(" and ")}.`] : []),
        ...(S.rapidFlags ? [`${S.rapidFlags} student(s) answered many questions too fast: their score may be lower than their real level.`] : []),
      ] },
      { type: "bars", title: "Strands (class average)", items: r.strands.map((x) => ({ label: x.label, value: x.pct })), max: 100, kind: "pct" },
      { type: "table", id: "students", title: "Student Performance Master Table", sheet: "Students", empty: "No results yet.",
        columns: [{ key: "rank", label: "Pct Rank", kind: "int", width: 0.6 }, { key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "pct", label: "Overall", kind: "pct" }, { key: "level", label: "Level", kind: "text" },
          ...r.standards.map((x) => ({ key: x.code, label: x.code, kind: "pct" as const, nowrap: true })), { key: "rit", label: "MAP RIT", kind: "int" as const }, { key: "wcpm", label: "WCPM", kind: "int" as const }],
        rows: [{ rank: null, name: "Class average", className: "", pct: S.mean, level: "", ...Object.fromEntries(r.standards.map((x) => [x.code, x.pct])), rit: null, wcpm: null },
          ...r.students.map((st) => ({ rank: st.rank, name: st.name, className: st.className, pct: st.pct, level: LV[st.level], ...Object.fromEntries(r.standards.map((x) => [x.code, st.standards[x.code] ?? null])), rit: st.rit, wcpm: st.wcpm }))] },
      { type: "table", id: "standards", title: "Standards Breakdown & Action Plan", sheet: "Standards", empty: "—",
        columns: [{ key: "code", label: "Standard", kind: "latin", nowrap: true }, { key: "label", label: "Skill", kind: "text", width: 1.6 }, { key: "pct", label: "Class average", kind: "pct" }, { key: "level", label: "Performance", kind: "text" }, { key: "below50", label: "Students < 50%", kind: "int" }, { key: "plan", label: "Teaching prescription", kind: "text", width: 3 }],
        rows: [...r.standards].sort((a, b) => b.pct - a.pct).map((x) => ({ code: x.code, label: x.label, pct: x.pct, level: x.level, below50: x.below50, plan: `${x.objective} ${x.activities.join(" ")}` })) },
      { type: "table", id: "tiers", title: "Performance Tiers", sheet: "Tiers", empty: "—",
        columns: [{ key: "tier", label: "Tier", kind: "text" }, { key: "band", label: "Score band", kind: "latin" }, { key: "students", label: "Students", kind: "text", width: 2.5 }, { key: "strategy", label: "Instructional strategy", kind: "text", width: 3 }],
        rows: r.tiers.map((t) => ({ tier: `${t.name} (${t.sub})`, band: t.band, students: t.students.map((x) => `${x.name} (${x.pct}%)`).join(", ") || "—", strategy: t.strategy })) },
      { type: "table", id: "plan", title: "8-Week Support Plan (30 minutes a week)", sheet: "Support Plan", empty: "No student needs the support plan.",
        columns: [{ key: "week", label: "Week", kind: "int", width: 0.5 }, { key: "focus", label: "Focus", kind: "text", width: 1.4 }, { key: "objective", label: "Objective", kind: "text", width: 2 }, { key: "activities", label: "Activities", kind: "text", width: 3 }, { key: "students", label: "Targeted students", kind: "text", width: 2 }],
        rows: r.supportPlan.map((w) => ({ week: w.week, focus: w.code === "REVIEW" ? w.label : `${w.label} (${w.code})`, objective: w.objective, activities: w.activities.join(" • "), students: w.students.map((x) => x.name).join(", ") })) },
      { type: "table", id: "missing", title: "Not Taken Yet", sheet: "Not Taken", empty: "Everyone has taken the test.",
        columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin" }, { key: "status", label: "Status", kind: "text" }, { key: "answered", label: "Answered", kind: "int" }, { key: "action", label: "Required action", kind: "text", width: 2.5 }],
        rows: r.notTaken.map((x) => ({ ...x })) },
      { type: "table", id: "items", title: "Question Analysis", sheet: "Questions", empty: "—", note: "Questions most students missed are worth re-teaching — or reviewing.",
        columns: [{ key: "n", label: "#", kind: "int", width: 0.4 }, { key: "code", label: "Standard", kind: "latin", nowrap: true }, { key: "stem", label: "Question", kind: "text", width: 4 }, { key: "pct", label: "Correct", kind: "pct" }, { key: "answered", label: "Answers", kind: "int" }],
        rows: r.items.map((x) => ({ n: x.n, code: x.code, stem: x.stem, pct: x.pct, answered: x.answered })) },
      { type: "notes", title: "How to read this report", items: [`Levels: Above ≥ ${r.bands.above}%, On ${r.bands.on}–${r.bands.above - 1}%, Below < ${r.bands.on}%.`, `Tiers: ${TIERS.map((t) => `${t.name} ${t.min}%+`).join(" · ")}.`, "Pct Rank: the share of the group scoring lower (1–99).", "WCPM: words correct per minute in oral reading (fluency)."] },
    ],
  };
}

export function studentDoc(r: StudentDiagnosticReport, base: Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">): ReportDoc {
  return {
    ...base, kind: "student", locale: "en", title: `${r.title} — Student Report`, subtitle: r.student.name, primaryTable: "standards", fileStem: `diagnostic_${slug(r.student.number || r.student.name)}_${r.date}`,
    meta: [{ label: "Student", value: r.student.name, isolate: "auto" }, { label: "Class", value: r.student.className, isolate: "latin" }, { label: "Grade", value: String(r.grade) }, { label: "Date", value: r.date, isolate: "latin" }],
    sections: [
      { type: "kpis", title: "Result", items: [{ label: "Score", value: r.pct, kind: "pct" }, { label: "Correct", value: `${r.correct} / ${r.total}`, kind: "latin" }, { label: "Level", value: LV[r.level], kind: "latin", tone: r.level === "BELOW" ? "warn" : "good" }, ...(r.rit ? [{ label: "MAP Reading RIT", value: r.rit, kind: "int" as const }] : []), ...(r.wcpm ? [{ label: "Fluency (WCPM)", value: `${r.wcpm.value} (benchmark ${r.wcpm.benchmark})`, kind: "latin" as const }] : [])] },
      { type: "bars", title: "Strands", items: r.strands.map((x) => ({ label: STRAND_LABEL[x.strand], value: x.pct })), max: 100, kind: "pct" },
      { type: "table", id: "standards", title: "Standards", sheet: "Standards", empty: "—",
        columns: [{ key: "code", label: "Standard", kind: "latin", nowrap: true }, { key: "label", label: "Skill", kind: "text", width: 2 }, { key: "score", label: "Correct", kind: "latin" }, { key: "pct", label: "Score", kind: "pct" }, { key: "classPct", label: "Class average", kind: "pct" }, { key: "status", label: "Status", kind: "text" }],
        rows: r.standards.map((x) => ({ code: x.code, label: x.label, score: `${x.correct}/${x.total}`, pct: x.pct, classPct: x.classPct, status: x.status })) },
      { type: "notes", title: "Strengths", items: r.strengths.length ? r.strengths : ["Keep practising: strengths show as scores grow."] },
      { type: "notes", title: "Next Steps", items: r.needs.length ? r.needs.map((n) => `${n.label} (${n.code}, ${n.pct}%): ${n.objective} Try: ${n.tip}`) : ["Keep going with the curriculum plan at your level."] },
      ...(r.note ? [{ type: "notes" as const, title: "Note from the teacher", items: [r.note] }] : []),
    ],
  };
}

/** Builds the file. `studentId` → the student's report; else the class (or whole grade) analysis. */
export async function exportDiagnostic(deps: ReportDeps, actor: Actor, req: { testId: string; classId?: string | null; studentId?: string | null; format: ReportFormat }): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  const rl = await consumeRateLimit(repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));
  const { warning: _w, ...branding } = await loadBranding(repo, String(actor.schoolId), deps.brandingDir);
  const me = await repo.findUnique("User", { id: actor.userId });
  const base = { branding, generatedAt: now, generatedBy: String(me?.displayName ?? "") };
  let doc: ReportDoc;
  if (req.studentId) {
    const r = await studentDiagnosticReport(repo, actor, req.studentId, req.testId);
    if (!r) throw new ForbiddenError("Not found.");
    doc = studentDoc(r, base);
  } else doc = classDoc(await classDiagnosticReport(repo, actor, req.testId, req.classId ?? null, now), base);
  let bytes: Uint8Array;
  if (req.format === "pdf") {
    if (!deps.pdf) throw new Error("PDF rendering is not configured.");
    const fonts = loadFonts(deps.fontDir);
    bytes = await deps.pdf.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
  } else if (req.format === "xlsx") bytes = renderXlsx(doc);
  else bytes = new Uint8Array(Buffer.from(renderCsv(doc), "utf8"));
  await audit(repo, { actorId: actor.userId, action: "report.export", entityType: req.studentId ? "Student" : "DiagnosticTest", entityId: req.studentId ?? req.testId, after: { kind: "diagnostic", format: req.format, classId: req.classId ?? null, bytes: bytes.length }, at: now });
  return { bytes, contentType: CONTENT_TYPES[req.format], filename: `${doc.fileStem}.${req.format}` };
}
