/**
 * 📝 Daily Dictation item bank (Grades 4–6 ELA): one small, hand-written set, graduated by TIER —
 *   1  a single simple word
 *   2  a short word pair / phrase, no punctuation
 *   3  a short simple sentence, no punctuation
 *   4  a short sentence ending in a period
 *   5  a sentence with a comma, or a question
 *   6  a longer sentence with trickier spelling and more than one punctuation mark
 * TIER_COUNT is the top tier (also DICTATION_ENGINE.maxTier in engine.ts). Items are never deleted or renumbered —
 * `id` is the stable key stored on every DictationAttempt row, so existing history keeps its text even if the
 * wording here is edited later (edit text, keep id).
 */
export interface DictationItem {
  /** stable key (never reused) */
  id: string;
  tier: number;
  text: string;
}

export const TIER_COUNT = 6;

export const DICTATION_ITEMS: readonly DictationItem[] = [
  // ---------------------------------------------------------------- tier 1: one simple word
  { id: "d001", tier: 1, text: "friend" },
  { id: "d002", tier: 1, text: "because" },
  { id: "d003", tier: 1, text: "animal" },
  { id: "d004", tier: 1, text: "important" },
  { id: "d005", tier: 1, text: "library" },
  { id: "d006", tier: 1, text: "beautiful" },
  { id: "d007", tier: 1, text: "mountain" },
  { id: "d008", tier: 1, text: "island" },

  // ---------------------------------------------------------------- tier 2: a short phrase, no punctuation
  { id: "d101", tier: 2, text: "a sunny morning" },
  { id: "d102", tier: 2, text: "our favorite teacher" },
  { id: "d103", tier: 2, text: "running very fast" },
  { id: "d104", tier: 2, text: "a strange noise" },
  { id: "d105", tier: 2, text: "the tallest building" },
  { id: "d106", tier: 2, text: "two hungry puppies" },
  { id: "d107", tier: 2, text: "an important message" },

  // ---------------------------------------------------------------- tier 3: a short simple sentence, no punctuation
  { id: "d201", tier: 3, text: "the dog ran home" },
  { id: "d202", tier: 3, text: "we planted a garden" },
  { id: "d203", tier: 3, text: "the children were laughing" },
  { id: "d204", tier: 3, text: "my sister likes science" },
  { id: "d205", tier: 3, text: "the river flows south" },
  { id: "d206", tier: 3, text: "birds build their nests" },
  { id: "d207", tier: 3, text: "the museum opens early" },

  // ---------------------------------------------------------------- tier 4: a short sentence with a period
  { id: "d301", tier: 4, text: "The library closes at six." },
  { id: "d302", tier: 4, text: "Our class visited the aquarium." },
  { id: "d303", tier: 4, text: "She finished her homework early." },
  { id: "d304", tier: 4, text: "The weather changed suddenly." },
  { id: "d305", tier: 4, text: "He forgot his umbrella again." },
  { id: "d306", tier: 4, text: "The bakery smells wonderful." },
  { id: "d307", tier: 4, text: "They explored the old castle." },

  // ---------------------------------------------------------------- tier 5: a comma, or a question
  { id: "d401", tier: 5, text: "After the storm, the sky turned orange." },
  { id: "d402", tier: 5, text: "Before we left, I checked my backpack." },
  { id: "d403", tier: 5, text: "Have you ever visited another country?" },
  { id: "d404", tier: 5, text: "Why did the ancient Egyptians build pyramids?" },
  { id: "d405", tier: 5, text: "My brother, who is ten, collects stamps." },
  { id: "d406", tier: 5, text: "Although it was late, we kept reading." },
  { id: "d407", tier: 5, text: "Where did you put the science project?" },

  // ---------------------------------------------------------------- tier 6: longer, trickier spelling, more punctuation
  { id: "d501", tier: 6, text: "\"Be careful,\" the lifeguard shouted, \"the current is strong!\"" },
  { id: "d502", tier: 6, text: "The archaeologists were astonished by the ancient, mysterious ruins." },
  { id: "d503", tier: 6, text: "Although she was exhausted, Maria finished the marathon in record time." },
  { id: "d504", tier: 6, text: "\"Wait!\" he yelled. \"You forgot your permission slip!\"" },
  { id: "d505", tier: 6, text: "The scientist's conclusion, surprisingly, contradicted her original hypothesis." },
  { id: "d506", tier: 6, text: "Despite the heavy rain, the determined hikers reached the summit." },
] as const;

/** Every item of one tier (schema-verified: at least one per tier up to TIER_COUNT). */
export function itemsOfTier(tier: number): readonly DictationItem[] {
  return DICTATION_ITEMS.filter((it) => it.tier === tier);
}

export const ITEM_BY_ID: ReadonlyMap<string, DictationItem> = new Map(DICTATION_ITEMS.map((it) => [it.id, it]));
