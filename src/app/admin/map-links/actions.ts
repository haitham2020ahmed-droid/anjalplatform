"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { applyLinkSuggestions, linkFamily } from "@/server/map/map-more";

export async function linkFamilyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  let msg = "✓ Saved.";
  try { await linkFamily(repo, actor, String(f.get("familyId")), String(f.get("area") ?? "") || null); } catch (e) { if (e instanceof ValidationError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/map-links?msg=${encodeURIComponent(msg)}`);
}

export async function applySuggestionsAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const n = await applyLinkSuggestions(repo, actor);
  redirect(`/admin/map-links?msg=${encodeURIComponent(`✓ ${n} skill(s) linked from their standard. Check them below.`)}`);
}
