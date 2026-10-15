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

export type ReportKind = "student" | "class" | "standards" | "school" | "grammar" | "games" | "rti" | "levels" | "readmaster" | "readrise" | "warning";
export type ReportFormat = "pdf" | "xlsx" | "csv";
export const REPORT_KINDS: readonly ReportKind[] = ["student", "class", "standards", "school", "grammar", "games", "rti", "levels", "readmaster", "readrise", "warning"];
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
  /**
   * Text values shown as coloured chips (always with their text), e.g. { Below: "bad", On: "info", Above: "good" }.
   * The PDF adds a legend under the table; Excel fills the cell. Values not listed stay plain text.
   */
  tones?: Record<string, Tone>;
  /** One short sentence for the Excel "Read me" sheet (what the column means). */
  help?: string;
  /**
   * 🔗 r79: the row key holding this cell's platform link(s) (src/lib/plan-links.ts; absolute APP_URL links, ids only).
   * One link → the whole cell is clickable; several (space-separated) and a cell of the same number of " · "-separated
   * names → each name is its own link. A link that is not the platform's own page is never printed (plain text).
   * The PDF only: Excel and CSV keep the plain text (the link key is not a column).
   */
  linkKey?: string;
}

/** Colour family of a value. Always shown together with a text label, never colour alone. */
export type Tone = "good" | "info" | "warn" | "bad" | "neutral";

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
  /** Shown in the "At a glance" box (the 3–5 numbers that matter most). */
  glance?: boolean;
  /** Plain-language meaning, e.g. "out of every 100 answers, 42 were right". */
  hint?: string;
}

export type Section =
  | { type: "kpis"; title: string; items: Kpi[] }
  | { type: "bars"; title: string; items: { label: string; value: number | null; isolate?: "latin"; /** mastery band code: colours the bar */ band?: string }[]; max: number; kind: "pct" | "int" }
  | { type: "table"; id: string; title: string; columns: Column[]; rows: TableRow[]; empty: string; note?: string; /** Short Excel sheet name (31-char limit) when the title is long. */ sheet?: string; /** 🔗 r79: one small QR code of this platform link beside the heading (paper copies; PDF only) */ qr?: string }
  | { type: "notes"; title: string; items: string[] }
  /** A plain-language box for families and students ("What this means", "How you can help at home"). */
  | { type: "explain"; title: string; tone?: "info" | "home"; paragraphs?: string[]; items?: string[] };

/** Who a report is written for (shown in the header as "Prepared for"). */
export type Audience = "teacher" | "school" | "family";
/** Colour of the report's source (Curriculum blue, MAP green, RTI orange, Grammar purple, NAFS teal). */
export type Accent = "curriculum" | "map" | "rti" | "grammar" | "nafs";

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
  /** Default: from the kind (student → family, school/levels → school, else teacher). */
  audience?: Audience;
  /** Default: from the kind. */
  accent?: Accent;
  /** 🔗 r79: the plan's items are platform links — the PDF says so at the top ("Everything in this plan is clickable"). */
  links?: boolean;
  /** Footer text instead of "<title> · Confidential" (a document shared with students). */
  footer?: string;
}

export function tableById(doc: ReportDoc, id: string): Extract<Section, { type: "table" }> | undefined {
  return doc.sections.find((s): s is Extract<Section, { type: "table" }> => s.type === "table" && s.id === id);
}
