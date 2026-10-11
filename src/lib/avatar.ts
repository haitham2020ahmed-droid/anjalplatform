/**
 * 🧑‍🚀 Avatars (Games Part 3) — pure data, safe in the browser. Every character and accessory is original and drawn in
 * code (src/components/motivation/avatar.tsx); no images. An avatar is a small JSON
 * { base, color, hat, glasses } of item codes below. Prices are fixed coins (never random boxes, never real money);
 * a few items are free, and some are unlocked only by a badge (src/lib/badge-catalog.ts `unlocks`).
 */
import { UNLOCKED_BY } from "./badge-catalog";

export type ItemKind = "base" | "hat" | "glasses" | "color";
export type BaseFamily = "animal" | "robot" | "space" | "special";
export interface ShopItem { code: string; kind: ItemKind; name: string; price: number; family?: BaseFamily; hex?: string }

export const SHOP_ITEMS: ShopItem[] = [
  // characters
  { code: "cat", kind: "base", family: "animal", name: "Whisker Cat", price: 0 },
  { code: "robot", kind: "base", family: "robot", name: "Beep Robot", price: 0 },
  { code: "alien", kind: "base", family: "space", name: "Zib the Alien", price: 0 },
  { code: "bear", kind: "base", family: "animal", name: "Honey Bear", price: 40 },
  { code: "fox", kind: "base", family: "animal", name: "Swift Fox", price: 60 },
  { code: "bunny", kind: "base", family: "animal", name: "Hop Bunny", price: 60 },
  { code: "owl", kind: "base", family: "animal", name: "Night Owl", price: 80 },
  { code: "panda", kind: "base", family: "animal", name: "Bamboo Panda", price: 100 },
  { code: "boltbot", kind: "base", family: "robot", name: "Bolt Bot", price: 90 },
  { code: "starblob", kind: "base", family: "space", name: "Star Jelly", price: 120 },
  // special characters (unlocked by badges)
  { code: "phoenix", kind: "base", family: "special", name: "Sun Phoenix", price: 0 },
  { code: "dragon", kind: "base", family: "special", name: "Word Dragon", price: 0 },
  { code: "moon-whale", kind: "base", family: "special", name: "Moon Whale", price: 0 },
  // hats
  { code: "cap", kind: "hat", name: "Sport Cap", price: 25 },
  { code: "beanie", kind: "hat", name: "Cozy Beanie", price: 30 },
  { code: "party", kind: "hat", name: "Party Hat", price: 35 },
  { code: "headphones", kind: "hat", name: "Headphones", price: 45 },
  { code: "wizard", kind: "hat", name: "Star Wizard Hat", price: 60 },
  { code: "crown", kind: "hat", name: "Champion Crown", price: 0 },
  // glasses
  { code: "round", kind: "glasses", name: "Round Glasses", price: 20 },
  { code: "square", kind: "glasses", name: "Smart Glasses", price: 25 },
  { code: "shades", kind: "glasses", name: "Cool Shades", price: 35 },
  { code: "star-glasses", kind: "glasses", name: "Star Glasses", price: 0 },
  // colours
  { code: "sky", kind: "color", name: "Sky", price: 0, hex: "#38bdf8" },
  { code: "teal", kind: "color", name: "Teal", price: 0, hex: "#2dd4bf" },
  { code: "coral", kind: "color", name: "Coral", price: 0, hex: "#fb7185" },
  { code: "sun", kind: "color", name: "Sunshine", price: 0, hex: "#fbbf24" },
  { code: "leaf", kind: "color", name: "Leaf", price: 10, hex: "#4ade80" },
  { code: "grape", kind: "color", name: "Grape", price: 10, hex: "#a78bfa" },
  { code: "tangerine", kind: "color", name: "Tangerine", price: 15, hex: "#fb923c" },
  { code: "berry", kind: "color", name: "Berry", price: 15, hex: "#e879f9" },
  { code: "storm", kind: "color", name: "Storm", price: 20, hex: "#94a3b8" },
  { code: "gold", kind: "color", name: "Gold", price: 0, hex: "#eab308" },
];

export const itemByCode = (code: string | null | undefined): ShopItem | null => (code ? SHOP_ITEMS.find((i) => i.code === code) ?? null : null);
/** the badge that unlocks this item, if any (such items cannot be bought) */
export const unlockBadgeOf = (code: string): string | null => UNLOCKED_BY[code] ?? null;
/** free for everyone: price 0 and not badge-locked */
export const isFree = (i: ShopItem): boolean => i.price === 0 && !unlockBadgeOf(i.code);

export interface AvatarConfig { base: string; color: string; hat: string | null; glasses: string | null }
export const DEFAULT_AVATAR: AvatarConfig = { base: "cat", color: "sky", hat: null, glasses: null };

/** Any stored value → a valid avatar (unknown codes fall back to the default). */
export function toAvatar(v: unknown): AvatarConfig {
  let o: unknown = v;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { o = null; } }
  const r = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  const pick = (k: unknown, kind: ItemKind) => { const i = itemByCode(typeof k === "string" ? k : null); return i && i.kind === kind ? i.code : null; };
  return { base: pick(r.base, "base") ?? DEFAULT_AVATAR.base, color: pick(r.color, "color") ?? DEFAULT_AVATAR.color, hat: pick(r.hat, "hat"), glasses: pick(r.glasses, "glasses") };
}

/** A friendly default avatar per student (stable, from the id) until they choose one. */
export function defaultAvatarFor(studentId: string): AvatarConfig {
  const h = [...studentId].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
  const bases = ["cat", "robot", "alien"], colors = ["sky", "teal", "coral", "sun"];
  return { base: bases[h % bases.length], color: colors[(h >> 3) % colors.length], hat: null, glasses: null };
}
