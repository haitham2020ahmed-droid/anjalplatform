/**
 * Question-bank import, step 1: check the file type from its CONTENT (not just its name) and read
 * it as a table of cells.
 *
 * Only the official template formats are accepted, for accuracy:
 *   CSV (.csv, UTF-8; tab-separated .tsv is read too) and Excel (.xlsx)
 * Word, PDF, images, JSON and plain text are refused with a message that says what to do instead.
 */
import { parseCsv } from "../csv";
import { readXlsx, readXlsxImages, readZipEntries } from "../xlsx";

export type FileKind = "csv" | "xlsx";
/** Excel files may carry the questions' pictures: up to 50 MB. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
/** The sheet the template keeps its questions on (other sheets hold instructions and the curriculum list). */
export const QUESTIONS_SHEET = "Questions";

export interface Extracted {
  kind: FileKind;
  table: string[][];
  /** pictures in the cells, by 0-based sheet row (xlsx only) */
  images?: Map<number, Uint8Array>;
}

export class ExtractError extends Error {}

const USE_TEMPLATE = "Use the official CSV or Excel template for the highest import accuracy.";

export function detectKind(fileName: string, bytes: Uint8Array): FileKind {
  const ext = (fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");
  const head = Buffer.from(bytes.subarray(0, 8));
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") throw new ExtractError(`PDF files cannot be imported. Copy the questions into the Excel template. ${USE_TEMPLATE}`);
  if ((head[0] === 0xff && head[1] === 0xd8) || head.subarray(1, 4).toString("latin1") === "PNG" || head.subarray(0, 3).toString("latin1") === "GIF") {
    throw new ExtractError(`Image files cannot be imported. Type the questions into the Excel template. ${USE_TEMPLATE}`);
  }
  if (head[0] === 0x50 && head[1] === 0x4b) {
    let names: string[];
    try {
      names = [...readZipEntries(Buffer.from(bytes)).keys()];
    } catch {
      throw new ExtractError(`The file looks like an Excel file but it is damaged. Open it in Excel and save it again as .xlsx. ${USE_TEMPLATE}`);
    }
    if (names.some((n) => n.startsWith("xl/"))) return "xlsx";
    if (names.includes("word/document.xml")) throw new ExtractError(`Word files cannot be imported. Copy the questions into the Excel template (one question per row). ${USE_TEMPLATE}`);
    throw new ExtractError(`This file is not an Excel workbook. ${USE_TEMPLATE}`);
  }
  if (head[0] === 0xd0 && head[1] === 0xcf) throw new ExtractError(`Old Excel/Word files (.xls, .doc) are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx). ${USE_TEMPLATE}`);
  if (ext === "xlsx") throw new ExtractError(`The file is named .xlsx but is not a real Excel workbook. Open it in Excel and save it again as .xlsx. ${USE_TEMPLATE}`);
  if (ext === "csv" || ext === "tsv") return "csv";
  if (["xls", "doc", "docx", "pdf", "json", "txt", "md", "rtf", "odt", "ods", "pages", "numbers", "jpg", "jpeg", "png", "gif", "heic"].includes(ext)) {
    throw new ExtractError(`.${ext} files cannot be imported. Only CSV (.csv) and Excel (.xlsx) files are accepted. ${USE_TEMPLATE}`);
  }
  throw new ExtractError(`Unsupported file type${ext ? ` “.${ext}”` : ""}. Only CSV (.csv) and Excel (.xlsx) files are accepted. ${USE_TEMPLATE}`);
}

/** Reads the file as rows of cells. Throws ExtractError with a message a teacher can act on. */
export function extract(fileName: string, bytes: Uint8Array): Extracted {
  if (bytes.length === 0) throw new ExtractError("The file is empty.");
  if (bytes.length > MAX_IMPORT_BYTES) throw new ExtractError("The file is larger than 50 MB. Split it into smaller files.");
  const kind = detectKind(fileName, bytes);
  if (kind === "xlsx") {
    try {
      return { kind, table: readXlsx(Buffer.from(bytes), { sheet: QUESTIONS_SHEET }), images: readXlsxImages(Buffer.from(bytes), { sheet: QUESTIONS_SHEET }) };
    } catch (e) {
      throw new ExtractError(`The Excel file could not be read: ${(e as Error).message}`);
    }
  }
  const raw = decodeText(bytes);
  // Excel in Arabic and many European locales saves "CSV" with semicolons; .tsv uses tabs
  const first = raw.split(/\r?\n/, 1)[0];
  const count = (ch: string) => first.split(ch).length - 1;
  const delimiter = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ",";
  try {
    return { kind, table: parseCsv(raw, delimiter) };
  } catch (e) {
    throw new ExtractError(`The CSV file could not be read: ${(e as Error).message} Check that every quotation mark (") is closed.`);
  }
}

/** UTF-8 (with or without BOM); UTF-16 files saved by Excel ("Unicode Text") are decoded too. */
function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  if (text.includes("\uFFFD")) {
    // not UTF-8 (e.g. saved as "CSV" in an old Excel with a Windows code page): read as Windows-1252
    return new TextDecoder("windows-1252").decode(bytes);
  }
  return text;
}
