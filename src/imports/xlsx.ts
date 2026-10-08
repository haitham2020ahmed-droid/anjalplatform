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

/**
 * Some programs (the .NET Open XML SDK, several online converters and AI tools) write every tag with
 * a namespace prefix: <x:row>, <x:c>, <x:v>. That is valid Excel, so element prefixes are removed and
 * the file is read like any other (attributes such as r:id are not touched).
 */
const unprefix = (xml: string) => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1").replace(/^\uFEFF/, "");

export function readPart(buf: Buffer, e: ZipEntry): string {
  if (e.size > MAX_PART_BYTES) throw new Error("The Excel file is too large to import.");
  const nameLen = buf.readUInt16LE(e.offset + 26);
  const extraLen = buf.readUInt16LE(e.offset + 28);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return unprefix(data.toString("utf8"));
  if (e.method === 8) return unprefix(inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }).toString("utf8"));
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
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    // keep the sheet's own row numbers (rows Excel leaves out are empty): pictures are anchored to them
    const rn = Number(rm[1].match(/\br="(\d+)"/)?.[1] ?? 0);
    while (rn > 0 && rows.length < rn - 1 && rows.length < MAX_ROWS) rows.push([]);
    if (rows.length >= MAX_ROWS) throw new Error(`The file has more than ${MAX_ROWS} rows. Split it into smaller files.`);
    const row: string[] = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
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


/** Raw bytes of one part (pictures). */
function readBytes(buf: Buffer, e: ZipEntry): Buffer {
  if (e.size > MAX_PART_BYTES) throw new Error("The Excel file is too large to import.");
  const nameLen = buf.readUInt16LE(e.offset + 26), extraLen = buf.readUInt16LE(e.offset + 28);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compSize);
  return e.method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }) : Buffer.from(data);
}

const partPath = (from: string, target: string) => {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
  return parts.join("/");
};
const relsOf = (path: string) => { const i = path.lastIndexOf("/"); return `${path.slice(0, i)}/_rels/${path.slice(i + 1)}.rels`; };
const relTarget = (xml: string, id: string) => xml.match(new RegExp(`<Relationship\\b[^>]*Id="${id}"[^>]*Target="([^"]+)"`))?.[1] ?? xml.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${id}"`))?.[1];

/**
 * Pictures placed in the cells of a sheet (Insert → Picture), by the 0-based row of their top-left
 * corner: the question on that row is the picture's question. The first picture of a row wins.
 */
export function readXlsxImages(buf: Buffer, opts: { sheet?: string } = {}): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) return out;
  const entries = readZipEntries(buf);
  const wbE = entries.get("xl/workbook.xml"), wbRelsE = entries.get("xl/_rels/workbook.xml.rels");
  if (!wbE || !wbRelsE) return out;
  const sheets = [...readPart(buf, wbE).matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unescape(m[0].match(/\bname="([^"]*)"/)?.[1] ?? ""), rid: m[0].match(/\br:id="([^"]+)"/)?.[1] ?? "" }));
  const wanted = (opts.sheet ? sheets.find((x) => x.name.trim().toLowerCase() === opts.sheet!.toLowerCase()) : undefined) ?? sheets[0];
  if (!wanted) return out;
  const sheetTarget = relTarget(readPart(buf, wbRelsE), wanted.rid);
  if (!sheetTarget) return out;
  const sheetPath = partPath("xl/workbook.xml", sheetTarget);
  const sheetRels = entries.get(relsOf(sheetPath));
  if (!sheetRels) return out;
  const relXml = readPart(buf, sheetRels);
  for (const dm of relXml.matchAll(/<Relationship\b[^>]*Type="[^"]*\/drawing"[^>]*>/g)) {
    const t = dm[0].match(/Target="([^"]+)"/)?.[1]; if (!t) continue;
    const drawingPath = partPath(sheetPath, t);
    const dE = entries.get(drawingPath), dRelsE = entries.get(relsOf(drawingPath));
    if (!dE || !dRelsE) continue;
    const dXml = readPart(buf, dE), dRels = readPart(buf, dRelsE);
    for (const am of dXml.matchAll(/<(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[\s\S]*?<\/\1>/g)) {
      const row = Number(am[0].match(/<from>[\s\S]*?<row>(\d+)<\/row>/)?.[1] ?? -1);
      const rid = am[0].match(/r:embed="([^"]+)"/)?.[1];
      if (row < 0 || !rid || out.has(row)) continue;
      const mt = relTarget(dRels, rid); if (!mt) continue;
      const mE = entries.get(partPath(drawingPath, mt)); if (!mE) continue;
      out.set(row, new Uint8Array(readBytes(buf, mE)));
    }
  }
  return out;
}
