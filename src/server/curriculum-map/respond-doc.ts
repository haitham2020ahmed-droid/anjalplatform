/**
 * ✍️ Respond to Reading from a Word file (.docx) or a text file (.txt), and the templates to fill in.
 * The file is a list of activities; each starts with its Curriculum Map ID line:
 *
 *   Curriculum Map ID: G4.U1.TS1.RTR.BELOW
 *   Title: …
 *   Prompt: …                      (may continue on the next lines)
 *   Instructions:                  (one item per line below; bullets and numbers are fine)
 *   Word Bank:
 *   Sentence Starters:
 *   Checklist:
 *   Hint: …
 *
 * Parsed into the same table as the Excel import (RESPOND_HEADERS), so every check is the same.
 */
import { readPart, readZipEntries } from "../../imports/xlsx";
import { zip } from "../../reports/zip";
import { workbookXlsx } from "../../imports/questions/template-files";
import { RESPOND_HEADERS, RESPOND_LEVELS } from "./respond";

const FIELDS: { re: RegExp; header: (typeof RESPOND_HEADERS)[number]; list: boolean }[] = [
  { re: /^(?:curriculum\s*map\s*id|map\s*id|code|id)$/i, header: "Curriculum Map ID", list: false },
  { re: /^title$/i, header: "Title", list: false },
  { re: /^(?:prompt|task|question)$/i, header: "Prompt", list: false },
  { re: /^(?:instructions|steps)$/i, header: "Instructions", list: true },
  { re: /^word\s*bank$/i, header: "Word Bank", list: true },
  { re: /^sentence\s*starters?$/i, header: "Sentence Starters", list: true },
  { re: /^checklist$/i, header: "Checklist", list: true },
  { re: /^hint$/i, header: "Hint", list: false },
  { re: /^(?:model\s*answer|answer\s*key|teacher\s*answer)$/i, header: "Model Answer", list: false },
];

const unescape = (v: string) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** The text of a .docx (one line per paragraph) or of a .txt file. */
export function documentText(fileName: string, bytes: Uint8Array): string {
  const ext = fileName.toLowerCase().split(".").pop();
  const buf = Buffer.from(bytes);
  if (ext === "docx") {
    const entries = readZipEntries(buf);
    const doc = entries.get("word/document.xml");
    if (!doc) throw new Error("This Word file has no text.");
    const xml = readPart(buf, doc);
    const paras = xml.match(/<p[\s>][\s\S]*?<\/p>/g) ?? [];
    return paras.map((p) => unescape(p.replace(/<tab\/>/g, " ").replace(/<br\/>/g, "\n").replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, "\u0001$1\u0002").replace(/<[^>]+>/g, "").replace(/\u0001|\u0002/g, ""))).join("\n");
  }
  if (ext === "txt" || ext === "md") return buf.toString("utf8").replace(/^﻿/, "");
  throw new Error("Use a Word (.docx), text (.txt), Excel (.xlsx) or CSV file. A PDF can be saved as Word first.");
}

/** Activities written as “Field: value” blocks → the import table (header row + one row per activity). */
export function parseRespondText(text: string): string[][] {
  const rows: Record<string, string[]>[] = [];
  let cur: Record<string, string[]> | null = null, field: (typeof FIELDS)[number] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || /^[-=_*]{3,}$/.test(line)) continue;
    const m = line.match(/^([A-Za-z][A-Za-z ]{1,30}?)\s*:\s*(.*)$/);
    const f = m ? FIELDS.find((x) => x.re.test(m[1].trim())) : undefined;
    if (f) {
      if (f.header === "Curriculum Map ID") { cur = {}; rows.push(cur); }
      if (!cur) { cur = {}; rows.push(cur); }
      field = f;
      cur[f.header] = m![2].trim() ? [m![2].trim()] : [];
      continue;
    }
    if (cur && field) (cur[field.header] ??= []).push(field.list ? line.replace(/^\s*(?:[-•*▪◦]|\d+[.)])\s*/, "") : line);
  }
  const table: string[][] = [[...RESPOND_HEADERS]];
  for (const r of rows) table.push(RESPOND_HEADERS.map((h) => { const f = FIELDS.find((x) => x.header === h)!; return (r[h] ?? []).join(f.list ? "\n" : " ").trim(); }));
  return table;
}

/** Every level code of these Text Sets (G4.U1.TS1.RTR → .BELOW, .ON, .ABOVE). */
const levelCodes = (setCodes: { code: string; heading: string }[]) => setCodes.flatMap((x) => RESPOND_LEVELS.map((l) => ({ code: `${x.code}.${l}`, heading: x.heading, level: l })));

/** Excel template: one row per level, ID filled in, the rest empty. */
export function respondTemplateXlsx(sets: { code: string; heading: string }[]): Uint8Array {
  const rows = levelCodes(sets).map((x) => [x.code, "", "", "", "", "", "", "", ""]);
  return workbookXlsx([
    { name: "Activities", rows: [[...RESPOND_HEADERS], ...rows], widths: [28, 30, 50, 40, 30, 40, 40, 30, 60], headerStyle: true, freeze: true },
    { name: "Help", rows: [["How to fill in"], ["One row per level. Keep the Curriculum Map ID. In Instructions, Word Bank, Sentence Starters and Checklist write one item per line (Alt+Enter)."], ["Rows left without Title and Prompt are skipped."], ["Model Answer: for teachers only — students never see it."]], widths: [120] },
  ]);
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (text: string, bold = false, size?: number) => `<w:p><w:r>${bold || size ? `<w:rPr>${bold ? "<w:b/>" : ""}${size ? `<w:sz w:val="${size}"/>` : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

/** Word template: every level of the grade, each block ready to fill in. */
export function respondTemplateDocx(grade: number, sets: { code: string; heading: string }[]): Uint8Array {
  const body = [
    para(`Respond to Reading — Grade ${grade}`, true, 36),
    para("Fill in each block under its Curriculum Map ID. Keep the field names (Title:, Prompt:, …). Write list items one per line. Blocks left without Title and Prompt are skipped. Upload this file on Curriculum Map → Respond to Reading → Import."),
    ...levelCodes(sets).flatMap((x) => [
      para("--------------------------------------------"),
      para(`Curriculum Map ID: ${x.code}`, true),
      para(`(${x.heading} · ${x.level === "BELOW" ? "Below" : x.level === "ON" ? "On" : "Above"} Level)`),
      para("Title: "), para("Prompt: "), para("Instructions:"), para("- "), para("Word Bank:"), para("- "), para("Sentence Starters:"), para("- "), para("Checklist:"), para("- "), para("Hint: "), para("Model Answer: "),
    ]),
  ].join("");
  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>` },
  ]);
}
