/**
 * ⬇ Diagnostic reports as files: PDF (rendered by the report engine), Excel (one sheet per table) and CSV (the
 * master table, or the student's standards). Same permissions as the pages; rate-limited and audited.
 */
import { renderCsv } from "../../reports/csv";
import { loadFonts } from "../../reports/fonts";
import { renderHtml } from "../../reports/html";
import type { ReportDoc, ReportFormat, Tone } from "../../reports/model";
import { renderXlsx } from "../../reports/xlsx";
import { audit } from "../audit";
import type { Actor } from "../auth/rbac";
import { consumeRateLimit } from "../auth/rate-limit";
import { ForbiddenError } from "../auth/rbac";
import { CONTENT_TYPES, loadBranding, RateLimitedError, REPORT_RATE, type ReportDeps } from "../reports/service";
import { classDiagnosticReport, studentDiagnosticReport, type ClassDiagnosticReport, type StudentDiagnosticReport } from "./report";
import { STRAND_LABEL, TIERS } from "./standards";

const LV: Record<string, string> = { ABOVE: "Above Level", ON: "On Level", BELOW: "Below Level" };
const SHORT: Record<string, string> = { ABOVE: "Above", ON: "On", BELOW: "Below" };
/** Colour + text for levels and statuses (the PDF adds a colour key under each table). */
const LEVEL_TONES: Record<string, Tone> = { Above: "good", On: "info", Below: "bad", "Above Level": "good", "On Level": "info", "Below Level": "bad" };
const PERF_TONES: Record<string, Tone> = { Strength: "good", Moderate: "info", Approaching: "warn", "Priority Need": "bad", Developing: "warn", "Needs support": "bad" };
const slug = (x: string) => x.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";

export function classDoc(r: ClassDiagnosticReport, base: Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">): ReportDoc {
  const S = r.summary;
  // adaptive: scores are 0–100 against the grade (not % correct)
  const P = (r.adaptive ? "dec" : "pct") as "dec" | "pct";
  const u = r.adaptive ? "" : "%";
  return {
    ...base, kind: "class", locale: "en", audience: "teacher", title: `${r.title} — Analysis`, subtitle: r.scope, primaryTable: "students", fileStem: `diagnostic_${slug(r.scope)}_${r.date}`,
    meta: [{ label: "Grade", value: String(r.grade) }, { label: "Year", value: r.year, isolate: "latin" }, { label: "Group", value: r.scope, isolate: "auto" }, { label: "Date", value: r.date, isolate: "latin" }],
    sections: [
      { type: "kpis", title: "Executive Summary", items: [
        { label: "Assessed", value: `${S.assessed} / ${S.roster}`, kind: "latin", glance: true, hint: "students who took the test / students in the group" }, { label: "Mean score", value: S.mean, kind: P, glance: true, hint: r.adaptive ? "average score on the grade scale (72.5 = on grade level)" : "average share of questions answered correctly" }, { label: "Median", value: S.median, kind: P },
        { label: "Range", value: `${S.min}${u} – ${S.max}${u}`, kind: "latin" }, { label: "Spread (SD)", value: S.sd === null ? "—" : `±${S.sd}`, kind: "latin" }, { label: "Above / On / Below", value: `${S.levels.ABOVE} / ${S.levels.ON} / ${S.levels.BELOW}`, kind: "latin", glance: true, hint: "students above, on and below grade level" }, { label: "Not taken yet", value: S.roster - S.assessed, kind: "int", tone: S.roster - S.assessed ? "warn" : "good", glance: true, hint: "students who still need to take the test" },
      ] },
      { type: "notes", title: "Key Findings", items: [
        ...(S.best ? [`Highest-performing standard: ${S.best.label} (${S.best.code}) at ${S.best.pct}${u}.`] : []),
        ...(S.focus.length ? [`Priority focus: ${S.focus.map((f) => `${f.label} (${f.code}) at ${f.pct}${u}`).join(" and ")}.`] : []),
        ...(r.adaptive ? ["Adaptive test: every student answered the same 50 skills, each at their own difficulty. Scores are on one scale against the grade: 72.5 = on grade level, 25 points = one grade."] : []),
        ...(S.sd !== null ? [`Spread: standard deviation ±${S.sd} — ${S.spread}`] : []),
        ...(S.rapidFlags ? [`${S.rapidFlags} student(s) answered many questions too fast: their score may be lower than their real level.`] : []),
      ] },
      { type: "bars", title: "Strands (class average)", items: r.strands.map((x) => ({ label: x.label, value: x.pct })), max: 100, kind: r.adaptive ? "int" : "pct" },
      { type: "table", id: "students", title: "Student Performance Master Table", sheet: "Students", empty: "No results yet.",
        columns: [{ key: "rank", label: "Rank", kind: "int", width: 0.55 }, { key: "name", label: "Student", kind: "name", width: 2.4 }, ...(r.classId ? [] : [{ key: "className", label: "Class", kind: "latin" as const, nowrap: true, width: 0.8 }]), { key: "pct", label: "Score", kind: P, width: 0.75, nowrap: true }, { key: "level", label: "Level", kind: "text", width: 0.95, nowrap: true, tones: LEVEL_TONES },
          ...(r.adaptive ? [{ key: "reading", label: "Reads at", kind: "latin" as const, nowrap: true, width: 0.9 }] : []),
          ...r.standards.map((x) => ({ key: x.code, label: x.code, kind: P, nowrap: true, width: 0.62 })), ...(r.adaptive ? [{ key: "est", label: "Est. RIT", kind: "int" as const, width: 0.62, nowrap: true }] : []), { key: "rit", label: "RIT", kind: "int" as const, width: 0.6, nowrap: true }, { key: "wcpm", label: "WCPM", kind: "int" as const, width: 0.62, nowrap: true }],
        rows: [{ rank: null, name: "Class average", className: "", pct: S.mean, level: "", reading: "", ...Object.fromEntries(r.standards.map((x) => [x.code, x.pct])), est: null, rit: null, wcpm: null },
          ...r.students.map((st) => ({ rank: st.rank, name: st.name, className: st.className, pct: st.pct, level: SHORT[st.level], reading: (st.readingLevel ?? "").replace("Grade ", "Gr "), ...Object.fromEntries(r.standards.map((x) => [x.code, st.standards[x.code] ?? null])), est: st.ritEstimate, rit: st.rit, wcpm: st.wcpm }))] },
      { type: "table", id: "standards", title: "Standards Breakdown & Action Plan", sheet: "Standards", empty: "—",
        columns: [{ key: "code", label: "Standard", kind: "latin", nowrap: true }, { key: "label", label: "Skill", kind: "text", width: 1.6 }, { key: "pct", label: "Class average", kind: P }, { key: "level", label: "Performance", kind: "text", tones: PERF_TONES }, { key: "below50", label: `Students < 50${u}`, kind: "int" }, { key: "plan", label: "Teaching prescription", kind: "text", width: 3 }],
        rows: [...r.standards].sort((a, b) => b.pct - a.pct).map((x) => ({ code: x.code, label: x.label, pct: x.pct, level: x.level, below50: x.below50, plan: `${x.objective} ${x.activities.join(" ")}` })) },
      { type: "table", id: "tiers", title: "Performance Tiers", sheet: "Tiers", empty: "—",
        columns: [{ key: "tier", label: "Tier", kind: "text" }, { key: "band", label: "Score band", kind: "latin" }, { key: "students", label: "Students", kind: "text", width: 2.5 }, { key: "strategy", label: "Instructional strategy", kind: "text", width: 3 }],
        rows: r.tiers.map((t) => ({ tier: `${t.name} (${t.sub})`, band: t.band, students: t.students.map((x) => `${x.name} (${x.pct}${u})`).join(", ") || "—", strategy: t.strategy })) },
      { type: "table", id: "plan", title: "8-Week Support Plan (30 minutes a week)", sheet: "Support Plan", empty: "No student needs the support plan.",
        columns: [{ key: "week", label: "Week", kind: "int", width: 0.5 }, { key: "focus", label: "Focus", kind: "text", width: 1.4 }, { key: "objective", label: "Objective", kind: "text", width: 2 }, { key: "activities", label: "Activities", kind: "text", width: 3 }, { key: "students", label: "Targeted students", kind: "text", width: 2 }],
        rows: r.supportPlan.map((w) => ({ week: w.week, focus: w.code === "REVIEW" ? w.label : `${w.label} (${w.code})`, objective: w.objective, activities: w.activities.join(" • "), students: w.students.map((x) => x.name).join(", ") })) },
      { type: "table", id: "missing", title: "Not Taken Yet", sheet: "Not Taken", empty: "Everyone has taken the test.",
        columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin" }, { key: "status", label: "Status", kind: "text" }, { key: "answered", label: "Answered", kind: "int" }, { key: "action", label: "Required action", kind: "text", width: 2.5 }],
        rows: r.notTaken.map((x) => ({ ...x })) },
      { type: "table", id: "items", title: "Question Analysis", sheet: "Questions", empty: "—", note: "Questions most students missed are worth re-teaching — or reviewing.",
        columns: [{ key: "n", label: "#", kind: "int", width: 0.4 }, { key: "code", label: "Standard", kind: "latin", nowrap: true }, { key: "stem", label: "Question", kind: "text", width: 4 }, { key: "pct", label: "Correct", kind: "pct" }, { key: "answered", label: "Answers", kind: "int" }],
        rows: r.items.map((x) => ({ n: x.n, code: x.code, stem: x.stem, pct: x.pct, answered: x.answered })) },
      ...(r.growth ? [{ type: "table" as const, id: "growth", title: "Growth: Diagnostic → MAP", sheet: "Growth", empty: "No MAP test after the Diagnostic yet.",
        note: r.growth.offset !== null ? `MAP was ${r.growth.offset >= 0 ? "+" : ""}${r.growth.offset} RIT from the Diagnostic estimate (median of ${r.growth.pairs} students); the start is calibrated by it.` : "The start is calibrated once 5 students have a MAP test after the Diagnostic.",
        columns: [{ key: "name", label: "Student", kind: "name" as const, width: 2 }, { key: "start", label: "Diagnostic (est.)", kind: "int" as const }, { key: "calibrated", label: "Start (calibrated)", kind: "int" as const }, { key: "maps", label: "MAP tests", kind: "latin" as const, width: 2.5 }, { key: "growth", label: "Growth", kind: "signed" as const }],
        rows: r.growth.rows.filter((x) => x.maps.length).map((x) => ({ name: x.name, start: x.start, calibrated: x.calibrated, maps: x.maps.map((m) => `${m.term}: ${m.rit}`).join(" → "), growth: x.growth })) }] : []),
      { type: "notes", title: "How to read this report", items: [`Levels: Above ≥ ${r.bands.above}${u}, On ${r.bands.on}–${r.bands.above - 1}${u}, Below < ${r.bands.on}${u}.`, `Tiers: ${TIERS.map((t) => `${t.name} ${t.min}${u}+`).join(" · ")}.`, ...(r.adaptive ? ["Reads at: the student's reading level on the grade scale (Gr 5.3 = like a Grade 5 student early in the year). Est. RIT: the MAP Reading RIT the Diagnostic predicts."] : []), "Pct Rank: the share of the group scoring lower (1–99).", "WCPM: words correct per minute in oral reading (fluency)."] },
    ],
  };
}

export function studentDoc(r: StudentDiagnosticReport, base: Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">): ReportDoc {
  const P = (r.adaptive ? "dec" : "pct") as "dec" | "pct";
  const u = r.adaptive ? "" : "%";
  return {
    ...base, kind: "student", locale: "en", audience: "family", title: `${r.title} — Student Report`, subtitle: r.student.name, primaryTable: "standards", fileStem: `diagnostic_${slug(r.student.number || r.student.name)}_${r.date}`,
    meta: [{ label: "Student", value: r.student.name, isolate: "auto" }, { label: "Class", value: r.student.className, isolate: "latin" }, { label: "Grade", value: String(r.grade) }, { label: "Date", value: r.date, isolate: "latin" }],
    sections: [
      { type: "kpis", title: "Result", items: [{ label: r.adaptive ? "Score (0–100)" : "Score", value: r.pct, kind: P, glance: true, hint: r.adaptive ? "72.5 = on grade level; 25 points = one grade" : "share of questions answered correctly" }, r.adaptive ? { label: "Reads at", value: r.readingLevel ?? "—", kind: "latin", glance: true, hint: "reading level on the grade scale (Gr 5.3 = like a Grade 5 student early in the year)" } : { label: "Correct", value: `${r.correct} / ${r.total}`, kind: "latin", glance: true, hint: "questions answered correctly" }, { label: "Level", value: LV[r.level], kind: "latin", tone: r.level === "BELOW" ? "warn" : "good", glance: true, hint: "compared with the grade's expectations" }, ...(r.rit ? [{ label: "MAP Reading RIT", value: r.rit, kind: "int" as const }] : r.ritEstimate ? [{ label: "Estimated MAP RIT", value: r.ritEstimate, kind: "int" as const }] : []), ...(r.wcpm ? [{ label: `Fluency · words/min (goal ${r.wcpm.benchmark})`, value: r.wcpm.value, kind: "int" as const, tone: (r.wcpm.value >= r.wcpm.benchmark ? "good" : r.wcpm.value >= r.wcpm.benchmark * 0.75 ? "warn" : "bad") as "good" | "warn" | "bad" }] : [])] },
      { type: "bars", title: "Strands", items: r.strands.map((x) => ({ label: STRAND_LABEL[x.strand], value: x.pct })), max: 100, kind: r.adaptive ? "int" : "pct" },
      ...(r.areas.length ? [{ type: "table" as const, id: "areas", title: "MAP Goal Areas", sheet: "MAP Areas", empty: "—", columns: [{ key: "name", label: "Goal area", kind: "latin" as const, width: 2 }, { key: "score", label: "Score", kind: "dec" as const }, { key: "reading", label: "Reads at", kind: "latin" as const }], rows: r.areas.map((a) => ({ name: a.name, score: a.score, reading: a.readingLevel })) }] : []),
      { type: "table", id: "standards", title: "Standards", sheet: "Standards", empty: "—",
        columns: [{ key: "code", label: "Standard", kind: "latin", nowrap: true }, { key: "label", label: "Skill", kind: "text", width: 2 }, { key: "score", label: r.adaptive ? "Reads at" : "Correct", kind: "latin" }, { key: "pct", label: "Score", kind: P }, { key: "classPct", label: "Class average", kind: P }, { key: "status", label: "Status", kind: "text", width: 1.3, tones: PERF_TONES }],
        rows: r.standards.map((x) => ({ code: x.code, label: x.label, score: r.adaptive ? x.readingLevel ?? "—" : `${x.correct}/${x.total}`, pct: x.pct, classPct: x.classPct, status: x.status })) },
      { type: "notes", title: "Strengths", items: r.strengths.length ? r.strengths : ["Keep practising: strengths show as scores grow."] },
      { type: "notes", title: "Next Steps", items: r.needs.length ? r.needs.map((n) => `${n.label} (${n.code}, ${n.pct}${u}): ${n.objective} Try: ${n.tip}`) : ["Keep going with the curriculum plan at your level."] },
      ...(r.note ? [{ type: "notes" as const, title: "Note from the teacher", items: [r.note] }] : []),
      { type: "explain" as const, tone: "info" as const, title: "What this means", paragraphs: [
        `This test shows where ${r.student.name} is now in reading and language, so the teacher can plan the right next steps. It is a starting point, not a final grade.`,
        `Level: ${LV[r.level]}. “Strength” means the student already does this well; “Developing” means they are learning it; “Needs support” means the teacher will practise it more with them.`,
      ] },
      { type: "explain" as const, tone: "home" as const, title: "How you can help at home", items: [
        "Read together in English for 15 minutes on most days, and ask “What happened?” and “Why?” about the text.",
        "Pick one of the Next Steps above and practise it a little each day.",
        "Encourage careful answers: reading every choice before answering matters more than speed.",
        "Questions? Contact the class teacher.",
      ] },
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
