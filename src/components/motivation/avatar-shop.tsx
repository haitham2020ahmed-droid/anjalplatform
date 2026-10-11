"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { AvatarConfig, ItemKind } from "@/lib/avatar";
import { badgeByCode } from "@/lib/badge-catalog";
import type { ShopEntry } from "@/server/motivation/shop";
import { buyItemAction, equipAvatarAction } from "@/app/student/avatar/actions";
import { Avatar, BadgeEmblem, CoinIcon, ItemPreview } from "./avatar";

const TABS: { kind: ItemKind; label: string }[] = [
  { kind: "base", label: "Characters" }, { kind: "hat", label: "Hats" }, { kind: "glasses", label: "Glasses" }, { kind: "color", label: "Colors" },
];

/**
 * 🛍️ The Avatar Shop: try anything on, buy at the fixed price shown, then "Wear this". Items unlocked by a badge show
 * the badge to earn. No random boxes, no real money — coins come from learning (and a few from games).
 */
export function AvatarShop({ items, coins, avatar }: { items: ShopEntry[]; coins: number; avatar: AvatarConfig }) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<ItemKind>("base");
  const [look, setLook] = useState<AvatarConfig>(avatar);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const owned = useMemo(() => new Set(items.filter((i) => i.owned).map((i) => i.code)), [items]);
  const wearable = [look.base, look.color, look.hat, look.glasses].every((c) => !c || owned.has(c));
  const changed = JSON.stringify(look) !== JSON.stringify(avatar);
  const tryOn = (i: ShopEntry) => setLook((a) => (i.kind === "base" ? { ...a, base: i.code } : i.kind === "color" ? { ...a, color: i.code } : i.kind === "hat" ? { ...a, hat: a.hat === i.code ? null : i.code } : { ...a, glasses: a.glasses === i.code ? null : i.code }));
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <section aria-label={t("My avatar")} className="rounded-3xl bg-white p-5 text-center ring-1 ring-slate-200 lg:sticky lg:top-24 lg:self-start">
        <div className="mx-auto w-fit"><Avatar avatar={look} size={168} title={t("My avatar")} /></div>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-lg font-semibold text-amber-900 ring-1 ring-amber-200" data-testid="shop-coins"><CoinIcon size={22} /> <span dir="ltr">{coins.toLocaleString("en")}</span> {t("coins")}</p>
        <div className="mt-4 grid gap-2">
          <button type="button" disabled={busy || !changed || !wearable} onClick={() => run(() => equipAvatarAction(look), t("Saved! This is your avatar now."))}
            className="min-h-12 rounded-xl bg-brand-navy px-5 font-semibold text-white disabled:opacity-40">{t("Wear this")}</button>
          {changed && <button type="button" onClick={() => setLook(avatar)} className="min-h-11 rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Undo")}</button>}
          {!wearable && <p className="text-sm text-slate-600">{t("Buy the items you are trying on to wear them.")}</p>}
        </div>
        {msg && <p role="status" className={`mt-3 text-sm font-semibold ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      </section>

      <section aria-label={t("Avatar Shop")} className="min-w-0">
        <div role="tablist" aria-label={t("Avatar Shop")} className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((x) => (
            <button key={x.kind} type="button" role="tab" aria-selected={tab === x.kind} onClick={() => setTab(x.kind)}
              className={`min-h-11 shrink-0 rounded-full px-4 font-semibold ring-1 ${tab === x.kind ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`}>{t(x.label)}</button>
          ))}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 [&>li]:min-w-0" data-testid="shop-items">
          {(tab === "hat" || tab === "glasses") && (
            <li><button type="button" onClick={() => setLook((a) => (tab === "hat" ? { ...a, hat: null } : { ...a, glasses: null }))}
              className={`flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-white p-3 ring-1 ${(tab === "hat" ? look.hat : look.glasses) === null ? "ring-2 ring-brand-teal" : "ring-slate-200"}`}>
              <ItemPreview code={look.base} current={{ ...look, [tab === "hat" ? "hat" : "glasses"]: null }} size={72} />
              <span className="font-semibold text-brand-navy">{t(tab === "hat" ? "No hat" : "No glasses")}</span>
            </button></li>
          )}
          {items.filter((i) => i.kind === tab).map((i) => {
            const on = (i.kind === "base" ? look.base : i.kind === "color" ? look.color : i.kind === "hat" ? look.hat : look.glasses) === i.code;
            const badge = badgeByCode(i.lockedBy);
            return (
              <li key={i.code} data-item={i.code} className={`flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center ring-1 ${on ? "ring-2 ring-brand-teal" : "ring-slate-200"}`}>
                <button type="button" onClick={() => tryOn(i)} aria-pressed={on} className="grid place-items-center rounded-full" aria-label={t("Try on {name}", { name: t(i.name) })}>
                  <span className={badge ? "opacity-60" : ""}><ItemPreview code={i.code} current={look} size={72} /></span>
                </button>
                <span className="font-semibold leading-tight text-brand-navy">{t(i.name)}</span>
                {i.owned ? <span className="text-sm font-semibold text-emerald-700">✓ {t("Yours")}</span>
                  : badge ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><BadgeEmblem code={badge.code} size={16} locked /> {t("Earn the {name} badge", { name: t(badge.name) })}</span>
                  : (
                    <button type="button" disabled={busy || !i.canBuy} onClick={() => run(() => buyItemAction(i.code), t("Bought! Now press Wear this."))}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-400 px-3 font-semibold text-amber-950 disabled:bg-slate-100 disabled:text-slate-500">
                      <CoinIcon size={16} /> <span dir="ltr">{i.price}</span> · {t("Buy")}
                    </button>
                  )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
