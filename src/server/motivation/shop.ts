/**
 * 🛍️ The Avatar Shop (Games Part 3): characters and accessories at FIXED coin prices. No random boxes, no real money.
 * Owned = free items + bought items (CoinLedger "shop" rows: one per item, so an item can never be bought twice) +
 * items unlocked by a badge. Students only, their own wallet only (server-enforced).
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { insertLedger, recomputeCoins, rewardChip, forgetChip, type RewardChip } from "./coins";
import { BADGES, UNLOCKED_BY } from "../../lib/badge-catalog";
import { isFree, itemByCode, SHOP_ITEMS, toAvatar, type AvatarConfig, type ShopItem } from "../../lib/avatar";

const s = (v: unknown) => String(v ?? "");
const me = (actor: Actor): string => { if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only."); return actor.studentId; };

/** codes of the badges this student has earned (saved StudentBadge rows) */
export async function earnedBadgeCodes(repo: Repo, studentId: string): Promise<Set<string>> {
  const held = await repo.findMany("StudentBadge", { studentId }, { select: ["badgeId"] });
  if (!held.length) return new Set();
  const defs = await repo.findMany("Badge", { id: { in: held.map((h) => h.badgeId) } }, { select: ["code"] });
  return new Set(defs.map((d) => s(d.code)));
}

export async function ownedItems(repo: Repo, studentId: string): Promise<{ owned: Set<string>; badges: Set<string> }> {
  const [bought, badges] = await Promise.all([
    repo.findMany("CoinLedger", { studentId, reason: "shop" }, { select: ["refId"], take: 500 }),
    earnedBadgeCodes(repo, studentId),
  ]);
  const owned = new Set<string>(SHOP_ITEMS.filter(isFree).map((i) => i.code));
  for (const b of bought) owned.add(s(b.refId));
  for (const [item, badge] of Object.entries(UNLOCKED_BY)) if (badges.has(badge)) owned.add(item);
  return { owned, badges };
}

export interface ShopEntry extends ShopItem { owned: boolean; lockedBy: string | null; canBuy: boolean }
export interface ShopView { chip: RewardChip; items: ShopEntry[] }

export async function shopView(repo: Repo, actor: Actor): Promise<ShopView> {
  const sid = me(actor);
  const [chip, { owned }] = await Promise.all([rewardChip(repo, sid), ownedItems(repo, sid)]);
  const items = SHOP_ITEMS.map((i) => {
    const lockedBy = UNLOCKED_BY[i.code] ?? null, has = owned.has(i.code);
    return { ...i, owned: has, lockedBy: has ? null : lockedBy, canBuy: !has && !lockedBy && i.price > 0 && chip.coins >= i.price };
  });
  return { chip, items };
}

/** Buys one item at its fixed price. */
export async function buyItem(repo: Repo, actor: Actor, code: string, now = new Date()): Promise<{ coins: number }> {
  const sid = me(actor);
  const item = itemByCode(code);
  if (!item) throw new ValidationError("This item is not in the shop.");
  if (UNLOCKED_BY[item.code]) throw new ValidationError(`Earn the ${BADGES.find((b) => b.code === UNLOCKED_BY[item.code])?.name ?? ""} badge to unlock this.`);
  if (item.price <= 0) throw new ValidationError("This item is free.");
  const { owned } = await ownedItems(repo, sid);
  if (owned.has(item.code)) throw new ValidationError("You already have this.");
  const { coins } = await recomputeCoins(repo, sid);
  if (coins < item.price) throw new ValidationError("Not enough coins yet.");
  if (!(await insertLedger(repo, { studentId: sid, amount: -item.price, reason: "shop", refId: item.code, note: item.name, createdAt: now }))) throw new ValidationError("You already have this.");
  const after = await recomputeCoins(repo, sid);
  if (after.coins < 0) {   // two purchases at the same moment: undo this one
    await repo.deleteMany("CoinLedger", { studentId: sid, reason: "shop", refId: item.code });
    await recomputeCoins(repo, sid);
    throw new ValidationError("Not enough coins yet.");
  }
  return { coins: after.coins };
}

/** Wears an avatar made only of owned items. */
export async function equipAvatar(repo: Repo, actor: Actor, cfg: Partial<AvatarConfig>): Promise<AvatarConfig> {
  const sid = me(actor);
  const a = toAvatar(cfg);
  if (cfg.base && a.base !== cfg.base) throw new ValidationError("Unknown character.");
  const { owned } = await ownedItems(repo, sid);
  for (const code of [a.base, a.color, a.hat, a.glasses]) if (code && !owned.has(code)) throw new ValidationError("Buy this item first.");
  await repo.upsert("StudentReward", { studentId: sid }, { studentId: sid, avatar: a }, { avatar: a });
  forgetChip(sid);
  return a;
}
