"use server";
/**
 * 🎯 Answer-length check → "Update answer choices from files": each action is ONE short request (one chunk); the page
 * calls them in a loop with a progress bar (like Load new questions). Admins only; the service checks the role and school.
 */
import { z } from "zod";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { applyChunk, finishApply, rewriteChunk, type RewriteChunk, type ApplyProgress, type SourceCounts, type RewriteSource } from "@/server/admin/option-rewrites";

export type Res<T> = { ok: true; data: T } | { ok: false; error: string; retry?: boolean };
const cursor = z.object({ phase: z.enum(["question", "readrise"]), after: z.string().max(191).nullable() }).nullable();

async function run<T>(fn: () => Promise<T>): Promise<Res<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Something is missing. Open the page again." };
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return { ok: false, error: (e as Error).message };
    console.error("option-rewrites", e);
    return { ok: false, error: "This part could not be done. Press the button again to go on from here.", retry: true };
  }
}
const admin = () => requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:edit" });

/** PREVIEW one chunk (nothing is written). */
export async function previewChunkAction(c: unknown): Promise<Res<RewriteChunk>> {
  const actor = await admin();
  return run(() => rewriteChunk(repo, actor, { apply: false, cursor: cursor.parse(c) }));
}
/** APPLY one chunk from the kept place (`restart` = from the start). */
export async function applyChunkAction(restart: boolean): Promise<Res<RewriteChunk & { progress: ApplyProgress | null }>> {
  const actor = await admin();
  const me = await getActor();
  return run(() => applyChunk(repo, actor, { restart: restart === true, byName: String(me?.user.displayName ?? "") }));
}
const counts = z.object({ matched: z.number(), toChange: z.number(), upToDate: z.number(), notFound: z.number(), options: z.number() });
/** The end of an apply: audit-logged with the totals. */
export async function finishApplyAction(totals: unknown): Promise<Res<null>> {
  const actor = await admin();
  return run(async () => {
    const t = z.object({ changed: z.number().int().min(0), matched: z.number().int().min(0), scanned: z.number().int().min(0), counts: z.record(counts) }).parse(totals);
    await finishApply(repo, actor, { changed: t.changed, matched: t.matched, scanned: t.scanned, counts: t.counts as Partial<Record<RewriteSource, SourceCounts>> });
    return null;
  });
}
