/**
 * 📜 The certificate page (A4 landscape) in the print kit's design, as self-contained HTML (escaped text, no
 * scripts): a double navy-and-gold border with corner ornaments, "Literise" and the school name, a big student
 * name, the achievement, the date, a teacher's signature line and a seal drawn in SVG (no image files).
 * Used by the PDF / Print certificate (src/server/motivation/certificates.ts) and the unit certificate page.
 * Never puts a dir attribute on SVG elements.
 */
import { esc } from "../../reports/html";
import { BRAND, SOURCE_COLORS } from "./tokens";

export interface CertificateView {
  lang: "en" | "ar";
  title: string;            // "Certificate of Achievement" (already translated)
  presented: string;        // "This certificate is proudly presented to"
  forWord: string;          // "for"
  studentName: string;
  achievement: string;
  detail?: string | null;   // a small line under the achievement (optional)
  date: string;             // formatted date
  dateLabel: string;        // "Date"
  signLabel: string;        // "Teacher's signature"
  school: string;
  logo?: { mime: string; base64: string } | null;
}

const GOLD = "#c99a06", GOLD_SOFT = "#f5d76e";

/** A seal: a gold starburst, a navy disc, a dotted ring with "LITERISE · EXCELLENCE" around a star, two ribbons. */
export function sealSvg(id = "seal"): string {
  const pts: string[] = [];
  for (let i = 0; i < 64; i++) {
    const r = i % 2 ? 52 : 58, a = (Math.PI * i) / 32;
    pts.push(`${(60 + r * Math.sin(a)).toFixed(2)},${(60 - r * Math.cos(a)).toFixed(2)}`);
  }
  const star: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 7.5 : 17, a = (Math.PI * i) / 5;
    star.push(`${(60 + r * Math.sin(a)).toFixed(2)},${(62 - r * Math.cos(a)).toFixed(2)}`);
  }
  return `<svg class="seal" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
<path d="M38 96 L26 146 L42 136 L50 150 L58 104 Z" fill="${SOURCE_COLORS.nafs}"/><path d="M82 96 L94 146 L78 136 L70 150 L62 104 Z" fill="${BRAND.teal}"/>
<polygon points="${pts.join(" ")}" fill="${GOLD_SOFT}" stroke="${GOLD}" stroke-width="1.2"/>
<circle cx="60" cy="60" r="45" fill="${BRAND.navy}"/>
<circle cx="60" cy="60" r="41" fill="none" stroke="${GOLD_SOFT}" stroke-width="1.2" stroke-dasharray="1.6 2.2"/>
<circle cx="60" cy="60" r="25" fill="none" stroke="${GOLD_SOFT}" stroke-width="1"/>
<defs><path id="${id}-arc" d="M60 60 m-33 0 a33 33 0 1 1 66 0 a33 33 0 1 1 -66 0"/></defs>
<text font-size="8.6" font-weight="700" letter-spacing="1.6" fill="${GOLD_SOFT}" font-family="Lexend, Segoe UI, sans-serif"><textPath href="#${id}-arc" startOffset="0">LITERISE ★ EXCELLENCE ★ ENGLISH ★</textPath></text>
<polygon points="${star.join(" ")}" fill="${GOLD_SOFT}"/>
</svg>`;
}

/** A corner flourish (rotated for each corner by CSS). */
const CORNER = `<svg class="corner" viewBox="0 0 60 60" aria-hidden="true" focusable="false"><path d="M4 56 V22 Q4 4 22 4 H56" fill="none" stroke="${GOLD}" stroke-width="2.2"/><path d="M12 56 V26 Q12 12 26 12 H56" fill="none" stroke="${BRAND.navy}" stroke-width="1.2"/><circle cx="22" cy="22" r="4.2" fill="${GOLD}"/><path d="M22 13 L24 20 L31 22 L24 24 L22 31 L20 24 L13 22 L20 20 Z" fill="${BRAND.navy}" opacity=".85"/></svg>`;

export const CERTIFICATE_CSS = `
@page{size:A4 landscape;margin:0}
.cert-sheet *{box-sizing:border-box}
.cert-sheet{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:var(--cert-font,"Lexend","Segoe UI",Tahoma,sans-serif);color:${BRAND.ink}}
.cert-page{position:relative;width:297mm;height:210mm;padding:9mm;background:#fff;margin:0 auto}
.cert-frame{position:relative;height:100%;border:2.6mm solid ${BRAND.navy};border-radius:6mm;padding:3mm;background:#fff}
.cert-inner{position:relative;height:100%;border:.6mm solid ${GOLD};border-radius:3.5mm;padding:9mm 22mm 8mm;text-align:center;display:flex;flex-direction:column;align-items:center;background:radial-gradient(ellipse at 50% 40%,#fffdf5 0%,#fff 60%),#fff}
.cert-inner::before{content:"";position:absolute;inset:2mm;border:.25mm dashed ${GOLD_SOFT};border-radius:2.5mm;pointer-events:none}
.corner{position:absolute;width:17mm;height:17mm}
.c-tl{top:2mm;left:2mm}.c-tr{top:2mm;right:2mm;transform:scaleX(-1)}.c-bl{bottom:2mm;left:2mm;transform:scaleY(-1)}.c-br{bottom:2mm;right:2mm;transform:scale(-1,-1)}
.cert-top{display:flex;align-items:center;justify-content:center;gap:6mm}
.cert-logo{height:15mm;max-width:45mm;object-fit:contain}
.cert-brand{direction:ltr;font-size:15pt;font-weight:800;color:${BRAND.navy};letter-spacing:.02em}
.cert-brand i{font-style:normal;color:${GOLD}}
.cert-school{font-size:11pt;font-weight:600;color:${BRAND.soft};letter-spacing:.04em}
.cert-title{margin:7mm 0 0;font-size:30pt;font-weight:800;color:${BRAND.navy};letter-spacing:.03em;line-height:1.1}
.cert-rule{display:flex;align-items:center;gap:3mm;margin-top:2.5mm;color:${GOLD}}
.cert-rule span{display:block;width:30mm;height:.5mm;background:linear-gradient(90deg,transparent,${GOLD})}
.cert-rule span+b+span{background:linear-gradient(270deg,transparent,${GOLD})}
.cert-rule b{font-size:9pt}
.cert-to{margin-top:9mm;font-size:12.5pt;color:${BRAND.soft}}
.cert-name{margin-top:3mm;font-size:38pt;font-weight:700;color:${SOURCE_COLORS.nafs};line-height:1.15;padding:0 8mm 1.5mm;border-bottom:.6mm solid ${GOLD_SOFT};unicode-bidi:isolate;max-width:230mm;overflow-wrap:anywhere}
.cert-for{margin-top:6mm;font-size:12.5pt;color:${BRAND.soft}}
.cert-what{margin-top:2mm;font-size:21pt;font-weight:700;color:${BRAND.navy};max-width:220mm;unicode-bidi:plaintext}
.cert-detail{margin-top:1mm;font-size:11pt;color:${BRAND.soft};unicode-bidi:plaintext}
.cert-foot{margin-top:auto;width:100%;display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:8mm;font-size:10.5pt;color:${BRAND.soft}}
.cert-line{min-width:62mm}
.cert-over{height:9mm;display:flex;align-items:flex-end;justify-content:center;padding-bottom:1mm;color:${BRAND.navy};font-size:11.5pt;font-weight:700}
.cert-under{border-top:.4mm solid #94a3b8;padding-top:1.5mm}
.seal{width:31mm;height:38mm;display:block}
@media screen and (max-width:1100px){
  .cert-page{width:auto;height:auto;padding:10px}
  .cert-inner{padding:26px 14px 18px;min-height:88vh}
  .corner{width:40px;height:40px}
  .cert-title{font-size:26px}.cert-name{font-size:28px;max-width:100%}.cert-what{font-size:19px;max-width:100%}
  .cert-to,.cert-for{font-size:15px}.cert-logo{height:44px}.cert-brand{font-size:18px}.cert-school{font-size:13px}
  .cert-foot{grid-template-columns:1fr;justify-items:center;gap:14px;margin-top:26px}.cert-line{min-width:70%}
}
@media print{.cert-sheet{margin:0}}
`;

/** The certificate's page body (inside .cert-sheet). Every text value is escaped. */
export function certificateBody(v: CertificateView): string {
  const logo = v.logo ? `<img class="cert-logo" alt="" src="data:${esc(v.logo.mime)};base64,${v.logo.base64}">` : "";
  return `<div class="cert-sheet" data-pk="certificate"><div class="cert-page"><div class="cert-frame"><div class="cert-inner">
<span class="corner c-tl">${CORNER}</span><span class="corner c-tr">${CORNER}</span><span class="corner c-bl">${CORNER}</span><span class="corner c-br">${CORNER}</span>
<div class="cert-top">${logo}<div><div class="cert-brand">Lite<i>rise</i></div><div class="cert-school"><bdi>${esc(v.school)}</bdi></div></div></div>
<h1 class="cert-title">${esc(v.title)}</h1>
<div class="cert-rule" aria-hidden="true"><span></span><b>✦</b><span></span></div>
<div class="cert-to">${esc(v.presented)}</div>
<div class="cert-name" dir="auto">${esc(v.studentName)}</div>
<div class="cert-for">${esc(v.forWord)}</div>
<div class="cert-what" dir="auto">${esc(v.achievement)}</div>
${v.detail ? `<div class="cert-detail" dir="auto">${esc(v.detail)}</div>` : ""}
<div class="cert-foot"><div class="cert-line"><div class="cert-over"><bdi>${esc(v.date)}</bdi></div><div class="cert-under">${esc(v.dateLabel)}</div></div>${sealSvg()}<div class="cert-line"><div class="cert-over"></div><div class="cert-under">${esc(v.signLabel)}</div></div></div>
</div></div></div></div>`;
}

/** The whole certificate document (fonts embedded by the caller). */
export function certificateDocument(v: CertificateView, fonts: { css: string; stack: string }): string {
  return `<!doctype html><html lang="${v.lang}" dir="${v.lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(v.title)}</title><style>${fonts.css}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:${fonts.stack};background:#fff;--cert-font:${fonts.stack}}
${CERTIFICATE_CSS}</style></head><body>${certificateBody(v)}</body></html>`;
}
