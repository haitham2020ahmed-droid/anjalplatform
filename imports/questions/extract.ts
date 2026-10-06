/**
 * Question-bank import, step 1: detect the file type from its CONTENT (not just its name)
 * and extract text or table structure.
 *
 *   CSV / Excel  → table (rows of cells)
 *   JSON         → parsed value
 *   Word (.docx) → lines (paragraphs; table rows joined with " | ")
 *   PDF          → lines (text layer via pdfjs-dist; scanned images have no text layer)
 *   TXT          → lines
 */
import { parseCsv } from "../csv";
import { readPart, readXlsx, readZipEntries } from "../xlsx";

export type FileKind = "csv" | "xlsx" | "json" | "docx" | "pdf" | "txt";
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export interface Extracted {
  kind: FileKind;
  table?: string[][];
  json?: unknown;
  lines?: string[];
  /** human-readable notes about the extraction (e.g. pages read) */
  notes: string[];
}

export class ExtractError extends Error {}

export function detectKind(fileName: string, bytes: Uint8Array): FileKind {
  const head = Buffer.from(bytes.subarray(0, 8));
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const names = [...readZipEntries(Buffer.from(bytes)).keys()];
    if (names.includes("word/document.xml")) return "docx";
    if (names.some((n) => n.startsWith("xl/"))) return "xlsx";
    throw new ExtractError("This ZIP-based file is neither a Word document nor an Excel workbook.");
  }
  if (["doc", "xls", "ppt"].includes(ext)) throw new ExtractError(`Old .${ext} files are not supported; save it as .${ext}x first.`);
  const text = Buffer.from(bytes.subarray(0, 4096)).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (ext === "json" || ((text.startsWith("{") || text.startsWith("[")) && ext !== "csv" && ext !== "txt")) return "json";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "txt" || ext === "md" || ext === "") {
    // a plain-text file that is really a table (header with separators on every line)
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
    const sep = (l: string) => (l.match(/,/g) ?? []).length;
    if (lines.length >= 2 && sep(lines[0]) >= 2 && lines.every((l) => sep(l) === sep(lines[0])) && /question|stem/i.test(lines[0])) return "csv";
    return "txt";
  }
  throw new ExtractError(`Unsupported file type “.${ext}”. Upload CSV, Excel (.xlsx), Word (.docx), PDF, JSON or TXT.`);
}

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Word paragraphs as lines; numbered-list paragraphs get a "#." prefix so numbering is not lost. */
export function docxLines(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const e = readZipEntries(buf).get("word/document.xml");
  if (!e) throw new ExtractError("The Word file has no document body.");
  const xml = readPart(buf, e);
  const lines: string[] = [];
  const body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    // a table becomes one line per row: "cell | cell | cell"
    const rows = tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
    return rows.map((r) => `<w:p><w:r><w:t>${(r.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) ?? []).map((c) => (c.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")).join(" | ")}</w:t></w:r></w:p>`).join("");
  });
  let n = 0;
  for (const p of body.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = decodeXml((p.match(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g) ?? []).map((t) => (t === "<w:tab/>" ? " " : t.replace(/<[^>]+>/g, ""))).join(""));
    const numbered = /<w:numPr>/.test(p);
    if (!text.trim()) {
      lines.push("");
      continue;
    }
    lines.push(numbered && !/^\s*(\d+|[A-Ha-h])[.)]/.test(text) ? `${++n}. ${text}` : text);
  }
  return lines;
}

/** PDF text layer, line by line (pdfjs-dist, loaded only when a PDF is imported). */
export async function pdfLines(bytes: Uint8Array, maxPages = 200): Promise<{ lines: string[]; pages: number }> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument(o: { data: Uint8Array; isEvalSupported: boolean; useSystemFonts: boolean; disableFontFace: boolean }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean; transform?: number[] }[] }> }> }> };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  const lines: string[] = [];
  const pages = Math.min(doc.numPages, maxPages);
  for (let p = 1; p <= pages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let line = "";
    let lastY: number | null = null;
    for (const it of content.items) {
      const y = it.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line.trim()) {
        lines.push(line.trimEnd());
        line = "";
      }
      line += it.str ?? "";
      lastY = y;
      if (it.hasEOL) {
        lines.push(line.trimEnd());
        line = "";
        lastY = null;
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
    lines.push("");
  }
  return { lines, pages };
}

export async function extract(fileName: string, bytes: Uint8Array): Promise<Extracted> {
  if (bytes.length === 0) throw new ExtractError("The file is empty.");
  if (bytes.length > MAX_IMPORT_BYTES) throw new ExtractError("The file is larger than 10 MB. Split it into smaller files.");
  const kind = detectKind(fileName, bytes);
  const text = () => Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/, "");
  switch (kind) {
    case "csv": {
      const raw = text();
      const tab = raw.split("\n", 1)[0].includes("\t") && !raw.split("\n", 1)[0].includes(",");
      return { kind, table: tab ? raw.split(/\r?\n/).map((l) => l.split("\t")) : parseCsv(raw), notes: [] };
    }
    case "xlsx":
      return { kind, table: readXlsx(Buffer.from(bytes)), notes: ["first sheet read"] };
    case "json":
      try {
        return { kind, json: JSON.parse(text()), notes: [] };
      } catch (e) {
        throw new ExtractError(`The JSON file is not valid: ${(e as Error).message}`);
      }
    case "docx":
      return { kind, lines: docxLines(bytes), notes: [] };
    case "pdf": {
      const { lines, pages } = await pdfLines(bytes);
      if (!lines.some((l) => l.trim())) throw new ExtractError("No text found in this PDF. It may be a scanned image; export it as text or Word first.");
      return { kind, lines, notes: [`${pages} page(s) read`] };
    }
    case "txt":
      return { kind, lines: text().split(/\r?\n/), notes: [] };
  }
}

