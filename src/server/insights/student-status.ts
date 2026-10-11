/**
 * 🧭 One student status for every page (readiness I-20): the progress page, the family report, the teacher
 * follow-up and the alerts all start from statusOf (MAP + platform work) and then pass it through reconcileStatus
 * with the student's support tier. The tier is the platform's integrated decision (MAP, Diagnostic, checks, fluency,
 * teacher), so the status shown never contradicts it:
 *   Tier 3 → never “On track” / “Met target”: shown as “At risk” with the tier's reason
 *   Tier 1 → an “At risk” that comes only from an older MAP score (not a missed goal) is shown as “On track”,
 *            with the MAP note kept in the explanation
 *   Tier 2 → the MAP/platform status is kept (targeted support and on track can both be true)
 * The plan intensity follows the tier in the same way (Tier 3 Intensive · Tier 2 Targeted · Tier 1 Core).
 */
import type { Repo } from "../seeding/repo";
import type { Intensity } from "./progress";

export type BaseStatus = "ON_TRACK" | "AT_RISK" | "MET" | "MISSED" | "NO_DATA";
export interface TierInfo { tier: 1 | 2 | 3; reason: string }

const s = (v: unknown) => String(v ?? "");
const TIER_TEXT: Record<1 | 2 | 3, string> = { 1: "Tier 1 · Core", 2: "Tier 2 · Targeted", 3: "Tier 3 · Intensive" };

/** The current support tier of these students (no row = no tier yet). */
export async function tiersOf(repo: Repo, studentIds: string[]): Promise<Map<string, TierInfo>> {
  const out = new Map<string, TierInfo>();
  if (!studentIds.length) return out;
  for (let i = 0; i < studentIds.length; i += 500) {
    const rows = await repo.findMany("StudentTier", { studentId: { in: studentIds.slice(i, i + 500) } }, { select: ["studentId", "tier", "reason"] });
    for (const r of rows) { const t = Number(r.tier); if (t === 1 || t === 2 || t === 3) out.set(s(r.studentId), { tier: t, reason: s(r.reason) }); }
  }
  return out;
}

/** The status shown for a student, made consistent with their tier. */
export function reconcileStatus(base: { status: BaseStatus; why: string }, tier: TierInfo | null | undefined): { status: BaseStatus; why: string } {
  if (!tier) return base;
  if (tier.tier === 3 && (base.status === "ON_TRACK" || base.status === "MET" || base.status === "NO_DATA")) {
    return { status: "AT_RISK", why: `${TIER_TEXT[3]}: ${tier.reason || "intensive support"}.${base.status === "NO_DATA" ? "" : ` (${base.why})`}`.replace(/\.\./g, ".") };
  }
  if (tier.tier === 1 && base.status === "AT_RISK" && !/on the platform/i.test(base.why)) {
    return { status: "ON_TRACK", why: `${TIER_TEXT[1]}: recent work is on track. Earlier MAP note: ${base.why}` };
  }
  return base;
}

/** Plan intensity that agrees with the tier (falls back to the MAP-based intensity with no tier). */
export function intensityFor(tier: TierInfo | null | undefined, mapIntensity: Intensity | null): Intensity | null {
  if (!tier) return mapIntensity;
  return tier.tier === 3 ? "INTENSIVE" : tier.tier === 2 ? "TARGETED" : mapIntensity === null ? null : "CORE";
}
