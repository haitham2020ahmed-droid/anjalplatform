"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { approveReview, dismissReview } from "@/server/questions/link-review";
import { getT } from "@/i18n/server";

const back = (f: FormData, msg: string) => {
  const p = new URLSearchParams({ msg });
  for (const k of ["kind", "page", "view"]) { const v = String(f.get(k) ?? ""); if (v) p.set(k, v); }
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

// ------------------------------------------------------- “Sort questions under their skills” (batches of ~200)

import { revalidatePath } from "next/cache";
import { ForbiddenError } from "@/server/auth/rbac";
import { sortBatch, type SortBatchResult } from "@/server/questions/link-bank-run";

/** One batch: preview (apply = false, nothing written) or run (sure links made, the rest filed for review). */
export async function sortBatchAction(after: string | null, apply: boolean): Promise<{ result?: SortBatchResult; error?: string }> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  try {
    const result = await sortBatch(repo, actor, { after: typeof after === "string" && after ? after.slice(0, 191) : null, apply: apply === true });
    if (apply && result.done) revalidatePath("/admin/skill-links");
    return { result };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

// ------------------------------------------------------- bulk review (AI guesses · confident guesses · groups)

import { aiEnv } from "@/server/ai/env";
import {
  acceptAllGuessesBatch, acceptConfidentBatch, acceptGroup, aiProgress, confidentCount, guessedCount, improveGuessesBatch, reviewGroupRows,
  type AcceptBatchResult, type AiBatchResult, type AiProgress, type GroupPage,
} from "@/server/questions/link-review-bulk";

type Out<T> = { result?: T; error?: string };
async function guard<T>(fn: () => Promise<T>): Promise<Out<T>> {
  try { return { result: await fn() }; } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
const str = (v: unknown, n = 191) => (typeof v === "string" && v ? v.slice(0, n) : null);

export async function aiProgressAction(): Promise<Out<AiProgress>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => aiProgress(repo, actor));
}
/** One AI request (~15 questions). The page waits when the result asks it to (the school's AI limits). */
export async function improveGuessesAction(after: string | null): Promise<Out<AiBatchResult>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => improveGuessesBatch(repo, actor, aiEnv(), { after: str(after) }));
}
export async function confidentCountAction(): Promise<Out<number>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => confidentCount(repo, actor));
}
export async function acceptConfidentAction(after: string | null): Promise<Out<AcceptBatchResult>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => acceptConfidentBatch(repo, actor, str(after)));
}
export async function guessedCountAction(): Promise<Out<number>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => guessedCount(repo, actor));
}
export async function acceptAllGuessesAction(after: string | null): Promise<Out<AcceptBatchResult>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => acceptAllGuessesBatch(repo, actor, str(after)));
}
export async function groupRowsAction(label: string, page: number): Promise<Out<GroupPage>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => reviewGroupRows(repo, actor, typeof label === "string" ? label : "", Number(page) || 1));
}
export async function acceptGroupAction(ids: string[]): Promise<Out<{ linked: number; failed: number }>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => acceptGroup(repo, actor, Array.isArray(ids) ? ids.map(String) : []));
}
/** “Move to…” one row (the admin's choice). */
export async function moveRowAction(id: string, choice: string): Promise<Out<string>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(() => approveReview(repo, actor, String(id ?? "").slice(0, 64), str(choice, 64)));
}
export async function leaveRowAction(id: string): Promise<Out<true>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  return guard(async () => { await dismissReview(repo, actor, String(id ?? "").slice(0, 64)); return true as const; });
}
export async function refreshReviewAction(): Promise<void> {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  revalidatePath("/admin/skill-links");
}
