"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { releaseHold, setAlertStatus } from "@/server/questions/reclassify";

const back = (f: FormData, msg: string) => `/admin/item-quality?tab=alerts${f.get("grade") ? `&grade=${encodeURIComponent(String(f.get("grade")))}` : ""}&msg=${encodeURIComponent(msg)}`;

export async function resolveAlertAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const status = f.get("status") === "DISMISSED" ? "DISMISSED" : "RESOLVED";
  await setAlertStatus(repo, actor, String(f.get("id")), status);
  redirect(back(f, status === "RESOLVED" ? "✓ Alert resolved. It re-opens only if new answers show the problem again." : "✓ Alert dismissed. It will not come back."));
}

export async function releaseHoldAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  await releaseHold(repo, actor, String(f.get("id")));
  redirect(back(f, "✓ The question is back in adaptive practice (the alert stays open)."));
}

/** 🧹 Run the automatic check now (definite errors are hidden from students). */
export async function autoCheckAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const { autoHideBroken } = await import("@/server/questions/auto-check");
  const r = await autoHideBroken(repo, actor);
  redirect(`/admin/item-quality?tab=hidden&msg=${encodeURIComponent(`✓ ${r.checked} questions checked · ${r.hidden.length} hidden.`)}`);
}
