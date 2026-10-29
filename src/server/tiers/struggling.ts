/**
 * 🧩 A student's struggling skills (Support plan): the skills practised enough to judge (8+ answers) whose mastery
 * score is still under 60, weakest first — at most 3 per student. One bounded read for all the students.
 *
 * r97 note: this picks the SKILLS an RTI plan targets; it is a separate, much simpler rule than the full Tier
 * engine (tiers/rules.ts — dwell time, two-source corroboration), which decides whether the STUDENT needs Tier
 * 2/3 support at all. plans/start.ts's "RTI" program currently calls only this function, with no tier-engine
 * gate — a single bad short run can still suggest a plan the full engine would not yet confirm. Raised the
 * minimum answers (5→8) as a safer interim bar; routing this through decideTier's evidence is a bigger, separate
 * change (it needs MAP/fluency/check data this function doesn't have) left for a dedicated follow-up.
 */
import type { Repo } from "../seeding/repo";
import { isHiddenSkill } from "../skills/master";

const s = (v: unknown) => String(v ?? "");
export const STRUGGLE_MIN_ANSWERS = 8;
export const STRUGGLE_SCORE = 60;

export async function strugglingSkills(repo: Repo, studentIds: string[]): Promise<Map<string, { id: string; name: string; score: number }[]>> {
  const out = new Map<string, { id: string; name: string; score: number }[]>();
  if (!studentIds.length) return out;
  const rows = (await repo.findMany("StudentSkillMastery", { studentId: { in: studentIds.slice(0, 400) } }, { select: ["studentId", "skillId", "score", "attempts", "isMastered"] }))
    .filter((m) => Number(m.attempts ?? 0) >= STRUGGLE_MIN_ANSWERS && Number(m.score ?? 0) < STRUGGLE_SCORE && !m.isMastered);
  const names = rows.length ? new Map((await repo.findMany("Skill", { id: { in: [...new Set(rows.map((m) => s(m.skillId)))] } }, { select: ["id", "name", "code"] })).filter((k) => !isHiddenSkill(k.code)).map((k) => [s(k.id), s(k.name)])) : new Map<string, string>();
  for (const m of rows.sort((a, b) => Number(a.score) - Number(b.score))) {
    if (!names.has(s(m.skillId))) continue;
    const list = out.get(s(m.studentId)) ?? [];
    if (list.length < 3) list.push({ id: s(m.skillId), name: names.get(s(m.skillId)) ?? "Skill", score: Math.round(Number(m.score)) });
    out.set(s(m.studentId), list);
  }
  return out;
}
