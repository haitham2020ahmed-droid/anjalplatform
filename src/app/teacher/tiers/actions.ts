"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { setTierManually, unlockTier } from "@/server/tiers/tiers";

const back = (f: FormData, msg: string) => {
  const q = new URLSearchParams({ class: String(f.get("classId") ?? "").slice(0, 191), tier: String(f.get("filter") ?? "").slice(0, 2), msg });
  const to = String(f.get("back") ?? "");
  redirect(to.startsWith("/teacher/tiers/") ? `${to}?msg=${encodeURIComponent(msg)}` : `/teacher/tiers?${q}`);
};

/** 🧭 The teacher sets a student's tier (with a reason): it is locked, so the daily rules leave it. */
export async function setTierAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  let msg = "✓ Tier set. It stays until you unlock it.";
  try {
    await setTierManually(repo, actor, { studentId: String(f.get("studentId") ?? "").slice(0, 191), tier: Number(f.get("tier")), reason: String(f.get("reason") ?? "").slice(0, 1000) });
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  back(f, msg);
}

/** 🔓 Unlock (let the rules decide): the rules run again for this student at once. */
export async function unlockTierAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  let msg = "🔓 Unlocked: the rules decide the tier again.";
  try { await unlockTier(repo, actor, String(f.get("studentId") ?? "").slice(0, 191)); }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  back(f, msg);
}
