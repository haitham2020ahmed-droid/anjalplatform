/**
 * RFC 4180 CSV parsing (quotes, escaped quotes, commas and newlines inside quotes,
 * CRLF/LF, UTF-8 BOM from Excel) and safe CSV writing.
 *
 * Writing defends against spreadsheet formula injection: a cell beginning with
 * = + - @ (or tab/CR) could execute as a formula when opened in Excel, so it is
 * prefixed with an apostrophe. Plain negative numbers are left untouched.
 */

export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (inQuotes) throw new Error("The file has an unclosed quotation mark.");
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const FORMULA = /^[=+\-@\t\r]/;

export function safeCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (FORMULA.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(safeCell).join(",")).join("\r\n") + "\r\n";
}
