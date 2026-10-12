"use server";
/**
 * 👯 Duplicate Questions: each step is one short request (the page loops with a progress bar), so a large bank never
 * needs one long request or much memory: fingerprints are filled 1,000 at a time, duplicates are removed one batch
 * (≤ 500 questions) at a time. Admins only; everything is checked again on the server.
 */
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { schoolOf } from "@/server/admin/users";
import { backfillContentHashes } from "@/server/questions/dedupe-hash";
import { APPLY_MAX_IDS, applyDuplicateGroups, findDuplicates, type RemovedRow, type ReviewGroup } from "@/server/questions/dedupe";

const ADMIN = { roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] as ("SCHOOL_ADMIN" | "SUPER_ADMIN")[], permission: "questions:publish" as const };

/** Questions that have no fingerprint yet (saved before this update, or by a path that does not set it). */
export async function missingHashesAction(): Promise<{ missing: number }> {
  await requireActor(ADMIN);
  return { missing: await repo.count("Question", { contentHash: null }) };
}

/** Fills up to 1,000 fingerprints; call again until `missing` is 0. */
export async function fillHashesAction(): Promise<{ filled: number; missing: number }> {
  await requireActor(ADMIN);
  const filled = await backfillContentHashes(repo, { max: 1000 });
  return { filled, missing: filled ? await repo.count("Question", { contentHash: null }) : 0 };
}

export interface ClientGroup { ids: string[]; keep: string; stem: string; skill: string; grade: number; remove: number; answers: number; keepStatus: string }
export interface ClientPlan { scanned: number; groups: ClientGroup[]; toRemove: number; answersToMove: number; bySkill: { skill: string; grade: number; n: number }[]; review: ReviewGroup[]; ms: number }

/** Finds the exact duplicates of the school (nothing is changed except fingerprints that were out of date). */
export async function findDuplicatesAction(): Promise<{ plan?: ClientPlan; error?: string }> {
  const actor = await requireActor(ADMIN);
  const t0 = Date.now();
  const p = await findDuplicates(repo, schoolOf(actor));
  return {
    plan: {
      scanned: p.scanned, toRemove: p.toRemove, answersToMove: p.answersToMove, bySkill: p.bySkill, review: p.review, ms: Date.now() - t0,
      groups: p.groups.map((g) => ({ ids: [g.keep.id, ...g.remove.map((r) => r.id)], keep: g.keep.id, stem: g.stem, skill: g.keep.skill, grade: g.keep.grade, remove: g.remove.length, answers: g.remove.reduce((n, r) => n + r.attempts, 0), keepStatus: g.keep.status })),
    },
  };
}

const groups = z.array(z.array(z.string().min(1).max(191)).min(2).max(APPLY_MAX_IDS)).min(1).max(APPLY_MAX_IDS);

/** Removes the duplicates of one batch of groups; the copy to keep is chosen again on the server. */
export async function removeDuplicatesAction(batch: string[][]): Promise<{ removed?: number; movedAnswers?: number; rows?: RemovedRow[]; error?: string }> {
  const actor = await requireActor(ADMIN);
  try {
    const list = groups.parse(batch);
    if (list.flat().length > APPLY_MAX_IDS) return { error: `At most ${APPLY_MAX_IDS} questions per batch.` };
    const r = await applyDuplicateGroups(repo, { schoolId: schoolOf(actor), actorId: actor.userId }, list);
    return { removed: r.removed, movedAnswers: r.movedAnswers, rows: r.rows };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "This batch is not valid. Press Find again." };
    throw e;
  }
}
