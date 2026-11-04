"use server";
/** 🧾 “Remove questions that need a missing passage” (r68): one click after the list. See src/server/admin/missing-passage.ts. */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { removeAllMissingPassage } from "@/server/admin/missing-passage";

export async function removeMissingPassageAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  let msg: string;
  try {
    const r = await removeAllMissingPassage(repo, actor);
    msg = `✓ ${r.removed} question(s) removed from the platform. Students' answers are kept.`;
  } catch (e) {
    msg = (e as Error).message || "The server did not answer. Try again.";
  }
  revalidatePath("/admin/questions");
  revalidatePath("/admin/question-flags");
  redirect(`/admin/questions/missing-passage?msg=${encodeURIComponent(msg)}`);
}
