/**
 * Parsing of an answer submission from the browser (practice and placement).
 *
 * The answer itself (`response`) can be any JSON value (an option label, a list, an
 * object for matching), so its CONTENT is checked later by the scorer. Here we only
 * guarantee the shape: two valid ids and an answer that is actually present. A missing
 * answer is refused with a clear message rather than passed on as `undefined`.
 * (zod 3 infers `z.unknown()` as an optional property, which is why this is explicit.)
 */
import { ValidationError } from "../curriculum-admin";

export interface AnswerInput {
  sessionId: string;
  questionId: string;
  response: unknown;
}

const ID_MAX = 191;

function id(v: unknown, field: string): string {
  if (typeof v !== "string" || v.length < 1 || v.length > ID_MAX) throw new ValidationError(`Invalid ${field}.`);
  return v;
}

export function parseAnswerInput(raw: unknown): AnswerInput {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError("Invalid answer submission.");
  const r = raw as Record<string, unknown>;
  const sessionId = id(r.sessionId, "session");
  const questionId = id(r.questionId, "question");
  if (!("response" in r) || r.response === undefined) throw new ValidationError("Choose an answer before checking.");
  return { sessionId, questionId, response: r.response };
}
