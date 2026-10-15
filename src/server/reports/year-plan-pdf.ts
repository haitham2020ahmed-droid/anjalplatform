/**
 * 🗓️ The MAP Year plan as a PDF for the administration (owner r68 §C): the shared report look (school header, "Prepared
 * for" the school, MAP green), key figures on the cover (class, grade, teacher, weeks, shared skills covered, students),
 * the 40-week table (week · dates · new skills · review · goal areas), the skills table (skill · code · goal area · weeks ·
 * students who need it · students who mastered it ⭐) and the legend. Rate-limited and audited like every download.
 */
import type { Actor } from "../auth/rbac";
import { audit } from "../audit";
import { consumeRateLimit } from "../auth/rate-limit";
import { loadFonts } from "../../reports/fonts";
import { renderHtml } from "../../reports/html";
import type { ReportDoc } from "../../reports/model";
import { RateLimitedError, REPORT_RATE, loadBranding, type ReportDeps } from "./service";
import { yearPlanReport } from "../map/year-plan-share";

const ascii = (v: string) => v.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "class";

/** The report document (also used by the tests: the PDF renderer needs Chromium). */
export async function yearPlanDoc(deps: Pick<ReportDeps, "repo" | "brandingDir" | "now">, actor: Actor, classId: string): Promise<ReportDoc> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  const r = await yearPlanReport(repo, actor, classId, now);
  const v = r.view;
  const { warning: _w, ...branding } = await loadBranding(repo, String(actor.schoolId), deps.brandingDir);
  const first = v.weeks[0], last = v.weeks[v.weeks.length - 1];
  return {
    kind: "class", locale: "en", accent: "map", audience: "school", links: true,
    title: "MAP Year plan", subtitle: `${v.className} · Grade ${v.grade} · ${first ? `${first.from} → ${last.to}` : ""}`,
    branding,
    meta: [
      { label: "Class", value: v.className, isolate: "auto" }, { label: "Grade", value: String(v.grade) }, { label: "Teacher", value: r.teacher, isolate: "auto" },
      { label: "Weeks", value: `${v.weeks.length} school weeks (Sunday → Thursday)` }, { label: "Sent to students", value: r.sentAt ? r.sentAt.slice(0, 10) : "Not yet" },
    ],
    sections: [
      { type: "kpis", title: "At a glance", items: [
        { label: "Shared skills in the plan", value: `${v.summary.covered} / ${v.summary.shared}`, kind: "latin", glance: true, hint: "Skills most of the class needs (MAP scores and the Learning Continuum) that the plan covers." },
        { label: "Students", value: v.summary.students, kind: "int", glance: true },
        { label: "Students with MAP scores", value: Math.max(v.summary.tested.READING, v.summary.tested.LANGUAGE), kind: "int", glance: true },
        { label: "Skills in the plan", value: v.summary.inPlan, kind: "int", glance: true },
      ] },
      { type: "explain", title: "How the plan was made", tone: "info", items: [
        "Each student's MAP RIT in every goal area gives the skills they need now (Develop) and should secure (Reinforce).",
        "A skill enters the plan when most of the class needs it and it suits the class's RIT range.",
        "Easiest skills first, goal areas mixed; 2–3 skills a week, with spiral review weeks.",
        v.summary.weakAreas.length ? `Most shared needs: ${v.summary.weakAreas.map((a) => a.name).join(", ")}.` : "No goal area stands out yet.",
      ] },
      { type: "table", id: "weeks", title: "The 40 weeks", sheet: "Weeks", columns: [
        { key: "week", label: "Week", kind: "int", width: 0.6, nowrap: true },
        { key: "dates", label: "Dates", kind: "latin", width: 1.6, nowrap: true },
        { key: "skills", label: "New skills", kind: "latin", width: 3.4, linkKey: "skillsLink" },
        { key: "review", label: "Review", kind: "latin", width: 2, linkKey: "reviewLink" },
        { key: "areas", label: "Goal areas", kind: "text", width: 1.6 },
      ], rows: r.weeksRows, empty: "No weeks yet.", qr: r.planLink || undefined },
      { type: "table", id: "skills", title: "The skills of the plan", sheet: "Skills", columns: [
        { key: "skill", label: "Skill", kind: "latin", width: 3, linkKey: "skillLink" },
        { key: "code", label: "Code", kind: "latin", width: 1.2, nowrap: true },
        { key: "area", label: "Goal area", kind: "text", width: 1.6 },
        { key: "weeks", label: "Week(s)", kind: "latin", width: 1, nowrap: true },
        { key: "need", label: "Students who need it", kind: "latin", width: 1.2, nowrap: true },
        { key: "mastered", label: "Mastered ⭐", kind: "latin", width: 1, nowrap: true },
      ], rows: r.skillRows, empty: "No skills yet." },
      { type: "notes", title: "Legend", items: [
        "Students who need it: students of the class whose MAP results put the skill in their Reinforce or Develop band / students tested.",
        "Mastered ⭐: students with the skill's star (at least 30 practice questions with the engine's mastery; tests never change a star).",
        "Review: a skill taught earlier comes back (spiral review).",
      ] },
    ],
    primaryTable: "weeks", fileStem: `year-plan_${ascii(v.className)}_${now.toISOString().slice(0, 10)}`, generatedAt: now, generatedBy: r.teacher,
  };
}

export async function exportYearPlanPdf(deps: ReportDeps, actor: Actor, classId: string): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const now = deps.now?.() ?? new Date();
  const doc = await yearPlanDoc(deps, actor, classId);
  const rl = await consumeRateLimit(deps.repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));
  if (!deps.pdf) throw new Error("PDF rendering is not configured.");
  const fonts = loadFonts(deps.fontDir);
  const bytes = await deps.pdf.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
  await audit(deps.repo, { actorId: actor.userId, action: "report.export", entityType: "MapYearPlan", entityId: classId, after: { kind: "year-plan", bytes: bytes.length }, at: now });
  return { bytes, contentType: "application/pdf", filename: `${doc.fileStem}.pdf` };
}
