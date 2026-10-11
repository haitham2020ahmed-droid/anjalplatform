"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { approveReview, dismissReview } from "@/server/questions/link-review";
import { getT } from "@/i18n/server";

const back = (f: FormData, msg: string) => {
  const p = new URLSearchParams({ msg });
  for (const k of ["kind", "page"]) { const v = String(f.get(k) ?? ""); if (v) p.set(k, v); }
  redirect(`/admin/skill-links?${p}`);
};

export async function approveReviewAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const { t } = await getT();
  let msg: string;
  try { msg = `✓ ${await approveReview(repo, actor, String(f.get("id") ?? ""), String(f.get("choice") ?? "") || null)}`; } catch (e) { if (e instanceof ValidationError) msg = `⚠️ ${t(e.message)}`; else throw e; }
  back(f, msg);
}

export async function dismissReviewAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const { t } = await getT();
  await dismissReview(repo, actor, String(f.get("id") ?? ""));
  back(f, t("✓ Left as it is."));
}
