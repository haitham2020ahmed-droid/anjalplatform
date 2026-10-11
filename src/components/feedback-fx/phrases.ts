/**
 * 🎉 Answer feedback words (pure, no React): encouraging phrases after a right answer, kind ones after a wrong
 * answer, special ones for a streak of 3 / 5 / 10, and a small celebration at the end of a practice. Every phrase is an
 * interface string (en.ts UI_STRINGS, Arabic in ar.ts) shown through t().
 *
 * Presentation only: nothing here reads or changes a score, a level or mastery.
 * In a TEST nothing is revealed: only a neutral "answer saved" tick (answerReveal("test", …)).
 */

export const CORRECT_PHRASES = [
  "Great job!", "You're on fire! 🔥", "Super reader!", "Brilliant!", "Way to go!", "Awesome thinking!", "Nailed it!",
  "Fantastic!", "You got it! ⭐", "Excellent work!", "Keep it up!", "Smart thinking!", "Wonderful!", "Spot on!", "Superstar! 🌟",
] as const;

export const WRONG_PHRASES = [
  "Nice try! Let's look at it together.", "Almost! You can do it 💪", "Good effort! Let's check the answer.",
  "Mistakes help us learn.", "Not this time — you'll get the next one!", "Keep going, you're learning!",
  "That's OK! Let's see why.", "So close! Look at the answer below.", "Every try makes you stronger.",
  "Don't give up — you're doing well!", "Let's learn from this one.", "Good thinking — let's check it together.",
] as const;

/** Streaks of right answers in a row that get their own phrase. */
export const STREAK_PHRASES: Readonly<Record<number, string>> = {
  3: "3 in a row! 🌟",
  5: "5 in a row! You're unstoppable! 🚀",
  10: "10 in a row! Amazing! 🏆",
};

export const END_PHRASES = ["You finished! Well done! 🎉", "Practice complete — great effort! 🎉", "All done! Be proud of yourself! 🌟"] as const;

export const FX_STRINGS = ["Answer saved", "Sound on", "Sound off", ...CORRECT_PHRASES, ...WRONG_PHRASES, ...Object.values(STREAK_PHRASES), ...END_PHRASES];

/** The streak phrase for this many right answers in a row (3, 5, 10), or null. */
export function streakPhrase(streak: number): string | null {
  return STREAK_PHRASES[streak] ?? null;
}

/** A random picker that never gives the same phrase twice in a row. `rnd` (0–1) for tests. */
export function makePicker(list: readonly string[], rnd: () => number = Math.random): () => string {
  let last = -1;
  return () => {
    if (list.length <= 1) return list[0] ?? "";
    let i = Math.floor(rnd() * list.length) % list.length;
    if (i === last) i = (i + 1 + Math.floor(rnd() * (list.length - 1))) % list.length;
    if (i === last) i = (i + 1) % list.length;
    last = i;
    return list[i];
  };
}

/** Right answers in a row: +1 when right, back to 0 when wrong. */
export function createStreak(): { record(correct: boolean): number; reset(): void; readonly value: number } {
  let n = 0;
  return { record(correct) { n = correct ? n + 1 : 0; return n; }, reset() { n = 0; }, get value() { return n; } };
}

export type FxMode = "practice" | "test";
export type FxSound = "chime" | "soft" | "tick" | "celebrate";
export interface FxReveal {
  sound: FxSound;
  /** the phrase to show (English; through t()), or null */
  phrase: string | null;
  /** may the screen show right / wrong? (never in a test) */
  reveal: boolean;
  /** the small pop / confetti */
  confetti: boolean;
}

/**
 * What one answer shows and plays. Practice: a chime + an encouraging phrase (a streak phrase at 3 / 5 / 10) and a
 * small pop, or a soft low tone + a kind phrase. Test: only a neutral tick and "Answer saved" — no right / wrong.
 */
export function answerReveal(mode: FxMode, correct: boolean, streak: number, pick: { correct: () => string; wrong: () => string }): FxReveal {
  if (mode === "test") return { sound: "tick", phrase: "Answer saved", reveal: false, confetti: false };
  if (!correct) return { sound: "soft", phrase: pick.wrong(), reveal: true, confetti: false };
  return { sound: "chime", phrase: streakPhrase(streak) ?? pick.correct(), reveal: true, confetti: true };
}
