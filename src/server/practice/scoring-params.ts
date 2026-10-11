/**
 * Scoring parameters of saved questions for reports and estimates that work from stored answers (QuestionAttempt
 * keeps the item's b; the guessing floor c and the authoring level come from the question): one bounded read per
 * batch, cached per process while the question bank is unchanged (src/server/cache/bank-version.ts).
 */
import type { Repo } from "../seeding/repo";
import { bankVersion } from "../cache/bank-version";
import { effectiveGuessing } from "../../adaptive/guessing";

export interface ScoringParams { c: number; level: number; type: string }
const DEFAULT: ScoringParams = { c: 0, level: 4, type: "" };
const caches = new WeakMap<object, { v: number; at: number; map: Map<string, ScoringParams> }>();
const MAX_AGE_MS = 10 * 60_000;

/** c (guessing floor), authoring level and type of each question id. Unknown ids get c = 0, level 4. */
export async function scoringParams(repo: Repo, questionIds: string[]): Promise<Map<string, ScoringParams>> {
  let cache = caches.get(repo as object);
  if (!cache || cache.v !== bankVersion() || Date.now() - cache.at > MAX_AGE_MS) { cache = { v: bankVersion(), at: Date.now(), map: new Map() }; caches.set(repo as object, cache); }
  const want = [...new Set(questionIds.map(String))].filter((id) => !cache!.map.has(id));
  for (let i = 0; i < want.length; i += 1000) {
    const ids = want.slice(i, i + 1000);
    const qs = await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "typeId", "irtC", "difficultyLevel"] });
    const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => String(q.typeId)))] } }, { select: ["id", "code"] }) : [];
    const code = new Map(types.map((t) => [String(t.id), String(t.code)]));
    const choice = qs.filter((q) => /MULTIPLE_CHOICE|DROPDOWN/.test(code.get(String(q.typeId)) ?? "")).map((q) => String(q.id));
    const opts = choice.length ? await repo.findMany("QuestionOption", { questionId: { in: choice } }, { select: ["questionId"] }) : [];
    const n = new Map<string, number>();
    for (const o of opts) n.set(String(o.questionId), (n.get(String(o.questionId)) ?? 0) + 1);
    for (const q of qs) {
      const t = code.get(String(q.typeId)) ?? "";
      cache.map.set(String(q.id), { c: effectiveGuessing(q.irtC, t, n.get(String(q.id)) ?? null), level: Number(q.difficultyLevel) || 4, type: t });
    }
    for (const id of ids) if (!cache.map.has(id)) cache.map.set(id, DEFAULT);
  }
  return new Map(questionIds.map((id) => [String(id), cache!.map.get(String(id)) ?? DEFAULT]));
}
