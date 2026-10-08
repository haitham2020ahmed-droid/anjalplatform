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
/**
 * The ladder. With the 🌉 Cross-Grade Bridge it has five rungs: 🛟 SUPPORT (the same skill one grade down)
 * → BELOW → ON → ABOVE → 🚀 CHALLENGE (the same skill one grade up). Without bridge questions it is the
 * classic three. The rules are the same on every rung.
 */
export type Rung = "SUPPORT" | Level | "CHALLENGE";
export const LADDER: Rung[] = ["SUPPORT", "BELOW", "ON", "ABOVE", "CHALLENGE"];
const CLASSIC: Rung[] = ["BELOW", "ON", "ABOVE"];
export const RULES = { promoteCorrect: 4, promoteWindow: 5, minAtLevel: 4, demoteMaxCorrect: 1, demoteWindow: 4 } as const;

export interface Step { level: Rung; correct: boolean }
export interface Decision { level: Rung; done: boolean; reason: "MASTERED_ABOVE" | "LIMIT" | "NO_QUESTIONS" | null; path: Rung[] }

/** Replays the answers given so far and decides the current level (pure, testable). */
export function decideLevel(start: Rung, steps: Step[], limit: number, rungs: Rung[] = CLASSIC): Decision {
  const ladder = LADDER.filter((r) => rungs.includes(r));
  const up = (r: Rung) => ladder[ladder.indexOf(r) + 1] ?? null;
  const down = (r: Rung) => (ladder.indexOf(r) > 0 ? ladder[ladder.indexOf(r) - 1] : null);
  let level: Rung = ladder.includes(start) ? start : ladder.includes("BELOW") ? "BELOW" : ladder[0];
  const path: Rung[] = [level];
  let atLevel: boolean[] = [];
  for (const st of steps) {
    if (st.level !== level) continue;            // (only answers at the current rung move it)
    atLevel.push(st.correct);
    const lastP = atLevel.slice(-RULES.promoteWindow), lastD = atLevel.slice(-RULES.demoteWindow);
    if (atLevel.length >= RULES.minAtLevel && lastP.filter(Boolean).length >= RULES.promoteCorrect) {
      const nxt = up(level);
      if (!nxt) return { level, done: true, reason: "MASTERED_ABOVE", path };
      level = nxt; path.push(level); atLevel = [];
    } else if (lastD.length >= RULES.demoteWindow && lastD.filter(Boolean).length <= RULES.demoteMaxCorrect && down(level)) {
      level = down(level)!; path.push(level); atLevel = [];
    }
  }
  return { level, done: steps.length >= limit, reason: steps.length >= limit ? "LIMIT" : null, path };
}

/** Next question at a level: closest Lexile to the student's (else easiest first); never a repeat. */
export function pickNext(pool: { id: string; level: Rung; lexile: number | null; difficulty: number }[], level: Rung, answered: Set<string>, studentLexile: number | null): string | null {
  const left = pool.filter((q) => q.level === level && !answered.has(q.id));
  if (!left.length) return null;
  const key = (q: (typeof left)[number]) => (studentLexile !== null && q.lexile !== null ? Math.abs(q.lexile - studentLexile) : q.difficulty * 1000 + (q.lexile ?? 0) / 10);
  return left.sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id))[0].id;
}
