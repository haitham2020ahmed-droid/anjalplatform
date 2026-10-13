/**
 * Bubble (OMR) answer sheet layout — everything in millimetres on A4 portrait (210 × 297), origin top-left.
 * Deterministic: the same number of questions always gives the same layout, so a printed sheet and the
 * reader agree without storing anything.
 *
 * Sheet code: a short base-32 (Crockford) string printed as text and as a strip of bubbles (5 bits per digit).
 *   code = 4 digits test part + 3 digits student part + 1 check digit (Luhn mod 32) = 8 characters.
 * The test part and the student part are short ids (canonical base-32 / decimal-digit strings): long database ids
 * (cuids) are mapped by the server to a short per-test sheet number and a per-test seat number.
 */

export const A4_W = 210;
export const A4_H = 297;

export interface SheetLayout {
  version: 1;
  questions: number; // 1..60
  choices: 4; // A B C D
  markers: { x: number; y: number; size: number }[]; // 4 solid squares (TL, TR, BL, BR), top-left corner + side
  idBox?: { x: number; y: number; w: number; h: number }; // where the code is printed (text + bubble strip)
  bubbles: { q: number; choice: 0 | 1 | 2 | 3; cx: number; cy: number; r: number }[];
  /** The code strip: STRIP_BITS small bubbles, printed filled for 1 and empty for 0 (see stripBits). */
  idBits: { cx: number; cy: number; r: number }[];
  /** Printed row numbers: one per question. */
  labels: { q: number; x: number; y: number }[];
  /** Column header letters (A B C D) above each column. */
  headers: { choice: 0 | 1 | 2 | 3; x: number; y: number }[];
}

export const MAX_QUESTIONS = 60;
export const MARKER_SIZE = 10;
export const BUBBLE_R = 2.6;
export const STRIP_BITS = 48;
export const CODE_LENGTH = 8;
export const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;
/** Centres of the four markers in the order TL, TR, BL, BR. */
export const MARKER_CENTERS: [number, number][] = [[15, 15], [195, 15], [15, 282], [195, 282]];

const ROW_TOP = 67;
const ROW_PITCH = 10.5;
const ROWS_PER_COLUMN = 20;
const AREA_X = 24;
const AREA_W = 162;
const CHOICE_PITCH = 9;
const STRIP_X = 79;
const STRIP_PITCH = 4.35;
const STRIP_R = 1.35;
const STRIP_ROWS_Y = [37.5, 43.5];

export function sheetLayout(questions: number): SheetLayout {
  if (!Number.isInteger(questions) || questions < 1 || questions > MAX_QUESTIONS) throw new RangeError("questions must be 1..60");
  const half = MARKER_SIZE / 2;
  const markers = MARKER_CENTERS.map(([cx, cy]) => ({ x: cx - half, y: cy - half, size: MARKER_SIZE }));
  const cols = Math.ceil(questions / ROWS_PER_COLUMN);
  const rows = Math.ceil(questions / cols);
  const colW = AREA_W / cols;
  const blockW = 12 + 3 * CHOICE_PITCH + BUBBLE_R; // number label + 4 bubbles
  const bubbles: SheetLayout["bubbles"] = [];
  const labels: SheetLayout["labels"] = [];
  const headers: SheetLayout["headers"] = [];
  for (let c = 0; c < cols; c++) {
    const x0 = AREA_X + c * colW + (colW - blockW) / 2;
    for (let k = 0; k < 4; k++) headers.push({ choice: k as 0 | 1 | 2 | 3, x: round(x0 + 12 + k * CHOICE_PITCH), y: ROW_TOP - 6 });
    for (let r = 0; r < rows; r++) {
      const q = c * rows + r + 1;
      if (q > questions) break;
      const cy = round(ROW_TOP + r * ROW_PITCH);
      labels.push({ q, x: round(x0 + 6.5), y: cy });
      for (let k = 0; k < 4; k++) bubbles.push({ q, choice: k as 0 | 1 | 2 | 3, cx: round(x0 + 12 + k * CHOICE_PITCH), cy, r: BUBBLE_R });
    }
  }
  const idBits: SheetLayout["idBits"] = [];
  for (let i = 0; i < STRIP_BITS; i++) {
    const row = Math.floor(i / (STRIP_BITS / 2)), col = i % (STRIP_BITS / 2);
    idBits.push({ cx: round(STRIP_X + col * STRIP_PITCH), cy: STRIP_ROWS_Y[row], r: STRIP_R });
  }
  return { version: 1, questions, choices: 4, markers, idBox: { x: AREA_X, y: 33, w: AREA_W, h: 15 }, bubbles, idBits, labels, headers };
}

function round(v: number): number { return Math.round(v * 100) / 100; }

// ---------------------------------------------------------------- sheet code

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base 32 (no I L O U)
const TEST_DIGITS = 4;
const STUDENT_DIGITS = 3;

function normChar(ch: string): number {
  const c = ch.toUpperCase();
  const alias = c === "O" ? "0" : c === "I" || c === "L" ? "1" : c;
  return ALPHABET.indexOf(alias);
}

/** Value of a short base-32 id, or -1 if it is not one. */
function idValue(id: string): number {
  const s = id.trim();
  if (!s || s.length > 7) return -1;
  let v = 0;
  for (const ch of s) {
    const d = normChar(ch);
    if (d < 0) return -1;
    v = v * 32 + d;
  }
  return v;
}

function digits(v: number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) { s = ALPHABET[v % 32] + s; v = Math.floor(v / 32); }
  return s;
}

function canonical(v: number): string {
  if (v === 0) return "0";
  let s = "";
  while (v > 0) { s = ALPHABET[v % 32] + s; v = Math.floor(v / 32); }
  return s;
}

/** Luhn mod 32 check digit: catches every single-digit error and every adjacent swap. */
function luhnCheck(values: number[]): number {
  let factor = 2, sum = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    let a = factor * values[i];
    factor = factor === 2 ? 1 : 2;
    a = Math.floor(a / 32) + (a % 32);
    sum += a;
  }
  return (32 - (sum % 32)) % 32;
}

export const MAX_TEST_ID = 32 ** TEST_DIGITS - 1; // 1,048,575
export const MAX_STUDENT_ID = 32 ** STUDENT_DIGITS - 2; // 32,766 (0 in the code means "no student")

/**
 * testId / studentId: short ids made of digits and base-32 letters (e.g. "17", "3K9"). Decoding returns them in
 * canonical form (upper case, no leading zeros). Throws RangeError for ids that do not fit.
 */
export function encodeSheetCode(input: { testId: string; studentId: string | null }): string {
  const t = idValue(input.testId);
  if (t < 0 || t > MAX_TEST_ID) throw new RangeError("testId must be a short base-32 id (≤ 4 digits)");
  let s = 0;
  if (input.studentId !== null) {
    const v = idValue(input.studentId);
    if (v < 0 || v > MAX_STUDENT_ID) throw new RangeError("studentId must be a short base-32 id (≤ 3 digits)");
    s = v + 1;
  }
  const payload = digits(t, TEST_DIGITS) + digits(s, STUDENT_DIGITS);
  return payload + ALPHABET[luhnCheck([...payload].map(normChar))];
}

/** Accepts the code with spaces/hyphens and lower case, O→0, I/L→1. Null if malformed or the check digit fails. */
export function decodeSheetCode(code: string): { testId: string; studentId: string | null } | null {
  const clean = code.replace(/[\s-]/g, "");
  if (clean.length !== CODE_LENGTH) return null;
  const vals = [...clean].map(normChar);
  if (vals.some((v) => v < 0)) return null;
  if (luhnCheck(vals.slice(0, CODE_LENGTH - 1)) !== vals[CODE_LENGTH - 1]) return null;
  let t = 0, s = 0;
  for (let i = 0; i < TEST_DIGITS; i++) t = t * 32 + vals[i];
  for (let i = TEST_DIGITS; i < TEST_DIGITS + STUDENT_DIGITS; i++) s = s * 32 + vals[i];
  return { testId: canonical(t), studentId: s === 0 ? null : canonical(s - 1) };
}

/** "ABCD-EFGH" for printing. */
export function formatSheetCode(code: string): string {
  const c = code.replace(/[\s-]/g, "").toUpperCase();
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/**
 * The strip's 48 bits: bit 0 = 1 (guard), bits 1..40 = the 8 code digits (5 bits each, most significant first),
 * bits 41..46 = number of questions (6 bits), bit 47 = even parity over bits 41..46.
 */
export function stripBits(code: string, questions: number): boolean[] {
  const clean = code.replace(/[\s-]/g, "");
  const vals = [...clean].map(normChar);
  if (vals.length !== CODE_LENGTH || vals.some((v) => v < 0)) throw new RangeError("bad sheet code");
  const bits: boolean[] = [true];
  for (const v of vals) for (let b = 4; b >= 0; b--) bits.push(((v >> b) & 1) === 1);
  let parity = false;
  for (let b = 5; b >= 0; b--) { const on = ((questions >> b) & 1) === 1; bits.push(on); if (on) parity = !parity; }
  bits.push(parity);
  return bits;
}

/** Inverse of stripBits: null unless the guard, the parity and the code's check digit are all right. */
export function readStripBits(bits: boolean[]): { code: string; questions: number } | null {
  if (bits.length !== STRIP_BITS || !bits[0]) return null;
  let code = "";
  for (let d = 0; d < CODE_LENGTH; d++) {
    let v = 0;
    for (let b = 0; b < 5; b++) v = v * 2 + (bits[1 + d * 5 + b] ? 1 : 0);
    code += ALPHABET[v];
  }
  let q = 0, parity = false;
  for (let b = 0; b < 6; b++) { const on = bits[41 + b]; q = q * 2 + (on ? 1 : 0); if (on) parity = !parity; }
  if (parity !== bits[47]) return null;
  if (!decodeSheetCode(code)) return null;
  return { code, questions: q };
}
