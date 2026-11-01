/**
 * ⭐ "Skills mastered x of y" for the reports — ONE function, so the reports read the same number everywhere.
 *
 * A skill counts as mastered ONLY when the student's ONE skill status (src/server/skills/status.ts — the ⭐ shown
 * everywhere: My Skills, Student Skills, Practice and time) is ⭐ (MASTERED or NEXT_LEVEL) for that skill's KEY (any
 * grade's copy, any source). The old engine flag / score (StudentSkillMastery isMastered, the Mastered band) never
 * decides it any more (owner, 1 Nov 2026).
 *
 * The result is SKILL IDS (every copy of a ⭐ key among `skillIds` is in the set): a caller that DISPLAYS a count must
 * count KEYS once (two copies of one skill are one skill) — see `masteredKeyCount`.
 */
import type { Repo, Row } from "../seeding/repo";
import { DEFAULT_MASTERY } from "../../config/engine";
import { starBook, starMastered } from "../skills/star-read";

const s = (v: unknown) => String(v ?? "");
/** The engine's Mastered band (mastery score 0–100) — kept for callers that order by it; it decides nothing here. */
export const MASTERED_SCORE = DEFAULT_MASTERY.bands.mastered;

/**
 * For each student: the ids of the skills (of `skillIds`, or every skill of the school when omitted) whose key is ⭐.
 * One batched read for all the students. `opts.rows` (the caller's old mastery rows) is accepted for compatibility
 * and ignored: it never decides a status.
 */
export async function masteredSkills(repo: Repo, studentIds: string[], skillIds?: string[], opts: { rows?: Row[] } = {}): Promise<Map<string, Set<string>>> {
  void opts;
  const out = new Map<string, Set<string>>(studentIds.map((id) => [id, new Set<string>()]));
  if (!studentIds.length || (skillIds && !skillIds.length)) return out;
  const ids = [...new Set(studentIds.map(s))];
  let book: Awaited<ReturnType<typeof starBook>>;
  try { book = await starBook(repo, ids); } catch { return out; }
  const want = skillIds ? [...new Set(skillIds.map(s))] : null;
  for (const sid of ids) {
    const set = out.get(sid) ?? new Set<string>();
    if (want) { for (const id of want) if (starMastered(book.of(sid, id))) set.add(id); }
    else for (const key of book.masteredKeys(sid)) for (const id of book.ix.skillsOf.get(key) ?? []) set.add(id);
    out.set(sid, set);
  }
  return out;
}

/** The number of distinct ⭐ KEYS among some skill ids (copies of one skill count once). */
export async function masteredKeyCount(repo: Repo, studentIds: string[], skillIds?: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(studentIds.map((id) => [id, 0]));
  if (!studentIds.length || (skillIds && !skillIds.length)) return out;
  const ids = [...new Set(studentIds.map(s))];
  const book = await starBook(repo, ids);
  for (const sid of ids) {
    const keys = book.masteredKeys(sid);
    out.set(sid, skillIds ? new Set(skillIds.map((id) => book.keyOf(s(id))).filter((k) => keys.has(k))).size : keys.size);
  }
  return out;
}
