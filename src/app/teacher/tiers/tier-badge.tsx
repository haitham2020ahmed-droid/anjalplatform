/** 🧭 A tier badge (Tier 1 core · Tier 2 targeted · Tier 3 intensive). */
export const TIER_TONE: Record<number, string> = {
  1: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  2: "bg-amber-100 text-amber-900 ring-amber-200",
  3: "bg-red-100 text-red-900 ring-red-200",
};
export const TIER_LABEL: Record<number, string> = { 1: "Core", 2: "Targeted", 3: "Intensive" };

export function TierBadge({ tier }: { tier: number }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${TIER_TONE[tier] ?? TIER_TONE[1]}`}>Tier {tier} · {TIER_LABEL[tier] ?? ""}</span>;
}
