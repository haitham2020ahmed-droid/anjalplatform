"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { publishDraftBatch, type PublishBatch } from "@/server/admin/publish-drafts";

/** One batch of "Publish drafts" (the button calls it until done). */
export async function publishDraftBatchAction(after: string | null): Promise<PublishBatch | { error: string }> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  try {
    const r = await publishDraftBatch(repo, actor, after ? String(after).slice(0, 191) : null);
    if (r.done) { revalidatePath("/admin/data-cleanup"); revalidatePath("/admin/questions"); }
    return r;
  } catch (e) { return { error: (e as Error).message }; }
}
