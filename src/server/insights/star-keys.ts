/**
 * ⭐ Small shared readers on the star book (round 4): skills by KEY, the hidden Curriculum Map holder skill left out,
 * "weakest skill" = 🔄 needs review first, then the lowest star score among the started (◐) skills — the one rule the
 * class reports, the department page, early warning and Week in Review use.
 */
import { starLearning, starMastered, starNeedsReview, type StarBook } from "../skills/star-read";
import type { StarView } from "../skills/status";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
// the hidden holder skill's keys: teacher/queries.ts hiddenStarKeys(repo, book)

/** The KEYS a student earned ⭐ in [from, to] (masteredAt in range), the latest first; hidden keys left out. */
export function newStarKeys(book: StarBook, studentId: string, from: Date | number, to: Date | number, hidden: ReadonlySet<string> = new Set()): string[] {
  const a = new Date(from).getTime(), b = new Date(to).getTime();
  const at = (v: StarView) => (v.masteredAt ? new Date(v.masteredAt).getTime() : 0);
  return [...(book.byKey.get(s(studentId)) ?? new Map<string, StarView>())]
    .filter(([k, v]) => !hidden.has(k) && starMastered(v) && at(v) >= a && at(v) <= b)
    .sort((x, y) => at(y[1]) - at(x[1])).map(([k]) => k);
}

export interface KeyRank { key: string; name: string; review: number; started: number; score: number | null; mastered: number }

/**
 * The class's skills by KEY, weakest first: the most 🔄 needs review students, then the lowest average star score of
 * the students working on it (◐). Keys nobody started, ⭐-only keys and hidden keys are left out.
 */
export function weakKeys(book: StarBook, studentIds: readonly string[], hidden: ReadonlySet<string> = new Set()): KeyRank[] {
  const acc = new Map<string, { review: number; started: number; sum: number; mastered: number }>();
  for (const id of studentIds) {
    for (const [k, v] of book.byKey.get(s(id)) ?? new Map<string, StarView>()) {
      if (hidden.has(k)) continue;
      const o = acc.get(k) ?? { review: 0, started: 0, sum: 0, mastered: 0 };
      if (starNeedsReview(v)) o.review++;
      else if (starLearning(v)) { o.started++; o.sum += v.score; }
      else if (starMastered(v)) o.mastered++;
      acc.set(k, o);
    }
  }
  return [...acc].filter(([, o]) => o.review || o.started)
    .map(([key, o]) => ({ key, name: book.nameOf(key), review: o.review, started: o.started, score: o.started ? Math.round(o.sum / o.started) : null, mastered: o.mastered }))
    .sort((a, b) => b.review - a.review || (a.score ?? 101) - (b.score ?? 101) || a.name.localeCompare(b.name));
}

/** One student's weakest skill KEY: 🔄 first, then ◐ with the lowest star score; null when none. */
export function weakestKeyOf(book: StarBook, studentId: string, hidden: ReadonlySet<string> = new Set()): { key: string; view: StarView } | null {
  const list = [...(book.byKey.get(s(studentId)) ?? new Map<string, StarView>())].filter(([k, v]) => !hidden.has(k) && (starNeedsReview(v) || starLearning(v)));
  list.sort((a, b) => Number(starNeedsReview(b[1])) - Number(starNeedsReview(a[1])) || a[1].score - b[1].score);
  return list.length ? { key: list[0][0], view: list[0][1] } : null;
}
