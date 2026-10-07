/**
 * A version number for the question bank, bumped by the data layer (PrismaRepo / SqliteRepo) on
 * every write to a table that practice items are built from. In-memory caches of bank data compare
 * versions, so a change made through ANY path (editor, import, bulk publish, AI bank, seeds) is seen
 * at once by the next request in this process. A short time limit covers other processes (the
 * scheduled-jobs worker updates item statistics).
 */
const BANK_MODELS = new Set(["Question", "QuestionOption", "QuestionAnswer", "QuestionExplanation", "QuestionType", "ReadingPassage", "Skill"]);

let version = 0;

export const bankVersion = (): number => version;

/** Called by the data layer for every write; cheap for other tables. */
export function noteWrite(model: string): void {
  if (BANK_MODELS.has(model)) version++;
}

/** Called after a transaction commits, so a cache refilled during the transaction is dropped too. */
export function bumpBankVersion(): void {
  version++;
}
