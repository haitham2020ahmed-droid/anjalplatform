/**
 * ⭐ "Skills mastered x of y" for the reports — ONE function, so the reports read the same number everywhere.
 *
 * A skill counts as mastered when the student's ONE skill status (src/server/skills/status.ts — the ⭐ shown everywhere)
 * is Mastered for that skill (any grade's copy, any source), or — for skills with no status row yet — when the engine
 * marked it mastered / its score reached the Mastered band. Every report (student file strands, class progress, monthly
 * family report) follows this one function.
 */
import type { Repo, Row } from "../seeding/repo";
import { DEFAULT_MASTERY } from "../../config/engine";
import { skillKeyIndex, skillStatusesFor } from "../skills/status";

const s = (v: unknown) => String(v ?? "");
/** The engine's Mastered band (mastery score 0–100). */
export const MASTERED_SCORE = DEFAULT_MASTERY.bands.mastered;

/**
 * For each student: the ids of the skills (of `skillIds`, or every skill when omitted) they have mastered.
 * One query for all the students.
 */
export async function masteredSkills(repo: Repo, studentIds: string[], skillIds?: string[], opts: { rows?: Row[] } = {}): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>(studentIds.map((id) => [id, new Set<string>()]));
  if (!studentIds.length || (skillIds && !skillIds.length)) return out;
  const want = skillIds ? new Set(skillIds) : null;
  // the caller's mastery rows of these students when it has them already (no second read)
  const rows = opts.rows ?? await repo.findMany("StudentSkillMastery", { studentId: { in: [...new Set(studentIds)] }, ...(skillIds ? { skillId: { in: [...new Set(skillIds)] } } : {}) }, { select: ["studentId", "skillId", "score", "isMastered"] });
  // ⭐ the one status per skill (when the stars table exists): it decides wherever it has a row
  const ids = [...new Set(studentIds)];
  let stars: Map<string, Map<string, { status: string }>> | null = null, keyOf: Map<string, string> | null = null, skillsOf: Map<string, string[]> | null = null;
  try {
    const st = ids.length ? await repo.findUnique("Student", { id: ids[0] }) : null;
    if (st?.schoolId) { const ix = await skillKeyIndex(repo, s(st.schoolId)); keyOf = ix.keyOf; skillsOf = ix.skillsOf; stars = await skillStatusesFor(repo, ids); }
  } catch { stars = null; }
  const decided = new Map<string, Set<string>>();
  if (stars && keyOf && skillsOf) for (const [sid, m] of stars) for (const [key, v] of m) {
    for (const skillId of skillsOf.get(key) ?? []) {
      if (want && !want.has(skillId)) continue;
      (decided.get(sid) ?? decided.set(sid, new Set()).get(sid)!).add(skillId);
      if (v.status === "MASTERED") out.get(sid)?.add(skillId);
    }
  }
  for (const r of rows) {
    const sid = s(r.studentId), kid = s(r.skillId);
    if (decided.get(sid)?.has(kid)) continue;
    if ((!want || want.has(kid)) && (r.isMastered === true || r.isMastered === 1 || Number(r.score) >= MASTERED_SCORE)) out.get(sid)?.add(kid);
  }
  return out;
}
