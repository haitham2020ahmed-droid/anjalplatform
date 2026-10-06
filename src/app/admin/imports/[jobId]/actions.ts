"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { cancelImport, confirmImport } from "@/server/imports/pipeline";

export async function confirmImportAction(f: FormData) {
  const actor = await requireActor({ permission: "imports:run" });
  const jobId = z.string().min(1).max(191).parse(f.get("jobId"));
  await confirmImport(repo, actor, jobId, { duplicates: f.get("duplicates") === "replace" ? "replace" : "skip" });
  redirect(`/admin/imports/${jobId}`);
}

export async function cancelImportAction(f: FormData) {
  const actor = await requireActor({ permission: "imports:run" });
  const jobId = z.string().min(1).max(191).parse(f.get("jobId"));
  await cancelImport(repo, actor, jobId);
  redirect("/admin/imports");
}
