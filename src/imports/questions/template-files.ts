/**
 * The downloadable import templates (pure; the route adds the school's curriculum).
 *
 *   Excel: sheet "Questions" (header + example rows, frozen header, drop-down lists),
 *          sheet "Instructions" (rules and what each column means),
 *          sheet "Curriculum" (every Grade, Skill and linked Standard of the school, to copy from).
 *   CSV:   header + example rows (the curriculum list is a separate CSV download).
 *
 * Example rows start with "[Example]"; the importer refuses them, so a template uploaded unchanged
 * never adds example questions to the bank.
 */
import { toCsv } from "../csv";
import { zip } from "../../reports/zip";
import { COGNITIVE_LEVELS, EXAMPLE_MARK, SUPPORTED_TYPES, TEACHER_RULES, TEMPLATE_COLUMNS, TEMPLATE_HEADERS, shortStandard, type CurriculumIndex, type SkillRef } from "./template";

const LEVELS = ["1 = very easy", "2 = easy", "3 = below grade level", "4 = grade level", "5 = above grade level", "6 = challenging", "7 = advanced"];

/** Rows of the Curriculum sheet / curriculum CSV: Grade, Skill Code, Skill Name, Standards. */
export function curriculumRows(idx: CurriculumIndex): string[][] {
  const rows: string[][] = [["Grade", "Skill Code", "Skill Name", "Standards (use one of these)"]];
  for (const g of [...idx.grades.keys()].sort((a, b) => a - b)) {
    for (const s of [...(idx.grades.get(g) ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
      const stds = [...s.standards].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((x) => shortStandard(x.code));
      rows.push([String(g), s.code, s.name, stds.join(", ")]);
    }
  }
  return rows;
}

/** A skill with a linked standard, to make the example rows real (lowest grade first). */
function exampleSkill(idx: CurriculumIndex): { grade: number; skill: SkillRef; standard: string } | null {
  for (const g of [...idx.grades.keys()].sort((a, b) => a - b)) {
    const s = (idx.grades.get(g) ?? []).find((x) => x.standards.length);
    if (s) return { grade: g, skill: s, standard: shortStandard((s.standards.find((x) => x.isPrimary) ?? s.standards[0]).code) };
  }
  return null;
}

/** Example rows, in TEMPLATE_HEADERS order. They use a real skill and standard of the school. */
export function exampleRows(idx: CurriculumIndex): string[][] {
  const ex = exampleSkill(idx);
  const grade = ex ? String(ex.grade) : "4";
  const skill = ex ? ex.skill.name : "Skill name from the Curriculum sheet";
  const std = ex ? ex.standard : "RL.4.1";
  const row = (v: Record<string, string>) => TEMPLATE_HEADERS.map((h) => v[h] ?? "");
  const common = { Grade: grade, Skill: skill, Standard: std };
  return [
    row({ ...common, "Question Text": `${EXAMPLE_MARK} Which word is a noun?`, "Question Type": "Multiple Choice", "Option A": "quickly", "Option B": "garden", "Option C": "happy", "Option D": "run", "Correct Answer": "B", Explanation: "A noun names a person, place, thing or idea. A garden is a place.", "Difficulty Level": "2", "Cognitive Level": "Remember" }),
    row({ ...common, "Question Text": `${EXAMPLE_MARK} Which TWO words are verbs?`, "Question Type": "Multi Select", "Option A": "jump", "Option B": "blue", "Option C": "write", "Option D": "table", "Correct Answer": "A, C", Explanation: "Verbs show actions: jump and write.", "Difficulty Level": "3", "Cognitive Level": "Understand" }),
    row({ ...common, "Question Text": `${EXAMPLE_MARK} A sentence always begins with a capital letter.`, "Question Type": "True/False", "Correct Answer": "True", Explanation: "Every sentence starts with a capital letter.", "Difficulty Level": "1", "Cognitive Level": "Remember" }),
    row({ ...common, "Question Text": `${EXAMPLE_MARK} The children ____ to school every morning.`, "Question Type": "Fill in the Blank", "Correct Answer": "walk | go", Explanation: "The plural subject “children” takes the base form of the verb.", "Difficulty Level": "4", "Cognitive Level": "Apply" }),
    row({ ...common, "Question Text": `${EXAMPLE_MARK} Read the text. Why did Sara go to the library?`, "Question Type": "Multiple Choice", "Option A": "to meet a friend", "Option B": "to return a book", "Option C": "to find a book about birds", "Option D": "to study for a test", "Correct Answer": "C", Explanation: "The text says Sara wanted to learn about birds, so she looked for a book about them.", "Difficulty Level": "4", "Cognitive Level": "Understand", "Passage/Text": "Sara saw a small bird outside her window. She wanted to know its name, so after school she walked to the library and asked for a book about birds." }),
  ];
}

export function templateCsv(idx: CurriculumIndex): string {
  return toCsv([TEMPLATE_HEADERS, ...exampleRows(idx)]);
}

export function curriculumCsv(idx: CurriculumIndex): string {
  return toCsv(curriculumRows(idx));
}

// ------------------------------------------------------------------- xlsx

const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const x = (s: unknown) => String(s ?? "").replace(INVALID_XML, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const col = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : col(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

export interface Sheet { name: string; rows: string[][]; widths: number[]; headerStyle?: boolean; freeze?: boolean; validations?: string; numericCols?: Set<number> }

/** styles: 0 normal, 1 header (bold white on navy, wrapped), 2 wrapped text, 3 title */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF1F3A68"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A68"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function sheetXml(s: Sheet): string {
  const views = s.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const cols = `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
  const rows = s.rows.map((r, ri) => {
    const style = ri === 0 && s.headerStyle ? 1 : s.headerStyle ? 2 : ri === 0 && s.name === "Instructions" ? 3 : 2;
    const cells = r.map((v, ci) => {
      const ref = `${col(ci)}${ri + 1}`;
      if (v === "") return "";
      if (ri > 0 && s.numericCols?.has(ci) && /^\d+$/.test(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}"${ri === 0 && s.headerStyle ? ' ht="30" customHeight="1"' : ""}>${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${views}${cols}<sheetData>${rows}</sheetData>${s.validations ?? ""}</worksheet>`;
}

/** The Excel template (Questions, Instructions, Curriculum). */
export function templateXlsx(idx: CurriculumIndex): Uint8Array {
  const cur = curriculumRows(idx);
  const allStandards = [...new Set(cur.slice(1).flatMap((r) => r[3].split(", ").filter(Boolean)))].sort();
  const curSheet = cur.map((r, i) => [...r, "", i === 0 ? "All standard codes" : allStandards[i - 1] ?? ""]);
  for (let i = cur.length; i <= allStandards.length; i++) curSheet.push(["", "", "", "", "", allStandards[i - 1]]);
  const at = (h: string) => col(TEMPLATE_HEADERS.indexOf(h));
  const range = (h: string) => `${at(h)}2:${at(h)}5001`;
  const list = (h: string, values: string[], strict = true) =>
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"${strict ? "" : ' errorStyle="warning"'} sqref="${range(h)}"><formula1>"${x(values.join(","))}"</formula1></dataValidation>`;
  const ref = (h: string, target: string) =>
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="warning" errorTitle="Not in the curriculum" error="This value is not in the Curriculum sheet. Check the spelling before importing." sqref="${range(h)}"><formula1>${target}</formula1></dataValidation>`;
  const validations = [
    list("Question Type", SUPPORTED_TYPES.map((t) => t.name)),
    list("Grade", [...idx.grades.keys()].sort((a, b) => a - b).map(String)),
    `<dataValidation type="whole" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Difficulty Level" error="Write a whole number from 1 to 7." promptTitle="Difficulty Level" prompt="1 very easy … 4 grade level … 7 advanced" sqref="${range("Difficulty Level")}"><formula1>1</formula1><formula2>7</formula2></dataValidation>`,
    list("Cognitive Level", [...COGNITIVE_LEVELS]),
    cur.length > 1 ? ref("Skill", `Curriculum!$C$2:$C$${cur.length}`) : "",
    allStandards.length ? ref("Standard", `Curriculum!$F$2:$F$${allStandards.length + 1}`) : "",
  ].filter(Boolean);
  const questions: Sheet = {
    name: "Questions", rows: [TEMPLATE_HEADERS, ...exampleRows(idx)], headerStyle: true, freeze: true,
    widths: TEMPLATE_HEADERS.map((h) => (h === "Question Text" || h === "Passage/Text" ? 50 : h === "Explanation" ? 40 : h === "Skill" ? 32 : /^Option/.test(h) ? 18 : 15)),
    numericCols: new Set([TEMPLATE_HEADERS.indexOf("Grade"), TEMPLATE_HEADERS.indexOf("Difficulty Level")]),
    validations: `<dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`,
  };
  const instructions: Sheet = {
    name: "Instructions", widths: [28, 100],
    rows: [
      ["Question import template"],
      ["Prepare your Excel file → Upload → Review → Import."],
      [""],
      ["Rules", ""],
      ...TEACHER_RULES.map((r, i) => [`${i + 1}.`, r]),
      ["", "Rows that start with [Example] are examples: delete them or replace them with your own questions."],
      ["", "Keep your questions on the sheet named “Questions”."],
      [""],
      ["Column", "What to write"],
      ...TEMPLATE_COLUMNS.filter((c) => c.help).map((c) => [`${c.header}${c.required ? "" : " (optional)"}`, c.help]),
      [""],
      ["Question types", SUPPORTED_TYPES.map((t) => t.name).join(", ")],
      ["Difficulty levels", LEVELS.join(" · ")],
      ["Cognitive levels", COGNITIVE_LEVELS.join(", ")],
    ],
  };
  const curriculum: Sheet = { name: "Curriculum", rows: curSheet, widths: [8, 28, 44, 40, 4, 20], headerStyle: true, freeze: true, numericCols: new Set([0]) };
  return workbookXlsx([questions, instructions, curriculum]);
}

/** Any set of sheets as an .xlsx file (the same writer as the template). */
export function workbookXlsx(sheets: Sheet[]): Uint8Array {
  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ]);
}
