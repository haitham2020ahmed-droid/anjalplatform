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

const kept = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<unknown> }>>();

export function keptWhileUnchanged<T>(repo: object, key: string, models: readonly string[], ms: number, load: () => Promise<T>): Promise<T> {
  let m = kept.get(repo);
  if (!m) kept.set(repo, (m = new Map()));
  const v = `${bankVersion()}|${modelVersion(...models)}`, hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < ms) return hit.p.then((x) => structuredClone(x) as T);
  const p = load();
  remember(m, key, { v, at: Date.now(), p }, 64);
  p.catch(() => { if (m!.get(key)?.p === p) m!.delete(key); });
  return p.then((x) => structuredClone(x));
}

/** Tables most bank-wide figures are built from (questions, their skills and curriculum, options, explanations). */
export const BANK_MODELS = ["Question", "QuestionOption", "QuestionAnswer", "QuestionExplanation", "QuestionType", "Skill", "SkillFamily", "SkillStandard", "Standard", "Curriculum", "Grade", "ReadingPassage", "QuestionMapLink", "CurriculumMapNode", "MapGoalArea"] as const;
