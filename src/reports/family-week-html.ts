/**
 * 👪 The weekly family report as HTML — ONE source for the screen (the student's "For my family" page and the
 * teacher's preview) and for the PDF (a page per student, rendered by Chromium: Arabic shaping and right-to-left
 * layout are correct). Plain CSS (fw-*), no scripts; every value is escaped; English content (titles, names) is
 * isolated inside Arabic text. Interface words come from t() (English / Arabic); never a level or tier word.
 */
import type { FamilyWeek } from "../server/reports/family-week";
import type { Lang, TFn } from "../i18n";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** content that may be English inside an Arabic page */
const iso = (v: string) => `<bdi>${esc(v)}</bdi>`;

export const FAMILY_WEEK_CSS = `
.fw-page{box-sizing:border-box;max-width:190mm;margin:0 auto;padding:8mm 9mm;background:#fff;color:#0f172a;font-size:12.5pt;line-height:1.5;border-radius:16px;border:1px solid #e2e8f0}
.fw-page *{box-sizing:border-box}
.fw-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:6px 16px;border-bottom:3px solid #0d9488;padding-bottom:8px;margin-bottom:12px}
.fw-head h2{margin:0;font-size:19pt;color:#1e3a5f;line-height:1.25}
.fw-who{margin:2px 0 0;font-size:13pt;font-weight:700;color:#0f172a}
.fw-dates{margin:0;color:#475569;font-size:11pt}
.fw-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 12px;padding:0;list-style:none}
.fw-tile{border-radius:12px;background:#f0fdfa;border:1px solid #99f6e4;padding:8px 10px}
.fw-tile b{display:block;font-size:20pt;line-height:1.1;color:#134e4a;font-variant-numeric:tabular-nums}
.fw-tile span{font-size:10pt;color:#334155}
.fw-sec{margin:0 0 10px;break-inside:avoid;page-break-inside:avoid}
.fw-sec h3{margin:0 0 4px;font-size:13.5pt;color:#1e3a5f}
.fw-sec ul{margin:0;padding-inline-start:20px}
.fw-sec li{margin:2px 0}
.fw-none{color:#64748b;margin:0}
.fw-score{font-weight:700;color:#134e4a;white-space:nowrap}
.fw-home{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.fw-home li{border-radius:12px;background:#fffbeb;border:1px solid #fde68a;padding:8px 10px}
.fw-home b{display:block;color:#78350f}
.fw-note{border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;padding:8px 10px;white-space:pre-wrap;margin:0}
.fw-foot{margin:10px 0 0;color:#475569;font-size:10.5pt;text-align:center}
@media (max-width:640px){.fw-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.fw-page{padding:16px}}
@media print{.fw-page{border:none;border-radius:0;max-width:none}.fw-page + .fw-page{break-before:page;page-break-before:always}}
`;

function dayOf(d: string, lang: Lang): string {
  const x = new Date(`${d}T12:00:00Z`);
  return x.toLocaleDateString(lang === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** One student's page (an <article>). */
export function familyWeekArticle(w: FamilyWeek, t: TFn, lang: Lang): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const list = (items: string[], empty: string) => (items.length ? `<ul>${items.map((x) => `<li>${iso(x)}</li>`).join("")}</ul>` : `<p class="fw-none">${esc(t(empty))}</p>`);
  const tiles: [number, string][] = [[w.tasks.length, "Tasks finished"], [w.minutes, "Minutes of learning"], [w.articles.length, "ReadRise articles"], [w.lessons.length, "Lessons"]];
  return `<article class="fw-page" dir="${dir}" lang="${lang}">
<header class="fw-head"><div><h2>${esc(t("For my family: this week"))}</h2><p class="fw-who">${iso(w.name)}${w.className ? ` · ${esc(t("Class {c}", { c: w.className }))}` : ""}</p></div>
<p class="fw-dates">${esc(t("From {from} to {to}", { from: dayOf(w.from, lang), to: dayOf(w.to, lang) }))}</p></header>
<ul class="fw-tiles">${tiles.map(([n, l]) => `<li class="fw-tile"><b dir="ltr">${n}</b><span>${esc(t(l))}</span></li>`).join("")}</ul>
<section class="fw-sec"><h3>${esc(t("Tasks I finished"))}</h3>${list(w.tasks, "No tasks finished yet this week.")}</section>
<section class="fw-sec"><h3>${esc(t("ReadRise articles I read"))}</h3>${list(w.articles, "No articles yet this week.")}</section>
<section class="fw-sec"><h3>${esc(t("Lessons I learned"))}</h3>${list(w.lessons, "No lessons yet this week.")}</section>
<section class="fw-sec"><h3>${esc(t("My tests"))}</h3>${w.tests.length ? `<ul>${w.tests.map((x) => `<li>${iso(x.title)} · <span class="fw-score" dir="ltr">${x.pct}%</span></li>`).join("")}</ul>` : `<p class="fw-none">${esc(t("No test results this week."))}</p>`}</section>
<section class="fw-sec"><h3>${esc(t("Things to practise at home"))}</h3><ul class="fw-home">${w.practise.map((p) => `<li><b>${esc(t(p.title))}</b>${esc(t("At home:"))} ${esc(t(p.activity))}</li>`).join("")}</ul></section>
${w.note ? `<section class="fw-sec"><h3>${esc(t("A note from my teacher"))}</h3><p class="fw-note" dir="auto">${esc(w.note)}</p></section>` : ""}
<p class="fw-foot">${esc(t("Ask me what I learned this week!"))}</p>
</article>`;
}

/** A whole printable document (A4, a page per student) for the PDF renderer; fonts embedded by the caller. */
export function familyWeekDocument(items: FamilyWeek[], t: TFn, lang: Lang, fonts: { css: string; stack: string }): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(t("For my family: this week"))}</title>
<style>${fonts.css}
@page{size:A4 portrait;margin:10mm}
html,body{margin:0;padding:0;background:#fff;font-family:${fonts.stack}}
${FAMILY_WEEK_CSS}
.fw-page{border:none;border-radius:0;max-width:none;padding:0}
.fw-page + .fw-page{break-before:page;page-break-before:always}
</style></head><body>${items.map((w) => familyWeekArticle(w, t, lang)).join("\n")}</body></html>`;
}
