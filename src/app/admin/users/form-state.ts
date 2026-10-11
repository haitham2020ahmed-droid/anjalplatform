/**
 * Pure helpers of the create-user form (no React, so tests can import them).
 *
 * The bug they fix: after a successful create, the form's fields reset (the role select shows “Student”) but the
 * React state kept the last role, so the teacher fields stayed on screen. The form now resets its state with the form.
 */
export const DEFAULT_ROLE = "STUDENT";
/** Roles offered in the create form. PARENT stays in the code (MANAGED_ROLES) but is not offered: it is unused. */
export const FORM_ROLES = [
  { value: "STUDENT", label: "Student" },
  { value: "TEACHER", label: "Teacher" },
  { value: "SCHOOL_ADMIN", label: "School admin" },
] as const;

/** The role the form shows after an action answered: back to the default after a success, unchanged after an error. */
export function roleAfterResult(result: { ok?: boolean; error?: string } | null | undefined, current: string): string {
  return result?.ok && !result.error ? DEFAULT_ROLE : current;
}

export interface FormClass { id: string; name: string; grade: number }
/** Classes grouped by grade 1–12 (only grades that have classes), names in natural order (4A, 4B, 4C … 4J). */
export function classesByGrade(classes: FormClass[]): { grade: number; classes: FormClass[] }[] {
  const out: { grade: number; classes: FormClass[] }[] = [];
  for (let g = 1; g <= 12; g++) {
    const list = classes.filter((c) => c.grade === g).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (list.length) out.push({ grade: g, classes: list });
  }
  return out;
}

/** “+ Add class” rows travel as hidden inputs `newClass` = "grade|name"; this reads them back (invalid rows dropped). */
export function parseNewClasses(values: unknown[]): { gradeLevel: number; name: string }[] {
  const out: { gradeLevel: number; name: string }[] = [];
  for (const v of values) {
    const [g, ...rest] = String(v ?? "").split("|");
    const gradeLevel = Number(g), name = rest.join("|").trim();
    if (Number.isInteger(gradeLevel) && gradeLevel >= 1 && gradeLevel <= 12 && name) out.push({ gradeLevel, name: name.slice(0, 20) });
  }
  return out.slice(0, 20);
}
