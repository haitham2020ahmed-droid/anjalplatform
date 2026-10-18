/**
 * 🏷️ r82: the source (r74) a Ministry booklet test was given to a class with — saved with the booklet's test as
 * settings.sourceByClass { classId: "NAFS" | … } (no new column). Pure and tiny: the Assigned page and My Work read it
 * without loading the NAFS center.
 */
import { parseAssignSource, type AssignSource } from "../../lib/assign-source";

export function bookletSourceOf(settings: unknown, classId: string): AssignSource | null {
  let st: unknown = settings;
  if (typeof st === "string") { try { st = JSON.parse(st); } catch { return null; } }
  const by = st && typeof st === "object" ? (st as Record<string, unknown>).sourceByClass : null;
  return by && typeof by === "object" ? parseAssignSource((by as Record<string, unknown>)[classId]) : null;
}
