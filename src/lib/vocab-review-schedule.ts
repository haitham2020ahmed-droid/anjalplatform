/**
 * Spaced-repetition scheduling for previously-missed NAFS vocabulary questions — NO new schema and NO stored
 * "next review date". Pure math over attempt timestamps the student already has; src/server/nafs/practice.ts
 * (dueVocabInPool) does the one database read (NafsPracticeAnswer) and calls this.
 *
 * "Due" is recomputed live, from scratch, every time a practice is about to pick its next question: there is no
 * extra column anywhere, so a question's schedule state is entirely a function of its attempt history at the
 * moment we ask. This keeps the feature honest about the hard constraint (no migration) and means it is always
 * self-consistent even if attempts are read at different times.
 *
 * The schedule is a simple (NOT full SM-2) exponential-ish backoff, as the task asked for:
 *   - missed once → due again VOCAB_REVIEW_SCHEDULE_DAYS[0] days after that miss;
 *   - missed again right after becoming due → due again VOCAB_REVIEW_SCHEDULE_DAYS[1] days after THAT miss;
 *   - and so on, capped at the last step for a question that keeps being missed.
 * "Missed again" means the student's most recent attempt on the question is still wrong; the step used is how
 * many wrong attempts in a row sit at the end of that question's attempt history (a correct answer anywhere
 * resets the run of misses that follows it).
 *
 * "Must not duplicate a question already freshly answered correctly recently": a question whose MOST RECENT
 * attempt is correct is treated as resolved and is never due, however long ago that correct answer was. This is a
 * deliberately simple, honest rule (no second time window to invent) — the moment a student gets it right again,
 * it stops coming back, exactly like "review my mistakes" style features elsewhere in this codebase.
 */

/** Days after the triggering miss that a question becomes due again, indexed by (consecutive misses so far − 1),
 *  capped at the last entry for a question missed more times than this has steps for. */
export const VOCAB_REVIEW_SCHEDULE_DAYS = [2, 5, 10, 20] as const;

export interface VocabAttempt {
  questionId: string;
  correct: boolean;
  /** attempt time, epoch milliseconds */
  at: number;
}

/**
 * The ids of questions (out of every question `attempts` covers) that are due for review right now.
 * Pure: `now` is passed in (epoch ms) so this is fully deterministic and testable.
 */
export function dueVocabQuestionIds(attempts: readonly VocabAttempt[], now: number): Set<string> {
  const byQuestion = new Map<string, VocabAttempt[]>();
  for (const a of attempts) {
    if (!a.questionId) continue;
    const list = byQuestion.get(a.questionId) ?? [];
    list.push(a);
    byQuestion.set(a.questionId, list);
  }
  const due = new Set<string>();
  for (const [questionId, listRaw] of byQuestion) {
    const list = [...listRaw].sort((x, y) => x.at - y.at);
    const last = list[list.length - 1];
    if (last.correct) continue; // resolved, however long ago
    let misses = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].correct) misses++;
      else break;
    }
    const days = VOCAB_REVIEW_SCHEDULE_DAYS[Math.min(misses - 1, VOCAB_REVIEW_SCHEDULE_DAYS.length - 1)];
    if (now - last.at >= days * 86_400_000) due.add(questionId);
  }
  return due;
}
