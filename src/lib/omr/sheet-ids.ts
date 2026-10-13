/**
 * Long database ids (cuids) → the short ids a bubble-sheet code can carry, and back.
 *
 *   test:    a stable 20-bit hash of the test id (fits MAX_TEST_ID)  — the grading page already knows its test, so the
 *            decoded value is only compared with sheetTestNo(testId) to refuse a sheet of another test
 *   student: a stable 15-bit hash of the student id (fits MAX_STUDENT_ID) — matched against the students of the class
 *            being graded; when two students of one class share a hash, their sheets print WITHOUT a student code (the
 *            name is still printed and the teacher picks the student on the review screen)
 * Pure and deterministic (same id → same number on every server and in the browser).
 */
import { ALPHABET, MAX_STUDENT_ID, MAX_TEST_ID, decodeSheetCode, encodeSheetCode } from "./layout";

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const base32 = (v: number) => { if (v === 0) return "0"; let s = ""; while (v > 0) { s = ALPHABET[v % 32] + s; v = Math.floor(v / 32); } return s; };

/** The short test number printed on every sheet of this test. */
export const sheetTestNo = (testId: string): string => base32(fnv1a(`t:${testId}`) % (MAX_TEST_ID + 1));
/** The short student number for one student. */
export const sheetStudentNo = (studentId: string): string => base32(fnv1a(`s:${studentId}`) % (MAX_STUDENT_ID + 1));

/**
 * The codes for one class: student id → sheet code; students whose short number collides with a classmate's get a
 * sheet without a student part (blank code for the student, teacher chooses).
 */
export function classSheetCodes(testId: string, studentIds: string[]): Map<string, string> {
  const t = sheetTestNo(testId), count = new Map<string, number>();
  for (const id of studentIds) { const n = sheetStudentNo(id); count.set(n, (count.get(n) ?? 0) + 1); }
  return new Map(studentIds.map((id) => {
    const n = sheetStudentNo(id);
    return [id, encodeSheetCode({ testId: t, studentId: (count.get(n) ?? 0) > 1 ? null : n })];
  }));
}
/** A blank sheet's code (test only). */
export const blankSheetCode = (testId: string): string => encodeSheetCode({ testId: sheetTestNo(testId), studentId: null });

/** Reads a scanned code for this test: wrongTest when it belongs to another test; studentId when it matches one student. */
export function matchSheetCode(code: string | null, testId: string, studentIds: string[]): { wrongTest: boolean; studentId: string | null } {
  const d = code ? decodeSheetCode(code) : null;
  if (!d) return { wrongTest: false, studentId: null };
  if (d.testId !== sheetTestNo(testId)) return { wrongTest: true, studentId: null };
  if (!d.studentId) return { wrongTest: false, studentId: null };
  const hits = studentIds.filter((id) => sheetStudentNo(id) === d.studentId);
  return { wrongTest: false, studentId: hits.length === 1 ? hits[0] : null };
}
