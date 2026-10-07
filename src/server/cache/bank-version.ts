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
/** Models whose changes can alter who a user is or what they may see (roles, classes, memberships). */
const AUTH_MODELS = new Set(["User", "RolePermission", "Teacher", "ClassTeacher", "ClassMembership", "Student", "Parent", "ParentStudent", "Class", "School"]);
let authV = 0;
export const authVersion = (): number => authV;

/** Write counter per model: reference data cached in memory is reused only while its counter is unchanged. */
const perModel = new Map<string, number>();
export const modelVersion = (...models: string[]): string => models.map((m) => perModel.get(m) ?? 0).join(".");

export function noteWrite(model: string): void {
  perModel.set(model, (perModel.get(model) ?? 0) + 1);
  if (BANK_MODELS.has(model)) version++;
  if (AUTH_MODELS.has(model)) authV++;
}

/** Called after a transaction commits, so a cache refilled during the transaction is dropped too. */
export function bumpBankVersion(): void {
  version++;
}
