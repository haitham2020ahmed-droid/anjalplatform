"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { deleteFeedback, setFeedbackResolved } from "@/server/admin/feedback";

export async function resolveFeedbackAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await setFeedbackResolved(repo, actor, String(f.get("id") ?? "").slice(0, 191), f.get("resolved") !== "false");
  revalidatePath("/admin/feedback");
}

export async function deleteFeedbackAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await deleteFeedback(repo, actor, String(f.get("id") ?? "").slice(0, 191));
  revalidatePath("/admin/feedback");
}
