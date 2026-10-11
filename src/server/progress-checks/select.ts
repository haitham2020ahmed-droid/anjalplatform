/**
 * 📋 Progress checks — the PURE part: which category a skill counts for, and how ~10 items are picked.
 *
 * A text-set progress check (the idea of the short end-of-week / end-of-text-set check in core reading programmes;
 * every item comes from the school's own bank) has two subscores:
 *   COMPREHENSION  reading skills (comprehension skills, strategies, text features, author's craft on a text)
 *   VOCABULARY     vocabulary skills and vocabulary strategies (context clues, roots, affixes, homographs…)
 * Grammar, spelling and mechanics are taught in the text set too but are not part of this check (OTHER).
 */

export type Category = "COMPREHENSION" | "VOCABULARY" | "OTHER";
export const DEFAULT_MIX: Record<"COMPREHENSION" | "VOCABULARY", number> = { COMPREHENSION: 6, VOCABULARY: 4 };
export const PASS_PCT = 80;
/** technology-enhanced item types: included when the bank has them (the check should not be multiple choice only) */
export const ENHANCED_TYPES = new Set(["TWO_PART", "HOT_TEXT", "GRID"]);

/** The category of a skill taught in a lesson. Pure. */
export function skillCategory(skill: Record<string, unknown>, role?: unknown): Category {
  const domain = String(skill.domain ?? ""), cat = String(skill.category ?? ""), r = String(role ?? "");
  if (domain === "VOCABULARY" || cat === "VOCABULARY" || r === "VOCABULARY_STRATEGY") return "VOCABULARY";
  if (domain === "READING" || ["LITERATURE", "INFORMATIONAL", "COMPREHENSION"].includes(cat)) return "COMPREHENSION";
  return "OTHER";
}

export interface Candidate { id: string; skillId: string; difficultyLevel: number; type: string; lessonLinked: boolean }

/** Evenly spread difficulty targets around `center` (±2 within 1–7). Pure. */
export function spread(n: number, center: number): number[] {
  if (n <= 0) return [];
  const lo = Math.max(1, center - 2), hi = Math.min(7, center + 2);
  if (n === 1) return [center];
  return Array.from({ length: n }, (_, i) => Math.round(lo + ((hi - lo) * i) / (n - 1)));
}

/**
 * Picks `n` items of one category: skills take turns (so every skill of the text set is covered), each slot goes to
 * the turn's skill — a lesson-linked item within ±1 of the slot's difficulty first, then any of its items, nearest
 * first. One technology-enhanced item is swapped in when none was picked and the pool has one. `avoid` ids (an
 * earlier form) are used only when nothing else is left. Pure and deterministic.
 */
export function pickCategory(pool: Candidate[], n: number, center: number, avoid: Set<string> = new Set()): Candidate[] {
  if (n <= 0 || !pool.length) return [];
  const bySkill = new Map<string, Candidate[]>();
  for (const q of [...pool].sort((a, b) => a.id.localeCompare(b.id))) { const l = bySkill.get(q.skillId) ?? []; l.push(q); bySkill.set(q.skillId, l); }
  // skills with lesson-linked items first, then the larger pools
  const skills = [...bySkill.keys()].sort((a, b) => Number(bySkill.get(b)!.some((q) => q.lessonLinked)) - Number(bySkill.get(a)!.some((q) => q.lessonLinked)) || bySkill.get(b)!.length - bySkill.get(a)!.length || a.localeCompare(b));
  const used = new Set<string>();
  const out: Candidate[] = [];
  const targets = spread(Math.min(n, pool.length), center);
  const best = (list: Candidate[], level: number): Candidate | null => {
    const free = list.filter((q) => !used.has(q.id));
    const fresh = free.filter((q) => !avoid.has(q.id));
    const from = fresh.length ? fresh : free;
    const score = (q: Candidate) => (q.lessonLinked && Math.abs(q.difficultyLevel - level) <= 1 ? 0 : 10) + Math.abs(q.difficultyLevel - level);
    return [...from].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))[0] ?? null;
  };
  let turn = 0;
  for (const level of targets) {
    let picked: Candidate | null = null;
    for (let k = 0; k < skills.length && !picked; k++) {
      const sk = skills[(turn + k) % skills.length];
      picked = best(bySkill.get(sk)!, level);
      if (picked) turn = (turn + k + 1) % skills.length;
    }
    if (!picked) break;
    used.add(picked.id); out.push(picked);
  }
  // at least one technology-enhanced item when the pool has one
  if (!out.some((q) => ENHANCED_TYPES.has(q.type))) {
    const enh = pool.filter((q) => ENHANCED_TYPES.has(q.type) && !used.has(q.id) && !avoid.has(q.id)).sort((a, b) => Math.abs(a.difficultyLevel - center) - Math.abs(b.difficultyLevel - center) || a.id.localeCompare(b.id))[0];
    if (enh && out.length) {
      // replace the item of the same skill (or any) nearest in difficulty
      const same = out.filter((q) => q.skillId === enh.skillId);
      const victims = (same.length ? same : out).sort((a, b) => Math.abs(a.difficultyLevel - enh.difficultyLevel) - Math.abs(b.difficultyLevel - enh.difficultyLevel) || a.id.localeCompare(b.id));
      out[out.indexOf(victims[0])] = enh;
    }
  }
  return out.sort((a, b) => a.difficultyLevel - b.difficultyLevel || a.id.localeCompare(b.id));
}

/**
 * The whole check: `mix` per category (default 6 + 4); a category short of items gives its slots to the other. Pure.
 */
export function selectItems(pools: Record<"COMPREHENSION" | "VOCABULARY", Candidate[]>, center: number, mix = DEFAULT_MIX, avoid: Set<string> = new Set()): { items: (Candidate & { category: "COMPREHENSION" | "VOCABULARY" })[]; notes: string[] } {
  const notes: string[] = [];
  const avail = { COMPREHENSION: pools.COMPREHENSION.length, VOCABULARY: pools.VOCABULARY.length };
  let c = Math.min(mix.COMPREHENSION, avail.COMPREHENSION), v = Math.min(mix.VOCABULARY, avail.VOCABULARY);
  const total = mix.COMPREHENSION + mix.VOCABULARY;
  if (c + v < total) { const moreC = Math.min(avail.COMPREHENSION - c, total - c - v); c += moreC; v += Math.min(avail.VOCABULARY - v, total - c - v); }
  if (avail.VOCABULARY < mix.VOCABULARY) notes.push(avail.VOCABULARY ? `Only ${avail.VOCABULARY} vocabulary item${avail.VOCABULARY === 1 ? "" : "s"} in the bank for this text set.` : "No vocabulary items in the bank for this text set: the check has no Vocabulary subscore.");
  if (avail.COMPREHENSION < mix.COMPREHENSION) notes.push(avail.COMPREHENSION ? `Only ${avail.COMPREHENSION} comprehension item${avail.COMPREHENSION === 1 ? "" : "s"} in the bank for this text set.` : "No comprehension items in the bank for this text set.");
  const items = [
    ...pickCategory(pools.COMPREHENSION, c, center, avoid).map((q) => ({ ...q, category: "COMPREHENSION" as const })),
    ...pickCategory(pools.VOCABULARY, v, center, avoid).map((q) => ({ ...q, category: "VOCABULARY" as const })),
  ];
  if (items.length && items.length < total) notes.push(`${items.length} items instead of ${total}: add more published questions on these skills.`);
  return { items, notes };
}

/** Pass at 80%. Pure. */
export const passed = (pct: number | null) => pct !== null && pct >= PASS_PCT;
