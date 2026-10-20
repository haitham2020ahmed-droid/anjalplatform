/**
 * The plan as a Word-compatible HTML document (.doc): opens and edits in Microsoft Word. Every value escaped.
 *
 * Reports redesign (documents): the shared document look — header with title, class, teacher, MAP term and date;
 * an "At a glance" box (students per group); each group with its colour AND its name (never colour alone) and a
 * colour key; zebra tables with numbers aligned; A4 page with margins and a "Page X of Y" footer in Word.
 * The content and every number are the same as before.
 */
import type { PersonalPlan } from "./personal-plan";
import { planHref, planQrSvg, PLAN_LINKS_NOTE } from "../../lib/plan-links";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const TITLE = { BELOW: "Approaching the standard", ON: "Meeting the standard", ABOVE: "Exceeding the standard" } as const;
const RULE = { BELOW: "below the 41st percentile", ON: "41st–60th percentile", ABOVE: "above the 60th percentile" } as const;
/** group colours (MAP green family for the document, red/blue/green per group) — always shown with the group's name */
const TONE = { BELOW: { bg: "#FDE2E1", fg: "#A32A22" }, ON: { bg: "#DBE6F7", fg: "#1F3A68" }, ABOVE: { bg: "#DCF3E6", fg: "#166534" } } as const;
const MAP_GREEN = "#15803D";
const NAVY = "#1F3A68";

export function personalPlanDoc(p: PersonalPlan, generatedAt = new Date()): string {
  const subj = p.subject === "READING" ? "Reading" : "Language";
  const total = p.bands.reduce((n, b) => n + b.students.length, 0);
  const chip = (b: keyof typeof TONE, text: string) => `<span style="background:${TONE[b].bg};color:${TONE[b].fg};font-weight:bold;padding:1pt 6pt;mso-highlight:none">${esc(text)}</span>`;
  const goal = (g: PersonalPlan["bands"][number]["goals"][number], i: number) =>
    `<p style="margin:6pt 0 2pt"><b>${i + 1}. ${esc(g.area)}</b>${g.meanRit !== null ? ` <span style="color:#64748B">(group mean RIT ${g.meanRit})</span>` : ""}${g.result ? `<br><span style="color:#166534">Results (last 28 days): ${g.result.answers ? `${g.result.practiced}/${g.result.students} students practiced · ${g.result.answers} answers · ${g.result.accuracy}% correct${g.result.trend !== null ? ` · trend ${g.result.trend >= 0 ? "+" : ""}${g.result.trend}` : ""}` : "not practiced yet"}</span>` : ""}</p><ul style="margin-top:0">${g.skills.map((k) => `<li>${k.standards.length ? `<b>CCSS.ELA-LITERACY.${esc(k.standards.join(", "))}</b> – ` : ""}${skillA(k)}</li>`).join("") || "<li>Skills will appear when the area’s skills have questions.</li>"}</ul>${g.continuumFocus.length ? `<p style="margin:2pt 0;background:#EFF6FF;padding:4pt 6pt;border-left:3px solid #1D4ED8"><b style="color:#1D4ED8">📘 From the Learning Continuum at this RIT:</b><br>${g.continuumFocus.map((f) => `${f.standards.length ? `<b>${esc(f.standards.join(", "))}</b> – ` : ""}${esc(f.text)}`).join("<br>")}</p>` : ""}`;
  // 🔗 r79: every skill is a link to its skill page (⭐ Assign, questions) — absolute APP_URL, ids only; Word keeps it
  const skillA = (k: { id: string; name: string }) => { const h = planHref({ kind: "skill", id: k.id }, "staff"); return h ? `<a href="${esc(h)}" style="color:#1D4ED8;text-decoration:underline">${esc(k.name)}</a>` : esc(k.name); };
  const planLink = planHref({ kind: "map-group-plan", classId: p.classId, subject: p.subject }, "staff");
  const qr = planLink ? planQrSvg(planLink, 54) : "";
  const th = (t: string, num = false) => `<th style="background:${NAVY};color:#FFFFFF;padding:4pt 6pt;text-align:${num ? "right" : "left"};border:1px solid ${NAVY}">${t}</th>`;
  const td = (v: string, i: number, num = false) => `<td style="padding:3pt 6pt;border-bottom:1px solid #E2E8F0;${i % 2 ? "background:#F6F8FB;" : ""}text-align:${num ? "right" : "left"}">${v}</td>`;
  const band = (b: PersonalPlan["bands"][number]) => `
    <h2 style="color:${NAVY};border-bottom:2px solid ${TONE[b.band].fg};padding-bottom:2pt;margin-top:16pt">${qr && planLink ? `<a href="${esc(planLink)}" style="float:right">${qr}</a>` : ""}${chip(b.band, TITLE[b.band])} ${b.ritRange ? `<span style="font-size:11pt">RIT ${esc(b.ritRange)}</span>` : ""} <span style="font-size:10pt;color:#64748B;font-weight:normal">— ${RULE[b.band]} · ${b.students.length} student${b.students.length === 1 ? "" : "s"}</span></h2>
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:10pt"><tr>${th("Names")}${th("RIT Score", true)}${th("Projected Spring RIT Score", true)}${th("Percentile", true)}</tr>
    ${b.students.map((st, i) => `<tr>${td(`${esc(st.name)}${st.rapidGuess !== null && st.rapidGuess >= 30 ? ` <span style="color:#7A4B00;font-weight:bold">⚠ retest</span>` : ""}`, i)}${td(String(st.rit), i, true)}${td(st.projection === null ? "" : String(st.projection), i, true)}${td(st.percentile === null ? "" : String(st.percentile), i, true)}</tr>`).join("") || `<tr><td colspan="4" style="padding:4pt 6pt;color:#64748B">No students in this group.</td></tr>`}</table>
    <h3>Academic Goals – ${subj} + Standards</h3>${b.goals.map(goal).join("")}
    ${b.strengths.length ? `<h3>Areas of Strength</h3>${b.strengths.map(goal).join("")}` : ""}
    <h3>Resources</h3><ul>${b.resources.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
    <h3>Progress Monitoring</h3><ul>${b.monitoring.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
  const glance = `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:6pt 0 10pt;border:1px solid #BFE6CF;background:#F3FBF6"><tr><td colspan="${p.bands.length + 1}" style="padding:5pt 8pt 0;color:${MAP_GREEN};font-weight:bold;font-size:11pt">At a glance</td></tr><tr>
    <td style="padding:4pt 8pt 7pt;vertical-align:top"><span style="font-size:18pt;font-weight:bold;color:${NAVY}">${total}</span><br><b>Students grouped</b><br><span style="color:#64748B;font-size:9pt">by their latest MAP ${subj} percentile</span></td>
    ${p.bands.map((b) => `<td style="padding:4pt 8pt 7pt;vertical-align:top"><span style="font-size:18pt;font-weight:bold;color:${TONE[b.band].fg}">${b.students.length}</span><br>${chip(b.band, TITLE[b.band])}<br><span style="color:#64748B;font-size:9pt">${RULE[b.band]}</span></td>`).join("")}
    ${p.classAverageRit !== null ? `<td style="padding:4pt 8pt 7pt;vertical-align:top"><span style="font-size:18pt;font-weight:bold;color:${NAVY}">${p.classAverageRit}</span><br><b>Class average RIT</b></td>` : ""}
    ${p.nationalAverageRit !== null ? `<td style="padding:4pt 8pt 7pt;vertical-align:top"><span style="font-size:18pt;font-weight:bold;color:${MAP_GREEN}">${p.nationalAverageRit}</span><br><b>National average RIT</b><br><span style="color:#64748B;font-size:9pt">NWEA norms</span></td>` : ""}
  </tr></table>${p.notTested.length ? `<p style="color:#7A4B00">${p.notTested.length} student${p.notTested.length === 1 ? " has" : "s have"} no MAP ${subj} result yet (listed at the end).</p>` : ""}`;
  const legend = `<p style="font-size:9pt;color:#475569"><b style="color:${NAVY}">Colour key:</b> ${(["BELOW", "ON", "ABOVE"] as const).map((b) => `${chip(b, TITLE[b])} ${RULE[b]}`).join(" &nbsp; ")} &nbsp; <span style="color:#7A4B00;font-weight:bold">⚠ retest</span> = 30%+ rapid guessing on MAP.</p>`;
  const mapLevels = `<h3>MAP Levels for this class</h3><table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:10pt"><tr>${th("Level")}${th("Percentile rule")}${th("This class's RIT range")}${th("Students", true)}</tr>
    ${p.bands.map((b, i) => `<tr>${td(chip(b.band, TITLE[b.band]), i)}${td(RULE[b.band], i)}${td(esc(b.ritRange ?? "—"), i)}${td(String(b.students.length), i, true)}</tr>`).join("")}</table>`;
  // 📊 every instructional (goal) area for the WHOLE class, weakest first — not just each band's 3 weakest; bar = this area's class
  // average against the class's overall average RIT, so a short bar reads as a relatively weak area
  const maxAreaRit = Math.max(1, ...p.areaBreakdown.map((a) => a.meanRit ?? 0), p.classAverageRit ?? 0);
  const mapAreas = p.areaBreakdown.length ? `<h3>Instructional Areas – ${subj} (whole class)</h3><table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:10pt"><tr>${th("Instructional area")}${th("Class average RIT", true)}${th("Students scored", true)}${th("")}</tr>
    ${p.areaBreakdown.map((a, i) => `<tr>${td(esc(a.area), i)}${td(a.meanRit === null ? "—" : String(a.meanRit), i, true)}${td(String(a.students), i, true)}${td(a.meanRit === null ? "" : `<span style="display:inline-block;height:8pt;width:${Math.max(4, Math.round((100 * a.meanRit) / maxAreaRit))}pt;background:${a.meanRit < (p.classAverageRit ?? a.meanRit) ? TONE.BELOW.fg : MAP_GREEN};border-radius:2pt"></span>`, i)}</tr>`).join("")}</table>` : "";
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Personalized Plan</title>
<style>
@page Section1 { size: 595.3pt 841.9pt; margin: 54pt 50pt 54pt 50pt; mso-footer: f1; }
div.Section1 { page: Section1; }
p.MsoFooter { font-size: 8pt; color: #64748B; }
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1E293B; }
h1 { color: ${MAP_GREEN}; font-size: 20pt; margin: 0 0 2pt; }
h3 { color: ${NAVY}; font-size: 12pt; margin: 10pt 0 2pt; border-left: 4px solid ${MAP_GREEN}; padding-left: 6pt; }
</style></head><body><div class="Section1">
<h1>Personalized Plan – Grade ${esc(p.className)} – ${subj}</h1>
<p style="margin:0 0 4pt;color:#475569;font-size:9pt">Prepared for: <b>Teachers</b> · Generated ${esc(generatedAt.toISOString().slice(0, 10))}</p>
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;background:#F1F5F9"><tr>
<td style="padding:5pt 8pt"><span style="color:#64748B;font-size:8pt">Grade</span><br><b>${esc(p.className)}</b></td>
<td style="padding:5pt 8pt"><span style="color:#64748B;font-size:8pt">Subject</span><br><b>L.A (${subj})</b></td>
<td style="padding:5pt 8pt"><span style="color:#64748B;font-size:8pt">Teacher</span><br><b>${esc(p.teacher)}</b></td>
<td style="padding:5pt 8pt"><span style="color:#64748B;font-size:8pt">MAP term</span><br><b>${esc(p.term ?? "—")}</b></td></tr></table>
<p style="margin:6pt 0;padding:3pt 8pt;background:#EEF4FC;border:1px solid #C9DAF3;color:#1F3A68;font-weight:bold;font-size:9pt">${esc(PLAN_LINKS_NOTE.en)}</p>
${glance}${legend}${mapLevels}${mapAreas}
${p.bands.map(band).join("")}
${p.notTested.length ? `<h3>Not tested yet (${subj})</h3><p>${esc(p.notTested.join(", "))}</p>` : ""}
<p style="color:#64748B;font-size:9pt;border-top:1px solid #E2E8F0;padding-top:4pt">Groups by NWEA achievement percentile (one rule for every class). Goals = the group’s weakest MAP goal areas. Generated by Literise.</p>
<!-- Word page footer (Word takes it from this off-page table; browsers never show it) -->
<table id="hrdftrtbl" border="0" cellspacing="0" cellpadding="0" style="margin-left:50in;position:absolute;left:-9999px"><tr><td><div style="mso-element:footer" id="f1"><p class="MsoFooter">Personalized Plan – ${esc(p.className)} – ${subj} · Page <span style="mso-field-code:' PAGE '"></span> of <span style="mso-field-code:' NUMPAGES '"></span></p></div></td></tr></table>
</div></body></html>`;
}
