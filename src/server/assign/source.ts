/**
 * 🏷️ Server gate of the assignment source (owner r74 §1): every teacher assign path calls `requireSource` before it
 * writes anything, so work without a valid source (MAP | NAFS | CURRICULUM | GRAMMAR | RTI) is refused with a clear
 * ValidationError (EN text, translated in ar.ts). System-created work passes the source of its context.
 */
import { ValidationError } from "../curriculum-admin";
import { parseAssignSource, SOURCE_REQUIRED, type AssignSource } from "../../lib/assign-source";

export { SOURCE_REQUIRED };
export type { AssignSource };

/** The source, or a ValidationError (missing / unknown). */
export function requireSource(v: unknown): AssignSource {
  const src = parseAssignSource(v);
  if (!src) throw new ValidationError(SOURCE_REQUIRED);
  return src;
}
