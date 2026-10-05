/**
 * ReportDoc → Excel workbook (.xlsx), written directly as SpreadsheetML.
 *
 *  Sheet 1 "Summary": logo, title, school, report details, key figures, bar values, notes.
 *  One sheet per table, header in row 1, frozen and filterable, so teachers can sort
 *  and filter straight away.
 *
 * Numbers, percentages and dates are stored as real Excel values (percentages as
 * fractions with a 0% format, dates as serial numbers), so formulas and charts work.
 * Arabic reports use right-to-left sheets (column A on the right, as Excel does for
 * Arabic) and Arabic sheet names and headers.
 *
 * Formula safety: all text is written as inline strings, which Excel never evaluates,
 * so a name such as "=HYPERLINK(...)" stays literal text. (CSV needs the apostrophe
 * defence instead, see src/imports/csv.ts.)
 */
import { bandLabel, formatter, t } from "./i18n";
import type { CellValue, Column, ReportDoc, Section } from "./model";
import { BAND_COLOURS } from "./html";
import { zip, type ZipEntry } from "./zip";

const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const x = (s: unknown) => String(s).replace(INVALID_XML, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ----------------------------------------------------------------- styles

const S = {
  default: 0, title: 1, header: 2, label: 3, text: 4, int: 5, dec: 6, pct: 7, signed: 8, date: 9, note: 10,
  band: { BEGINNING: 11, DEVELOPING: 12, APPROACHING: 13, PROFICIENT: 14, MASTERED: 15 } as Record<string, number>,
  subtitle: 16, kpiValue: 17,
};

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

function stylesXml(): string {
  const bandFills = Object.values(BAND_COLOURS).map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="${argb(c.bg)}"/><bgColor indexed="64"/></patternFill></fill>`).join("");
  const bandFonts = Object.values(BAND_COLOURS).map((c) => `<font><b/><sz val="10"/><color rgb="${argb(c.fg)}"/><name val="Arial"/></font>`).join("");
  // fonts: 0 normal, 1 title, 2 header, 3 label, 4 note, 5-9 bands, 10 subtitle, 11 kpi value
  const fonts = [
    `<font><sz val="10"/><name val="Arial"/></font>`,
    `<font><b/><sz val="15"/><color rgb="FF5B3FA0"/><name val="Arial"/></font>`,
    `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>`,
    `<font><b/><sz val="10"/><color rgb="FF1F3A68"/><name val="Arial"/></font>`,
    `<font><i/><sz val="9"/><color rgb="FF475569"/><name val="Arial"/></font>`,
    bandFonts,
    `<font><b/><sz val="10"/><color rgb="FF1FA3A3"/><name val="Arial"/></font>`,
    `<font><b/><sz val="12"/><color rgb="FF1F3A68"/><name val="Arial"/></font>`,
  ].join("");
  const xf = (numFmt: number, font: number, fill = 0, extra = "") =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${fill === 2 ? 1 : 0}" xfId="0"${numFmt ? ' applyNumberFormat="1"' : ""} applyFont="1"${fill ? ' applyFill="1"' : ""}${extra ? ` applyAlignment="1">${extra}</xf>` : "/>"}`;
  const wrap = `<alignment vertical="top" wrapText="1"/>`;
  const center = `<alignment horizontal="center" vertical="top"/>`;
  const xfs = [
    xf(0, 0),
    xf(0, 1),
    xf(0, 2, 2, `<alignment horizontal="center" vertical="center" wrapText="1"/>`),
    xf(0, 3, 0, wrap),
    xf(0, 0, 0, wrap),
    xf(3, 0, 0, center),
    xf(164, 0, 0, center),
    xf(9, 0, 0, center),
    xf(165, 0, 0, center),
    xf(166, 0, 0, center),
    xf(0, 4, 0, wrap),
    ...Object.keys(BAND_COLOURS).map((_, i) => xf(0, 5 + i, 3 + i, center)),
    xf(0, 10),
    xf(0, 11, 0, `<alignment horizontal="left"/>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="+0.0;-0.0;0"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="${7 + Object.keys(BAND_COLOURS).length}">${fonts}</fonts>
<fills count="${3 + Object.keys(BAND_COLOURS).length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A68"/><bgColor indexed="64"/></patternFill></fill>${bandFills}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF1FA3A3"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

// ------------------------------------------------------------------ cells

type XCell = { v: string | number | null; s: number } | null;

const colName = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const serial = (iso: string) => {
  const ms = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(ms) ? null : (ms - EXCEL_EPOCH) / 86_400_000;
};

function valueCell(col: Column, v: CellValue, locale: ReportDoc["locale"]): XCell {
  if (v === null || v === "") return null;
  switch (col.kind) {
    case "int":
      return { v: Number(v), s: S.int };
    case "dec":
      return { v: Number(v), s: S.dec };
    case "pct":
      return { v: Number(v) / 100, s: S.pct };
    case "signed":
      return { v: Number(v), s: S.signed };
    case "date": {
      const n = serial(String(v));
      return n === null ? { v: String(v), s: S.text } : { v: n, s: S.date };
    }
    case "band": {
      const code = String(v).toUpperCase();
      return { v: bandLabel(locale, code), s: S.band[code] ?? S.text };
    }
    default:
      return { v: String(v), s: S.text };
  }
}

function cellXml(ref: string, c: XCell): string {
  if (!c || c.v === null) return "";
  if (typeof c.v === "number") return Number.isFinite(c.v) ? `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>` : "";
  const text = x(c.v);
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t${space}>${text}</t></is></c>`;
}

interface SheetSpec {
  name: string;
  rows: XCell[][];
  widths: number[];
  rowHeights?: Record<number, number>;
  freezeHeader?: boolean;
  filter?: { cols: number; rows: number };
  image?: { rId: string };
}

function sheetXml(s: SheetSpec, rtl: boolean): string {
  const cols = s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(1)}" customWidth="1"/>`).join("");
  const rows = s.rows
    .map((r, ri) => {
      const cells = r.map((c, ci) => cellXml(`${colName(ci)}${ri + 1}`, c)).join("");
      const ht = s.rowHeights?.[ri + 1];
      return `<row r="${ri + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells}</row>`;
    })
    .join("");
  const pane = s.freezeHeader ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>` : "";
  const filter = s.filter && s.filter.rows > 0 ? `<autoFilter ref="A1:${colName(s.filter.cols - 1)}${s.filter.rows + 1}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ""}>${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows}</sheetData>${filter}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${s.image ? `<drawing r:id="${s.image.rId}"/>` : ""}
</worksheet>`;
}

// ------------------------------------------------------------ sheet names

export function sheetName(raw: string, used: Set<string>): string {
  let base = raw.replace(/[\[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

// ------------------------------------------------------------------- logo

/** Pixel size of a PNG or JPEG (needed to place it without distortion). */
export function imageSize(mime: string, b: Uint8Array): { w: number; h: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (mime === "image/png" && b.length > 24) return { w: v.getUint32(16), h: v.getUint32(20) };
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = v.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: v.getUint16(i + 5), w: v.getUint16(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

function drawingXml(w: number, h: number): string {
  const box = 64; // px
  const scale = Math.min(box / w, box / h);
  const emu = (px: number) => Math.round(px * scale * 9525);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>76200</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${emu(w)}" cy="${emu(h)}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>
</xdr:wsDr>`;
}

// ------------------------------------------------------------------ build

const textWidth = (v: unknown) => Math.max(...String(v ?? "").split("\n").map((l) => l.length));

function summarySheet(doc: ReportDoc, hasLogo: boolean): SheetSpec {
  const f = formatter(doc.locale);
  const L = doc.locale;
  const rows: XCell[][] = [];
  const B = (v: string | number | null, s: number): XCell => ({ v, s });
  // rows 1-4: logo in column A (when present), title block in column B
  const school = L === "ar" && doc.branding.nameAr ? doc.branding.nameAr : doc.branding.name;
  const alt = L === "ar" ? (doc.branding.nameAr ? doc.branding.name : null) : doc.branding.nameAr;
  rows.push([null, B(doc.title, S.title)]);
  rows.push([null, B(school, S.label)]);
  rows.push([null, B(alt ?? doc.subtitle, alt ? S.text : S.subtitle)]);
  rows.push([null, alt ? B(doc.subtitle, S.subtitle) : null]);
  rows.push([]);
  for (const m of doc.meta) rows.push([B(m.label, S.label), B(m.value, S.text)]);
  rows.push([B(t(L, "meta.generated"), S.label), B(f.dateTime(doc.generatedAt), S.text)]);
  rows.push([B(t(L, "meta.generatedBy"), S.label), B(doc.generatedBy, S.text)]);
  for (const s of doc.sections) {
    if (s.type === "table") continue;
    rows.push([]);
    rows.push([B(s.title, S.header), B("", S.header)]);
    if (s.type === "kpis") {
      for (const k of s.items) {
        const v: XCell =
          k.value === null ? B(t(L, "none"), S.text)
          : k.kind === "pct" ? B(Number(k.value) / 100, S.pct)
          : k.kind === "int" ? B(Number(k.value), S.int)
          : k.kind === "dec" ? B(Number(k.value), S.dec)
          : k.kind === "signed" ? B(Number(k.value), S.signed)
          : B(String(k.value), S.text);
        rows.push([B(k.label, S.text), v]);
      }
    } else if (s.type === "bars") {
      for (const b of s.items) rows.push([B(b.label, S.text), b.value === null ? B(t(L, "none"), S.text) : s.kind === "pct" ? B(b.value / 100, S.pct) : B(b.value, S.int)]);
    } else if (s.type === "notes") {
      for (const n of s.items) rows.push([B(n, S.note)]);
    }
  }
  const longest = Math.max(20, ...rows.map((r) => (r[0] && r[0].s !== S.note ? textWidth(r[0].v) : 0)));
  return {
    name: t(L, "sec.summary"),
    rows,
    widths: [Math.min(48, Math.max(hasLogo ? 14 : 0, longest + 2)), 46],
    rowHeights: hasLogo ? { 1: 24, 2: 16, 3: 16, 4: 16 } : { 1: 24 },
  };
}

function tableSheet(doc: ReportDoc, s: Extract<Section, { type: "table" }>, name: string): SheetSpec {
  const rows: XCell[][] = [s.columns.map((c) => ({ v: c.label, s: S.header }))];
  for (const r of s.rows) rows.push(s.columns.map((c) => valueCell(c, r[c.key] ?? null, doc.locale)));
  const widths = s.columns.map((c, i) => {
    const content = Math.max(textWidth(c.label), ...rows.slice(1).map((r) => (r[i] && typeof r[i]!.v === "string" ? textWidth(r[i]!.v) : 8)));
    return Math.min(c.kind === "text" || c.kind === "latin" ? 60 : 24, Math.max(8, content + 2));
  });
  if (s.note) {
    rows.push([]);
    rows.push([{ v: s.note, s: S.note }]);
  }
  return { name, rows, widths, freezeHeader: true, filter: { cols: s.columns.length, rows: s.rows.length } };
}

export function renderXlsx(doc: ReportDoc): Uint8Array {
  const used = new Set<string>();
  const logo = doc.branding.logo && doc.branding.logo.mime !== "image/svg+xml" ? doc.branding.logo : null;
  const size = logo ? imageSize(logo.mime, logo.bytes) : null;
  const summary = summarySheet(doc, !!size);
  summary.name = sheetName(summary.name, used);
  if (size) summary.image = { rId: "rId1" };
  const tables = doc.sections.filter((s): s is Extract<Section, { type: "table" }> => s.type === "table");
  const sheets = [summary, ...tables.map((s) => tableSheet(doc, s, sheetName(s.sheet ?? s.title, used)))];
  const rtl = doc.locale === "ar";
  const ext = logo?.mime === "image/png" ? "png" : "jpeg";

  const entries: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${size ? `<Default Extension="${ext}" ContentType="${logo!.mime}"/>` : ""}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}${size ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ""}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(doc.title)}</dc:title><dc:creator>${x(doc.branding.name)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${doc.generatedAt.toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets
        .map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets>${(() => {
        const names = sheets
          .map((s, i) => (s.filter && s.filter.rows > 0 ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(s.name.replace(/'/g, "''"))}'!$A$1:$${colName(s.filter.cols - 1)}$${s.filter.rows + 1}</definedName>` : ""))
          .join("");
        return names ? `<definedNames>${names}</definedNames>` : "";
      })()}</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: stylesXml() },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, rtl) })),
  ];
  if (size && logo) {
    entries.push(
      { name: "xl/worksheets/_rels/sheet1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>` },
      { name: "xl/drawings/drawing1.xml", data: drawingXml(size.w, size.h) },
      { name: "xl/drawings/_rels/drawing1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.${ext}"/></Relationships>` },
      { name: `xl/media/logo.${ext}`, data: logo.bytes },
    );
  }
  return zip(entries);
}
