/** Loads the school's current academic year and terms for period resolution. */
import type { Calendar } from "../../analytics/periods";
import type { Repo } from "../seeding/repo";

const d = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

export async function loadCalendar(repo: Repo, schoolId: string | null): Promise<Calendar> {
  if (!schoolId) return { year: null, terms: [] };
  const years = await repo.findMany("AcademicYear", { schoolId });
  const y = years.find((x) => x.isCurrent) ?? years.sort((a, b) => d(b.startDate).getTime() - d(a.startDate).getTime())[0];
  if (!y) return { year: null, terms: [] };
  const terms = await repo.findMany("Term", { academicYearId: y.id });
  return {
    year: { name: String(y.name), start: d(y.startDate), end: d(y.endDate) },
    terms: terms.map((t) => ({ name: String(t.name), start: d(t.startDate), end: d(t.endDate) })).sort((a, b) => a.start.getTime() - b.start.getTime()),
  };
}
