/**
 * 📏 At least 25 questions for every skill (owner rule, Update 55). A skill's bank is its family (the same skill in
 * every grade, one bank by skill + level); Curriculum Map lesson questions are not counted (they are separate).
 * Used by Question Check → "Under 25" and by the top-up loader (scripts/skills/top-up-skills.ts).
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { ForbiddenError } from "../auth/rbac";
import { countQuestionsOfSkills, normalizeSkillName, schoolSkillIndex } from "./skill-questions";

export const MIN_PER_SKILL = 25;
const HOLDING = ".curriculum-map-unclassified";

export interface ThinSkill { id: string; name: string; grades: number[]; questions: number; missing: number }

/** Skills (one row per family) with fewer than 25 published bank questions, fewest first. */
export async function skillsUnderMinimum(repo: Repo, actor: Actor, min = MIN_PER_SKILL): Promise<ThinSkill[]> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Admins see this list.");
  return thinSkills(repo, actor.schoolId!, min);
}

export async function thinSkills(repo: Repo, schoolId: string, min = MIN_PER_SKILL): Promise<ThinSkill[]> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const fams = new Map<string, string[]>();
  for (const id of idx.ids) {
    const k = idx.skillOf.get(id);
    if (!k || !k.isActive || k.code.endsWith(HOLDING)) continue;
    const key = idx.keyOf.get(id)!;
    fams.set(key, [...(fams.get(key) ?? []), id]);
  }
  const heads = [...fams.values()].map((ids) => ids[0]);
  const counts = await countQuestionsOfSkills(repo, schoolId, heads);
  return [...fams.values()].map((ids) => {
    const n = counts.get(ids[0]) ?? 0;
    const k = idx.skillOf.get(ids[0])!;
    return { id: ids[0], name: k.name, grades: [...new Set(ids.map((x) => idx.gradeOf.get(x) ?? 0))].sort((a, b) => a - b), questions: n, missing: Math.max(0, min - n) };
  }).filter((r) => r.missing > 0).sort((a, b) => a.questions - b.questions || a.name.localeCompare(b.name));
}

/**
 * 📏 Tops every thin skill up to 25 questions from the top-up file (data/questions/sets/topup-skill-sets.json): only
 * the questions each skill is missing are added (Below / On / Above in turn), to the skill that already exists,
 * published. A skill that already has 25 gets nothing. Safe to run again.
 */
export async function topUpSkills(repo: Repo, schoolId: string, sets: import("./skill-sets").SkillSet[], min = MIN_PER_SKILL, opts: { countAfter?: boolean } = {}): Promise<{ skills: number; added: number; stillThin: number; errors: string[] }> {
  const { addSkillSets } = await import("./skill-sets");
  const thin = await thinSkills(repo, schoolId, min);
  // every name of a thin family (e.g. "Prefixes" and "Suffixes" share one pool) → that family; one set fills it
  const idx = await schoolSkillIndex(repo, schoolId);
  const familyOf = new Map<string, string>(), missing = new Map<string, number>();
  for (const t of thin) {
    const key = idx.keyOf.get(t.id) ?? t.id;
    missing.set(key, t.missing);
    for (const id of idx.members.get(key) ?? [t.id]) { const n = normalizeSkillName(idx.skillOf.get(id)?.name ?? t.name); if (!familyOf.has(n)) familyOf.set(n, key); }
  }
  const max = new Map<string, number>();
  for (const set of sets) {
    const key = familyOf.get(normalizeSkillName(set.skill)), m = key ? missing.get(key) : 0;
    if (key && m) { max.set(set.skill, m); missing.delete(key); }
  }
  const todo = sets.filter((x) => max.has(x.skill));
  const res = todo.length ? await addSkillSets(repo, schoolId, todo, undefined, new Date(), { onlyExisting: true, max }) : [];
  // the Load page works in small chunks: it counts the skills still under 25 once, at the end (countAfter: false)
  const after = opts.countAfter === false ? -1 : (await thinSkills(repo, schoolId, min)).length;
  return { skills: res.filter((r) => r.added > 0).length, added: res.reduce((n, r) => n + r.added, 0), stillThin: after, errors: res.flatMap((r) => r.errors.slice(0, 3).map((e) => `${r.skill}: ${e}`)) };
}
