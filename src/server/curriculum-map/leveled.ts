/**
 * Adaptive progression across the Curriculum Map levels (Below → On → Above) inside one category.
 *   - Start: Below Level, unless the student's data says otherwise (Lexile from MAP, or their level).
 *   - Promote: 4 of the last 5 answers at the current level correct (80%), with at least 4 answered there.
 *   - Demote: 1 or fewer of the last 4 answers at the current level correct (never below Below).
 *   - Finish: Above Level passed (the promotion rule at Above), the question limit reached, or no question left.
 * Within a level, the next question is the unanswered one whose Lexile is closest to the student's
 * (or, without Lexile, the easiest by difficulty), so text complexity rises gradually.
 */
export type Level = "ABOVE" | "ON" | "BELOW";
const UP: Record<Level, Level | null> = { BELOW: "ON", ON: "ABOVE", ABOVE: null };
const DOWN: Record<Level, Level | null> = { BELOW: null, ON: "BELOW", ABOVE: "ON" };
export const RULES = { promoteCorrect: 4, promoteWindow: 5, minAtLevel: 4, demoteMaxCorrect: 1, demoteWindow: 4 } as const;

export interface Step { level: Level; correct: boolean }
export interface Decision { level: Level; done: boolean; reason: "MASTERED_ABOVE" | "LIMIT" | "NO_QUESTIONS" | null; path: Level[] }

/** Replays the answers given so far and decides the current level (pure, testable). */
export function decideLevel(start: Level, steps: Step[], limit: number): Decision {
  let level = start; const path: Level[] = [start];
  let atLevel: boolean[] = [];
  for (const st of steps) {
    if (st.level !== level) continue;            // (only answers at the current level move it)
    atLevel.push(st.correct);
    const lastP = atLevel.slice(-RULES.promoteWindow), lastD = atLevel.slice(-RULES.demoteWindow);
    if (atLevel.length >= RULES.minAtLevel && lastP.filter(Boolean).length >= RULES.promoteCorrect) {
      if (!UP[level]) return { level, done: true, reason: "MASTERED_ABOVE", path };
      level = UP[level]!; path.push(level); atLevel = [];
    } else if (lastD.length >= RULES.demoteWindow && lastD.filter(Boolean).length <= RULES.demoteMaxCorrect && DOWN[level]) {
      level = DOWN[level]!; path.push(level); atLevel = [];
    }
  }
  return { level, done: steps.length >= limit, reason: steps.length >= limit ? "LIMIT" : null, path };
}

/** Next question at a level: closest Lexile to the student's (else easiest first); never a repeat. */
export function pickNext(pool: { id: string; level: Level; lexile: number | null; difficulty: number }[], level: Level, answered: Set<string>, studentLexile: number | null): string | null {
  const left = pool.filter((q) => q.level === level && !answered.has(q.id));
  if (!left.length) return null;
  const key = (q: (typeof left)[number]) => (studentLexile !== null && q.lexile !== null ? Math.abs(q.lexile - studentLexile) : q.difficulty * 1000 + (q.lexile ?? 0) / 10);
  return left.sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id))[0].id;
}
