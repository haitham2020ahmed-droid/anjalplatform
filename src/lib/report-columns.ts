/**
 * 📋 Fewer columns (owner r70): pure rules of the report tables — which columns to show, the plain-words tooltip (ⓘ)
 * of a heading, and a standard shown as its code + a short name (≤ 4 words) with the full text in the tooltip.
 * Used by src/components/report-kit/report-table.tsx and the report pages; unit-tested in tests/report-summary.test.ts.
 */

/** Plain words for the usual headings: the ⓘ tooltip when a column or section gives none of its own. */
export const GLOSSARY: Record<string, string> = {
  Accuracy: "Accuracy = % of answers that were right.",
  "Avg score": "The average score (%) of the counted work.",
  "Avg mastery": "0–100: how well the skills are learned (100 = fully learned).",
  Mastery: "0–100: how well the skill is learned (100 = fully learned).",
  Answers: "How many questions were answered.",
  Rapid: "Answers given too fast to have been read: left out of accuracy.",
  "Rapid guesses": "Answers given too fast to have been read: left out of accuracy.",
  Status: "On track, at risk or no data, from MAP and recent practice.",
  Trend: "Is the student going up, down or staying the same in the last weeks?",
  "Last active": "The last day the student practised.",
  Practised: "Students who answered at least one question in this window.",
  "Practised (week)": "% of the class who answered at least one question this week.",
  "To reteach": "Skills where this student needs the lesson again (5+ careful answers, under 60%).",
  "Skills to reteach": "Skills where several students need the lesson again.",
  "Most common error": "The mistake made most often in the wrong answers.",
  Growth: "How many RIT points the student grew since the Fall MAP.",
  "Expected by now": "The growth NWEA expects by this time of year.",
  Met: "✓ = grew at least as much as expected.",
  "Reading RIT": "The latest MAP Reading score (RIT).",
  "Language RIT": "The latest MAP Language Usage score (RIT).",
  "Mean RIT": "The average MAP score of the students tested.",
  "Median %ile": "The middle national percentile of the students tested.",
  Score: "% of the questions that were right.",
  Average: "The average of the student's graded scores.",
  "Alerts open": "Students a teacher has not followed up yet.",
  "At risk": "Students who need help first (below their target or under 50% accuracy).",
  "On track": "Students meeting their target.",
  Late: "Work past its due date.",
  Participation: "% of the class who took part.",
  Counted: "Reads at the student's level or higher: they count for the level.",
  Practice: "Reads below the student's level: practice only, no level change.",
  Stars: "The students' average rating of the game (1–5 stars).",
  // r72: section headings that had no ⓘ yet
  "Each student's ReadRise level": "Each student's ReadRise level over the year: squares are reading checks, dots are level changes.",
  "Stuck": "Placed students whose ReadRise level has not changed for 4 weeks or more.",
  "Rising fast": "Students whose ReadRise level went up 100 or more in the last 4 weeks.",
  "Class accuracy by question type": "% of first-try answers that were right, for each kind of question. Answers given too fast are left out.",
  "Unreliable readings": "Readings with 2 or more answers given too fast to be read: they did not change the level.",
  "Language profile": "How the student does in each part of English (reading, vocabulary, grammar…), from their answers.",
  "Mistakes and the real gap": "The mistakes this student makes most, and the earlier skill that may be the real cause.",
  "Compared with the class": "Where the student is against classmates: above, around or below the middle of the class.",
  "My Work": "The work given to the student: not started, in progress and done.",
  "Student plans": "The student's support plans and how far they got.",
  "Tests and scores": "The student's test results. Score = % of the questions that were right.",
  "MAP results": "The student's MAP Growth scores (RIT) and the growth from one test to the next.",
  "ReadRise level": "The student's ReadRise reading level and how it changed over the year.",
  "Skills: mastered and needed": "Mastered = scored 80 or more on the skill; needs work = under 60.",
  "Follow-up": "Alerts about this student, what was done, comments and private notes.",
  "Alerts and what was done": "The alerts raised for this student and what the teachers did about each one.",
  "Comments to the student and the parent": "Messages the teachers wrote: the student and the parent can read them.",
  "Private notes": "Notes only staff can see: never shown to the student or the parent.",
  "Writing results": "The student's writing scores (% of the rubric points) and their average.",
  "Student reports": "Printable reports about this student.",
  "MAP (student)": "The student's MAP Growth scores (RIT), the MAP plans sent and the practice MAP tests.",
  "Strong and weak skills": "Strong = 80% or more right; needs work = under 60% right (skills with 5+ answers).",
  "Recent Work": "The latest work given to the student and how far it got.",
  "Writing & Reading Aloud": "Writing scores and reading-aloud (fluency) checks.",
  "Badges": "Badges the student earned on the platform.",
  "Alerts and What Was Done": "The alerts raised for this student and what the teachers did about each one.",
  "Comments to the Student": "Messages the teachers wrote to the student (the parent can read them too).",
  "Private Notes (Staff)": "Notes only staff can see: never shown to the student or the parent.",
  "Class Comparison": "Every class side by side this week: who practised, accuracy, work, MAP and alerts.",
  "Classes This Week": "Each class this week: % of students who practised, accuracy and alerts not handled yet.",
  "Hardest skills": "The skills with the lowest % of right answers in this grade in the last 30 days (20+ answers each).",
  "MAP Reading Growth by Class": "For each class: how many students have a Fall and a later MAP score, and how many grew as much as expected.",
  "Tested (MAP growth)": "Students with a Fall MAP score and a later one.",
  "Practice test": "The school's practice MAP test: who finished it, the class average and who needs support.",
  "Questions answered per week": "How many questions the students answered each week (answers given too fast are left out).",
  "Accuracy by grade": "% of the grade's answers that were right.",
  "Class cards": "Each class: students who practised this week, accuracy and how well the skills are learned.",
  "Standards, lowest first": "The standards with the lowest % of right answers first (5+ answers each).",
  Summary: "Computed from the numbers on this page: who is doing well, who needs help and what to do next.",
  "Action plan": "Buttons that open the page that does each next step.",
};

/** The tooltip of a heading: its own hint, or the glossary's plain words, or nothing. */
export const tipOf = (label: string, hint?: string | null): string | null => hint ?? GLOSSARY[label] ?? null;

/**
 * A standard as code + short name: "S12 Real or not?" — the first ≤ 4 words of its text (trailing punctuation
 * dropped, "…" when cut); the full text goes to the tooltip.
 */
export function shortStandard(code: string, text: string | null | undefined, words = 4): { label: string; short: string; full: string } {
  const full = String(text ?? "").replace(/\s+/g, " ").trim();
  const w = full.split(" ").filter(Boolean);
  let short = w.slice(0, words).join(" ").replace(/[\s,;:.–—-]+$/u, "");
  if (w.length > words) short += "…";
  const c = String(code ?? "").trim();
  return { label: [c, short].filter(Boolean).join(" "), short, full };
}

/** A cell's value for the "empty / the same for everyone" check: a number or text; ELEMENT = rich content. */
export const ELEMENT = Symbol("element");
export type CellValue = string | number | null | typeof ELEMENT;
const BLANK = new Set(["", "—", "-", "–", "0/0"]);
export function cellValue(sortVal: unknown, hasSort: boolean, cell: unknown): CellValue {
  const v = hasSort ? sortVal : cell;
  if (v === null || v === undefined || v === false) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") { const x = v.trim(); return BLANK.has(x) ? null : x; }
  if (typeof v === "boolean") return String(v);
  return ELEMENT;
}

export interface ColRule { key: string; keep?: boolean }
/**
 * Columns to hide automatically: a column that is empty for every row ("—" everywhere), or — with 3+ rows — shows
 * the same value for every row (e.g. always "0/13 mastered"). The first column and `keep` columns always stay;
 * rich cells (links, badges) count as different values unless a sort value says otherwise.
 */
export function autoHidden(cols: readonly ColRule[], rows: readonly { cells: Record<string, unknown>; sort?: Record<string, unknown> }[]): string[] {
  if (!rows.length) return [];
  const out: string[] = [];
  cols.forEach((c, i) => {
    if (i === 0 || c.keep) return;
    const vals = rows.map((r) => cellValue(r.sort?.[c.key], !!r.sort && c.key in r.sort, r.cells[c.key]));
    if (vals.every((v) => v === null)) { out.push(c.key); return; }
    if (rows.length >= 3 && vals.every((v) => v !== ELEMENT && v === vals[0])) out.push(c.key);
  });
  return out;
}

export const COLUMN_KEYS = [...Object.values(GLOSSARY), "More details", "Fewer details", "Not shown (the same for every row): {cols}", "What this shows", "More information"];
