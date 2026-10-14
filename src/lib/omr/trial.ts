/**
 * 🧪 The bubble-sheet trial (teacher → NAFS → Marking → "Print a trial sheet"): one A4 sheet of 20 questions with
 * its answer key printed beside the bubbles. The teacher (or the owner) fills it with a pencil as the key says —
 * including a few hard cases on purpose — photographs it with a phone and checks what the reader got. Nothing is
 * saved: the photo is read in the browser and compared with the key here.
 */
import { encodeSheetCode, sheetLayout, type SheetLayout } from "./layout";
import type { OmrResult, OmrRow } from "./read";

export const TRIAL_QUESTIONS = 20;
/** The trial's sheet number (a short base-32 id no real test uses: real tests are numbered from 1 per test). */
export const TRIAL_TEST_ID = "TR1";
export const trialLayout = (): SheetLayout => sheetLayout(TRIAL_QUESTIONS);
export const trialCode = (): string => encodeSheetCode({ testId: TRIAL_TEST_ID, studentId: null });

export type TrialHow = "FILL" | "LIGHT" | "ERASE_CHANGE" | "BLANK" | "TWO";
/** What to do on each question: the letter to fill (null = leave it empty) and how (the hard cases are marked). */
export interface TrialItem { q: number; answer: 0 | 1 | 2 | 3 | null; how: TrialHow; erase?: 0 | 1 | 2 | 3; second?: 0 | 1 | 2 | 3 }
export const TRIAL_KEY: readonly TrialItem[] = [
  { q: 1, answer: 1, how: "FILL" }, { q: 2, answer: 3, how: "FILL" }, { q: 3, answer: 0, how: "FILL" }, { q: 4, answer: 2, how: "LIGHT" },
  { q: 5, answer: 2, how: "FILL" }, { q: 6, answer: 1, how: "FILL" }, { q: 7, answer: 0, how: "FILL" }, { q: 8, answer: 3, how: "FILL" },
  { q: 9, answer: 2, how: "ERASE_CHANGE", erase: 1 }, { q: 10, answer: 0, how: "FILL" }, { q: 11, answer: 3, how: "FILL" }, { q: 12, answer: 1, how: "FILL" },
  { q: 13, answer: null, how: "BLANK" }, { q: 14, answer: 2, how: "FILL" }, { q: 15, answer: 0, how: "FILL" }, { q: 16, answer: 3, how: "FILL" },
  { q: 17, answer: 1, how: "TWO", second: 3 }, { q: 18, answer: 2, how: "FILL" }, { q: 19, answer: 1, how: "FILL" }, { q: 20, answer: 0, how: "FILL" },
];
/** The words of each way of filling (interface strings, translated where shown). */
export const TRIAL_HOW: Record<TrialHow, string> = {
  FILL: "Fill",
  LIGHT: "Fill it LIGHTLY (a soft pencil touch)",
  ERASE_CHANGE: "Fill {e}, rub it out well, then fill {a}",
  BLANK: "Leave it empty",
  TWO: "Fill TWO bubbles: {a} and {b}",
};
/** What a good reader does with each way: read it, or ask the teacher (never guess). */
export const TRIAL_EXPECT: Record<TrialHow, "READ" | "READ_OR_CHECK" | "BLANK" | "CHECK"> = { FILL: "READ", LIGHT: "READ_OR_CHECK", ERASE_CHANGE: "READ", BLANK: "BLANK", TWO: "CHECK" };

export interface TrialRow { q: number; expected: 0 | 1 | 2 | 3 | null; how: TrialHow; read: 0 | 1 | 2 | 3 | null; status: OmrRow["status"] | "MISSING"; verdict: "RIGHT" | "CHECKED" | "WRONG" }
export interface TrialCheck { ok: boolean; error: OmrResult["error"] | null; codeOk: boolean; rows: TrialRow[]; right: number; checked: number; wrong: number }

/**
 * Compares a read sheet with the key: RIGHT (read as the key says), CHECKED (the reader asked the teacher — correct
 * for a double mark, acceptable for a light mark), WRONG (read confidently but differently: the reader must never
 * do this).
 */
export function compareTrial(res: OmrResult): TrialCheck {
  if (!res.ok) return { ok: false, error: res.error ?? null, codeOk: false, rows: [], right: 0, checked: 0, wrong: 0 };
  const rows: TrialRow[] = TRIAL_KEY.map((k) => {
    const r = res.rows.find((x) => x.q === k.q);
    const status = r?.status ?? "MISSING";
    const read = r && r.status === "OK" ? r.answer : null;
    const exp = TRIAL_EXPECT[k.how];
    let verdict: TrialRow["verdict"];
    if (status === "UNSURE" || status === "MULTIPLE") verdict = exp === "CHECK" || exp === "READ_OR_CHECK" ? "RIGHT" : "CHECKED";
    else if (exp === "CHECK") verdict = "WRONG";
    else if (status === "BLANK") verdict = k.answer === null ? "RIGHT" : "WRONG";
    else verdict = status === "OK" && read === k.answer ? "RIGHT" : "WRONG";
    return { q: k.q, expected: k.answer, how: k.how, read, status, verdict };
  });
  return { ok: true, error: null, codeOk: res.code === trialCode(), rows, right: rows.filter((r) => r.verdict === "RIGHT").length, checked: rows.filter((r) => r.verdict === "CHECKED").length, wrong: rows.filter((r) => r.verdict === "WRONG").length };
}
