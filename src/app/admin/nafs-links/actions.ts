"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { applyNafsSuggestions, linkNafsFamily, saveNafsArea } from "@/server/nafs/nafs-links";
import { getT } from "@/i18n/server";

const back = (msg: string) => redirect(`/admin/nafs-links?msg=${encodeURIComponent(msg)}`);

export async function linkNafsFamilyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const { t } = await getT();
  let msg = t("✓ Saved.");
  try { await linkNafsFamily(repo, actor, String(f.get("familyId") ?? ""), String(f.get("area") ?? "") || null); } catch (e) { if (e instanceof ValidationError) msg = `⚠️ ${t(e.message)}`; else throw e; }
  back(msg);
}

export async function applyNafsSuggestionsAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const { t } = await getT();
  const n = await applyNafsSuggestions(repo, actor);
  back(t("✓ {n} skill(s) linked to their NAFS area. The others are in “Needs review”.", { n }));
}

export async function saveNafsAreaAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const { t } = await getT();
  let msg = t("✓ Area saved.");
  try {
    await saveNafsArea(repo, actor, { id: String(f.get("id") ?? "") || undefined, name: String(f.get("name") ?? ""), sortOrder: f.get("sortOrder") ? Number(f.get("sortOrder")) : undefined, isActive: f.get("id") ? f.get("isActive") === "1" : undefined });
  } catch (e) { if (e instanceof ValidationError) msg = `⚠️ ${t(e.message)}`; else throw e; }
  back(msg);
}
