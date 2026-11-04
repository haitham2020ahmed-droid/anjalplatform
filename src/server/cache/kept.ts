/**
 * ⚡ Figures derived from the whole question bank (admin overviews: question intelligence, MAP links, MAP
 * classification, teacher requests …) read every question of the school — 15,000+ rows and seconds of work — on every
 * visit. They change only when one of the tables they read is written. `keptWhileUnchanged` keeps such a value per
 * database connection and key while the write counters of those tables are unchanged in this process (bankVersion /
 * modelVersion, bumped by the data layer on every write through any path), and at most `ms` (writes made by another
 * process: the jobs worker). Callers get their own copy (they may sort or change it). Bounded.
 */
import { bankVersion, modelVersion } from "./bank-version";
import { remember } from "./lru";
import { registerCache } from "./idle";

type Kept = Map<string, { v: string; at: number; ms: number; p: Promise<unknown> }>;
const kept = new WeakMap<object, Kept>();
// r68 memory: bank-wide figures are big (every question of the school); once older than their time they are REMOVED
// by the sweeper instead of staying until the same key is asked for again
const all = new Set<WeakRef<Kept>>();
registerCache("kept.bank-figures", {
  sweep(now) {
    let n = 0;
    for (const ref of all) {
      const m = ref.deref();
      if (!m) { all.delete(ref); continue; }
      for (const [k, e] of m) if (now - e.at > e.ms) { m.delete(k); n++; }
    }
    return n;
  },
  clear() { for (const ref of all) ref.deref()?.clear(); },
  size() { let n = 0; for (const ref of all) n += ref.deref()?.size ?? 0; return n; },
});

export function keptWhileUnchanged<T>(repo: object, key: string, models: readonly string[], ms: number, load: () => Promise<T>): Promise<T> {
  let m = kept.get(repo);
  if (!m) { kept.set(repo, (m = new Map())); all.add(new WeakRef(m)); }
  const v = `${bankVersion()}|${modelVersion(...models)}`, hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < ms) return hit.p.then((x) => structuredClone(x) as T);
  const p = load();
  remember(m, key, { v, at: Date.now(), ms, p }, 32);
  p.catch(() => { if (m!.get(key)?.p === p) m!.delete(key); });
  return p.then((x) => structuredClone(x));
}

/** Tables most bank-wide figures are built from (questions, their skills and curriculum, options, explanations). */
export const BANK_MODELS = ["Question", "QuestionOption", "QuestionAnswer", "QuestionExplanation", "QuestionType", "Skill", "SkillFamily", "SkillStandard", "Standard", "Curriculum", "Grade", "ReadingPassage", "QuestionMapLink", "CurriculumMapNode", "MapGoalArea"] as const;
