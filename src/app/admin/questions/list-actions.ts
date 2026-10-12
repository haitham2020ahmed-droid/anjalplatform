"use server";
/**
 * Actions of the Questions list. Each one takes at most BULK_BATCH ids (the page sends bigger selections in batches,
 * with a progress bar) and returns a plain result or an error message; nothing here re-renders the whole page (the
 * page refreshes itself once at the end).
 */
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { publishQuestions, STATUSES, type QuestionStatus } from "@/server/admin/questions";
import { archiveQuestions, deleteQuestions, restoreArchived } from "@/server/admin/question-delete";
import { BULK_BATCH, SORTS, flagQuestionsForReview, matchingIds, moveQuestionsToSkill, unpublishQuestions, type BankListFilter } from "@/server/admin/questions-list";

const ids = z.array(z.string().min(1).max(191)).min(1).max(BULK_BATCH);
export type BulkResult = { ok?: boolean; error?: string; done?: number; skipped?: { id: string; reason: string }[] };

async function run(fn: () => Promise<{ done: number; skipped?: { id: string; reason: string }[] }>): Promise<BulkResult> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: `Choose between 1 and ${BULK_BATCH} questions.` };
    if (e instanceof ValidationError || e instanceof ForbiddenError || (e as { status?: number }).status === 403) return { error: (e as Error).message };
    throw e;
  }
}

export async function publishBatchAction(list: string[]): Promise<BulkResult> {
  const actor = await requireActor({ permission: "questions:publish" });
  return run(async () => {
    const all = ids.parse(list);
    let done = 0;
    const skipped: { id: string; reason: string }[] = [];
    // the publish step re-validates every question (≤ 50 per call, as before)
    for (let i = 0; i < all.length; i += 50) {
      const r = await publishQuestions(repo, actor, all.slice(i, i + 50));
      done += r.published.length;
      skipped.push(...r.skipped.map((x) => ({ id: x.id, reason: x.reason })));
    }
    return { done, skipped };
  });
}

export async function unpublishBatchAction(list: string[]): Promise<BulkResult> {
  const actor = await requireActor({ permission: "questions:publish" });
  return run(async () => ({ done: (await unpublishQuestions(repo, actor, ids.parse(list))).unpublished }));
}

export async function moveBatchAction(list: string[], skillId: string): Promise<BulkResult> {
  const actor = await requireActor({ permission: "questions:publish" });
  return run(async () => ({ done: (await moveQuestionsToSkill(repo, actor, ids.parse(list), z.string().min(1).max(191).parse(skillId))).moved }));
}

export async function flagBatchAction(list: string[], note: string): Promise<BulkResult> {
  const actor = await requireActor({ permission: "questions:read" });
  return run(async () => ({ done: (await flagQuestionsForReview(repo, actor, ids.parse(list), String(note ?? ""))).flagged }));
}

export async function archiveBatchAction(list: string[], reason: string): Promise<BulkResult> {
  const actor = await requireActor({ permission: "questions:publish" });
  return run(async () => ({ done: (await archiveQuestions(repo, actor, ids.parse(list), String(reason ?? ""))).archived }));
}

/** ♻️ Archived questions back in use (published again). */
export async function restoreBatchAction(list: string[]): Promise<BulkResult> {
  const actor = await requireActor({ permission: "questions:publish" });
  return run(async () => ({ done: (await restoreArchived(repo, actor, ids.parse(list))).restored }));
}

export async function deleteBatchAction(list: string[]): Promise<BulkResult> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  return run(async () => {
    const r = await deleteQuestions(repo, actor, ids.parse(list));
    return { done: r.deleted, skipped: r.skipped.map((x) => ({ id: x.id, reason: x.reason })) };
  });
}

const Filter = z.object({
  q: z.string().max(100).optional(), family: z.string().max(200).optional(), skillId: z.string().max(191).optional(), type: z.string().max(40).optional(),
  status: z.enum(["ALL", ...STATUSES] as [string, ...string[]]).optional(), level: z.number().int().min(1).max(7).optional(), sort: z.enum(SORTS as unknown as [string, ...string[]]).optional(),
  mapCode: z.string().max(120).optional(), ai: z.boolean().optional(), mapArea: z.string().max(20).optional(), grade: z.number().int().min(0).max(12).optional(),
});

/** Every question matching the filters on screen (all pages), for “Select all matching”. */
export async function matchingIdsAction(filter: BankListFilter, purpose: "publish" | "any"): Promise<{ ids?: string[]; capped?: boolean; error?: string }> {
  const actor = await requireActor({ permission: "questions:read" });
  try {
    const f = Filter.parse(filter) as BankListFilter;
    const r = await matchingIds(repo, actor, f, purpose === "publish" ? { statuses: ["DRAFT", "UNDER_REVIEW"] as QuestionStatus[] } : {});
    return r;
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Invalid filter." };
    throw e;
  }
}
