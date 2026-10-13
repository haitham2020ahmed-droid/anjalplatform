"use server";
/**
 * Load new questions: each action is ONE short request (one chunk, one Question Check part); the page calls them in a
 * loop with a progress bar. School admin only; the services check the role, the school and the load lock.
 */
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { checkChunk, explainLoadError, finishLoad, loadChunk, startLoad, stopLoad, type ChunkResult, type LoadSummary } from "@/server/admin/load-questions";

/**
 * A failed request: `error` is the English text (translated on the page, `what` fills its {what}); `retry` = worth
 * trying the same chunk again after a pause (a passing database / network problem), false = it will fail again
 * (no rights, the load was stopped, a missing table — "Run npx prisma db push").
 */
export type Res<T> = { ok: true; data: T } | { ok: false; error: string; what?: string; retry?: boolean };
const token = z.string().min(8).max(64);
const pack = z.string().min(2).max(20);

async function run<T>(fn: () => Promise<T>): Promise<Res<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Something is missing. Open the page again." };
    if (e instanceof ValidationError || e instanceof ForbiddenError || (e as { status?: number }).status === 403) return { ok: false, error: (e as Error).message };
    console.error("load-questions", e);
    const x = explainLoadError(e, "This part could not be loaded. Press Load again to go on from here.");
    return { ok: false, error: x.error, what: x.what, retry: !x.schema };
  }
}

export async function startLoadAction(): Promise<Res<{ token: string }>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"] });
  return run(() => startLoad(repo, actor));
}
export async function loadChunkAction(t: string, p: string, restart: boolean): Promise<Res<ChunkResult>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"] });
  return run(() => loadChunk(repo, actor, { token: token.parse(t), pack: pack.parse(p), restart: restart === true }));
}
export async function checkChunkAction(t: string): Promise<Res<Awaited<ReturnType<typeof checkChunk>>>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"] });
  return run(() => checkChunk(repo, actor, token.parse(t)));
}
export async function finishLoadAction(t: string, packs: string[]): Promise<Res<LoadSummary>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"] });
  return run(() => finishLoad(repo, actor, { token: token.parse(t), packs: z.array(pack).max(10).parse(packs) }));
}
export async function stopLoadAction(t: string): Promise<Res<null>> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"] });
  return run(async () => { await stopLoad(repo, actor, token.parse(t)); return null; });
}
