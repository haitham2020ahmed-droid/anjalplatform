/**
 * Minimal .xlsx reader: returns the FIRST worksheet as rows of strings.
 * An .xlsx file is a ZIP of XML parts; we read the ZIP central directory, inflate
 * only the parts we need with node:zlib, and parse cells (shared strings, inline
 * strings, numbers, booleans, formula results).
 *
 * Why not a spreadsheet library: reading one sheet needs ~150 lines; a full library
 * adds a large dependency and attack surface. Safety limits guard against ZIP bombs.
 */
import { inflateRawSync } from "node:zlib";

const MAX_PART_BYTES = 50 * 1024 * 1024; // decompressed size limit per XML part
const MAX_ROWS = 100_000;

export interface ZipEntry { name: string; method: number; compSize: number; size: number; offset: number }

export function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  // End of central directory: search backwards for signature 0x06054b50
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This is not a valid Excel (.xlsx) file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, ZipEntry>();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("The Excel file is damaged.");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    out.set(name, { name, method, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function readPart(buf: Buffer, e: ZipEntry): string {
  if (e.size > MAX_PART_BYTES) throw new Error("The Excel file is too large to import.");
  const nameLen = buf.readUInt16LE(e.offset + 26);
  const extraLen = buf.readUInt16LE(e.offset + 28);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return data.toString("utf8");
  if (e.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }).toString("utf8");
  throw new Error("Unsupported compression in the Excel file.");
}

const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");

/** Text of all <t> elements inside a fragment (handles rich text runs). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)![0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Reads one worksheet. By default the first sheet in workbook order; with `sheet`, the sheet of that
 * name (case-insensitive) when the workbook has one, else the first sheet.
 */
export function readXlsx(buf: Buffer, opts: { sheet?: string } = {}): string[][] {
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error("This is not a valid Excel (.xlsx) file.");
  const entries = readZipEntries(buf);
  const shared: string[] = [];
  const ss = entries.get("xl/sharedStrings.xml");
  if (ss) for (const m of readPart(buf, ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const wb = readPart(buf, entries.get("xl/workbook.xml") ?? (() => { throw new Error("The Excel file has no workbook."); })());
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unescape(m[0].match(/\bname="([^"]*)"/)?.[1] ?? ""), rid: m[0].match(/\br:id="([^"]+)"/)?.[1] }));
  const wanted = opts.sheet ? sheets.find((x) => x.name.trim().toLowerCase() === opts.sheet!.toLowerCase()) : undefined;
  const firstRid = (wanted ?? sheets[0])?.rid;
  const rels = entries.get("xl/_rels/workbook.xml.rels");
  let sheetPath = "xl/worksheets/sheet1.xml";
  if (rels && firstRid) {
    const relXml = readPart(buf, rels);
    const target = relXml.match(new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`))?.[1]
      ?? relXml.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstRid}"`))?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = entries.get(sheetPath);
  if (!sheet) throw new Error("The Excel file has no worksheet.");
  const xml = readPart(buf, sheet);
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_ROWS) throw new Error(`The file has more than ${MAX_ROWS} rows. Split it into smaller files.`);
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = "";
      if (type === "s" && v !== undefined) val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = textOf(body);
      else if (type === "b") val = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) val = unescape(v);
      const idx = ref ? colIndex(ref) : row.length;
      while (row.length < idx) row.push("");
      row[idx] = val;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Excel stores dates as serial day numbers (1900 system). */
export function excelSerialToDate(n: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86_400_000));
}
