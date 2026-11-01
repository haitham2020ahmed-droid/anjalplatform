/**
 * 🧩 A student's struggling skills (Support plan) — at most 3 per student, one bounded read for all the students.
 *
 * ⭐ Stars (owner, 1 Nov 2026): "struggling" is read from the SAME stars as My Skills / Student Skills
 * (skills/star-read.ts), one entry per skill KEY (copies of a skill are one skill), and NEVER a skill with ⭐:
 *   1. 🔄 Needs review (failed a review check) — first;
 *   2. ◐ In progress flagged "needs support" (50 answers without mastery);
 *   3. ◐ In progress practised enough to judge (8+ answers) whose engine score is still under 60 — weakest first.
 * The engine's score (StudentSkillMastery) only ORDERS the ◐ skills; the `score` returned is the star score.
 *
 * r97 note: this picks the SKILLS an RTI plan targets; it is a separate, much simpler rule than the full Tier
 * engine (tiers/rules.ts — dwell time, two-source corroboration), which decides whether the STUDENT needs Tier
 * 2/3 support at all.
 */
import type { Repo } from "../seeding/repo";
import { isHiddenSkill } from "../skills/master";
import { starBook, starLearning, starMastered, starNeedsReview } from "../skills/star-read";
import type { StarView } from "../skills/status";

const s = (v: unknown) => String(v ?? "");
export const STRUGGLE_MIN_ANSWERS = 8;
export const STRUGGLE_SCORE = 60;

export async function strugglingSkills(repo: Repo, studentIds: string[]): Promise<Map<string, { id: string; name: string; score: number }[]>> {
  const out = new Map<string, { id: string; name: string; score: number }[]>();
  const ids = [...new Set(studentIds.map(s).filter(Boolean))].slice(0, 400);
  if (!ids.length) return out;
  const [rows, book] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "skillId", "score", "attempts"] }),
    starBook(repo, ids),
  ]);
  // per student: candidate skill id → [rank, engine score, star]
  type Cand = { id: string; rank: number; engine: number; star: StarView };
  const cands = new Map<string, Map<string, Cand>>(); // student → key → candidate
  const offer = (st: string, skillId: string, rank: number, engine: number) => {
    const key = book.keyOf(skillId), star = book.ofKey(st, key);
    if (starMastered(star)) return;
    const m = cands.get(st) ?? new Map<string, Cand>();
    const prev = m.get(key);
    if (!prev || rank < prev.rank || (rank === prev.rank && engine < prev.engine)) m.set(key, { id: skillId, rank, engine, star });
    cands.set(st, m);
  };
  for (const st of ids) for (const v of (book.byKey.get(st) ?? new Map<string, StarView>()).values()) {
    const id = v.skillId ?? book.ix.skillsOf.get(v.key)?.[0];
    if (!id) continue;
    if (starNeedsReview(v)) offer(st, id, 0, v.score);
    else if (starLearning(v) && v.needsSupport) offer(st, id, 1, v.score);
  }
  for (const m of rows) {
    if (Number(m.attempts ?? 0) < STRUGGLE_MIN_ANSWERS || Number(m.score ?? 0) >= STRUGGLE_SCORE) continue;
    const st = s(m.studentId), star = book.of(st, s(m.skillId));
    // only a ◐ (or 🔄) skill: never ⭐, and a skill without a star row is not judged on the engine alone
    if (starLearning(star) || starNeedsReview(star)) offer(st, s(m.skillId), starNeedsReview(star) ? 0 : star.needsSupport ? 1 : 2, Number(m.score ?? 0));
  }
  const allIds = [...new Set([...cands.values()].flatMap((m) => [...m.values()].map((c) => c.id)))];
  const names = allIds.length ? new Map((await repo.findMany("Skill", { id: { in: allIds } }, { select: ["id", "name", "code"] })).filter((k) => !isHiddenSkill(k.code)).map((k) => [s(k.id), s(k.name)])) : new Map<string, string>();
  for (const [st, m] of cands) {
    const list = [...m.values()].filter((c) => names.has(c.id)).sort((a, b) => a.rank - b.rank || a.engine - b.engine).slice(0, 3)
      .map((c) => ({ id: c.id, name: names.get(c.id) ?? "Skill", score: c.star.score }));
    if (list.length) out.set(st, list);
  }
  return out;
}
