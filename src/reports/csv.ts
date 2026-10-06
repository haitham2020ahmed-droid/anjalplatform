/**
 * ReportDoc → CSV of its primary table (CSV holds one table; Excel/PDF hold all).
 *
 * Uses the Phase 9 writer: UTF-8 with BOM (so Excel shows Arabic correctly),
 * CRLF, and formula-injection defence. Values are raw and machine-friendly:
 * percentages as 0-100 numbers (the header says "%"), dates as YYYY-MM-DD, bands
 * as localized labels, Western digits in both languages.
 */
import { toCsv } from "../imports/csv";
import { bandLabel } from "./i18n";
import { tableById, type ReportDoc } from "./model";

export function renderCsv(doc: ReportDoc): string {
  const table = tableById(doc, doc.primaryTable);
  if (!table) throw new Error(`Report ${doc.kind} has no table "${doc.primaryTable}".`);
  const header = table.columns.map((c) => (c.kind === "pct" ? `${c.label} (%)` : c.label));
  const rows = table.rows.map((r) =>
    table.columns.map((c) => {
      const v = r[c.key] ?? null;
      if (v === null) return "";
      if (c.kind === "band") return bandLabel(doc.locale, String(v));
      if (c.kind === "dec" || c.kind === "signed") return Math.round(Number(v) * 10) / 10;
      return v;
    }),
  );
  return toCsv([header, ...rows]);
}
