/**
 * 🎲 Test data only (in-memory database): games now need a full round of fitting questions (MIN_QUESTIONS_PER_GAME),
 * while the small test bank has 6 per skill. `topUpGameBank` copies a skill's own published questions of the given
 * types (with their options and answers, as new rows — never touching the originals) until it has `n` of them.
 */
import type { Repo } from "../../src/server/seeding/repo";

const s = (v: unknown) => String(v ?? "");
const strip = (row: Record<string, unknown>, drop: string[]) => Object.fromEntries(Object.entries(row).filter(([k, v]) => !drop.includes(k) && v !== undefined));

export async function topUpGameBank(repo: Repo, skillId: string, codes: string[] = ["MULTIPLE_CHOICE", "TRUE_FALSE"], n = 8): Promise<number> {
  const types = await repo.findMany("QuestionType", { code: { in: codes } });
  const qs = await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null, typeId: { in: types.map((t) => t.id) } });
  if (!qs.length) return 0;
  let have = qs.length, i = 0;
  while (have < n) {
    const src = qs[i++ % qs.length];
    const copy = await repo.create("Question", { ...strip(src, ["id", "createdAt", "updatedAt"]), stem: `${s(src.stem)} (${have + 1})`, externalRef: `topup-${s(src.id)}-${have}` });
    for (const o of await repo.findMany("QuestionOption", { questionId: src.id })) await repo.create("QuestionOption", { ...strip(o, ["id", "createdAt", "updatedAt"]), questionId: copy.id });
    for (const a of await repo.findMany("QuestionAnswer", { questionId: src.id })) await repo.create("QuestionAnswer", { ...strip(a, ["id", "createdAt", "updatedAt"]), questionId: copy.id });
    for (const e of await repo.findMany("QuestionExplanation", { questionId: src.id })) await repo.create("QuestionExplanation", { ...strip(e, ["id", "createdAt", "updatedAt"]), questionId: copy.id });
    have++;
  }
  return have;
}

/**
 * A skill of its own family (unique name) with `n` copies of another skill's published multiple-choice/true-false
 * questions: the cross-grade question pool never tops it up, so it stays "short" for game tests.
 */
export async function isolatedShortSkill(repo: Repo, fromSkillId: string, n = 6): Promise<string> {
  const src = (await repo.findUnique("Skill", { id: fromSkillId }))!;
  const tag = `${Date.now().toString(36)}${n}`;
  const skill = await repo.create("Skill", { ...strip(src, ["id", "createdAt", "updatedAt"]), code: `${s(src.code)}-short-${tag}`.slice(0, 60), name: `Short Test Skill ${tag}` });
  const types = await repo.findMany("QuestionType", { code: { in: ["MULTIPLE_CHOICE", "TRUE_FALSE"] } });
  const qs = await repo.findMany("Question", { skillId: fromSkillId, status: "PUBLISHED", deletedAt: null, typeId: { in: types.map((t) => t.id) } });
  for (let i = 0; i < Math.min(n, qs.length); i++) {
    const q = qs[i];
    const copy = await repo.create("Question", { ...strip(q, ["id", "createdAt", "updatedAt"]), skillId: skill.id, stem: `${s(q.stem)} (short ${i + 1})`, externalRef: `short-${s(q.id)}-${tag}` });
    for (const o of await repo.findMany("QuestionOption", { questionId: q.id })) await repo.create("QuestionOption", { ...strip(o, ["id", "createdAt", "updatedAt"]), questionId: copy.id });
    for (const a of await repo.findMany("QuestionAnswer", { questionId: q.id })) await repo.create("QuestionAnswer", { ...strip(a, ["id", "createdAt", "updatedAt"]), questionId: copy.id });
  }
  return String(skill.id);
}
