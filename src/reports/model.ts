/**
 * Report document model: what a report says, independent of its file format.
 * Builders (src/server/reports/builders.ts) produce a ReportDoc from the analytics
 * services; renderers turn the same ReportDoc into HTML/PDF, XLSX and CSV, so the
 * three formats can never disagree.
 *
 * Values are stored raw (numbers, ISO dates, band codes); each renderer formats
 * them for its medium (localized text in the PDF, native numbers/dates in Excel).
 */
import type { Locale } from "./i18n";

export type ReportKind = "student" | "class" | "standards" | "school";
export type ReportFormat = "pdf" | "xlsx" | "csv";
export const REPORT_KINDS: readonly ReportKind[] = ["student", "class", "standards", "school"];
export const REPORT_FORMATS: readonly ReportFormat[] = ["pdf", "xlsx", "csv"];

/**
 * Column kinds decide formatting:
 *  text     plain text in the report language
 *  latin    English/Latin content (skill names, codes, student numbers): isolated left-to-right
 *  name     a person's name, which may be Arabic or English: direction detected per value
 *  int      whole number
 *  dec      decimal number (1 place)
 *  pct      percentage stored as 0-100
 *  signed   +/- change
 *  date     ISO date "YYYY-MM-DD"
 *  band     mastery band code (MASTERED…) shown as a coloured chip
 */
export type ColumnKind = "text" | "latin" | "name" | "int" | "dec" | "pct" | "signed" | "date" | "band";

export interface Column {
  key: string;
  label: string;
  kind: ColumnKind;
  /** Relative width hint for PDF tables and Excel columns. */
  width?: number;
  /** Short codes (student numbers, CCSS codes, class names) that should never break across lines. */
  nowrap?: boolean;
}

export type CellValue = string | number | null;
export type TableRow = Record<string, CellValue>;

export interface MetaItem {
  label: string;
  value: string;
  /** Value is English/Latin (e.g. "4A", a student number) or a name of unknown script. */
  isolate?: "latin" | "auto";
}

export interface Kpi {
  label: string;
  value: number | string | null;
  kind: "int" | "dec" | "pct" | "signed" | "latin";
  tone?: "good" | "warn" | "bad" | "neutral";
}

export type Section =
  | { type: "kpis"; title: string; items: Kpi[] }
  | { type: "bars"; title: string; items: { label: string; value: number | null; isolate?: "latin" }[]; max: number; kind: "pct" | "int" }
  | { type: "table"; id: string; title: string; columns: Column[]; rows: TableRow[]; empty: string; note?: string; /** Short Excel sheet name (31-char limit) when the title is long. */ sheet?: string }
  | { type: "notes"; title: string; items: string[] };

export interface Branding {
  /** School name as stored (normally English). */
  name: string;
  /** Optional Arabic school name (SchoolSetting "reports.branding"). */
  nameAr: string | null;
  /** Validated image, or null to show the text-only header. */
  logo: { mime: "image/png" | "image/jpeg" | "image/svg+xml"; bytes: Uint8Array } | null;
}

export interface ReportDoc {
  kind: ReportKind;
  locale: Locale;
  title: string;
  subtitle: string;
  branding: Branding;
  meta: MetaItem[];
  sections: Section[];
  /** Which table becomes the CSV export (CSV holds one table). */
  primaryTable: string;
  /** ASCII stem for file names, e.g. "student-report_S1001_2026-10-04". */
  fileStem: string;
  generatedAt: Date;
  generatedBy: string;
}

export function tableById(doc: ReportDoc, id: string): Extract<Section, { type: "table" }> | undefined {
  return doc.sections.find((s): s is Extract<Section, { type: "table" }> => s.type === "table" && s.id === id);
}
