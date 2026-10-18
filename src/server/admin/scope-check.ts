/**
 * 🔎 Skill scope check: flags questions in the live Question Bank whose text does not look like it actually
 * belongs to their skill — e.g. a word-choice question ("Marcus sat ___ his brother") filed under "Active and
 * Passive Voice". This only covers skills with a rule below; most skills have none yet and are never flagged.
 *
 * This is a heuristic on the question's own text (stem + why), not a guarantee: it is meant to surface candidates
 * for a human to look at in /admin/questions (search the skill name, review the "⚠️ off-topic?" rows, archive the
 * ones that really don't belong), never to delete anything on its own.
 */

export interface ScopeRule {
  /** true = this text looks like it belongs to the skill; false = flag it for review. */
  isOnTopic(text: string): boolean;
}

const BE = /\b(is|are|am|was|were|be|been|being)\b/i;
const PARTICIPLE = /\b(\w+ed|built|given|driven|sent|taken|made|written|broken|shown|known|grown|held|sold|bought|caught|taught|told|kept|left|found|run|done|seen|stolen|worn|borrowed|mapped|fed|hidden|cut)\b/i;
const VOICE_WORDS = /\b(active|passive|voice|doer|agent|by\s+\w+)\b/i;

/** Same check that guards the "Active and Passive Voice" pack files (tests/active-passive-scope.test.ts). */
const activePassive: ScopeRule = { isOnTopic: (t) => VOICE_WORDS.test(t) || (BE.test(t) && PARTICIPLE.test(t)) };

/** Keyed by the skill's exact name, lower-cased. Add a skill here only once its rule has been checked against the real pack. */
const SCOPE_RULES: Record<string, ScopeRule> = {
  "active and passive voice": activePassive,
};

export function scopeRuleFor(skillName: string): ScopeRule | null {
  return SCOPE_RULES[skillName.trim().toLowerCase()] ?? null;
}

/** true = this question's own text looks off-topic for its skill (no rule configured ⇒ never flagged). */
export function isScopeFlagged(skillName: string, text: string): boolean {
  const rule = scopeRuleFor(skillName);
  if (!rule) return false;
  return !rule.isOnTopic(text);
}
