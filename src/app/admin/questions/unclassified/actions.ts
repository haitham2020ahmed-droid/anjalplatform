"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { classifyQuestions } from "@/server/curriculum-map/questions";
import { classifyStep, type StuckItem } from "@/server/admin/stuck-questions";

/** The per-row skill pickers: each chosen row is saved on its own, so one wrong row never blocks the others. */
export async function classifyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const items = [...f.keys()].filter((k) => k.startsWith("skill:")).map((k) => ({ questionId: k.slice(6), skillId: String(f.get(k) ?? "") })).filter((x) => x.skillId);
  let saved = 0;
  const errors: string[] = [];
  for (const it of items.slice(0, 200)) {
    try { saved += await classifyQuestions(repo, actor.schoolId!, actor.userId, [it]); }
    catch (e) { errors.push((e as Error).message); }
  }
  revalidatePath("/admin/questions");
  const page = Math.max(1, Number(f.get("page")) || 1);
  const msg = items.length ? `${saved} question(s) classified.${errors.length ? ` ${errors.length} not saved: ${[...new Set(errors)].join(" ")}` : ""}` : "Choose a skill for at least one question first.";
  redirect(`/admin/questions/unclassified?page=${page}&msg=${encodeURIComponent(msg)}`);
}

export interface AutoBatch { error?: string; next?: string | null; processed?: number; classified?: number; remaining?: number; left?: StuckItem[] }

/** 🪄 One batch of Auto-classify (the page calls it again with `next` until it is null, with a progress bar). */
export async function autoClassifyBatchAction(after: string | null): Promise<AutoBatch> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  try {
    const cursor = after === null ? null : z.string().min(1).max(191).parse(after);
    const r = await classifyStep(repo, actor.schoolId!, actor.userId, cursor);
    if (!r.next) { revalidatePath("/admin/questions"); revalidatePath("/admin/questions/unclassified"); }
    return { next: r.next, processed: r.processed, classified: r.classified, remaining: r.remaining, left: r.left.slice(0, 50) };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Invalid request." };
    return { error: (e as Error).message || "The server did not answer. Try again." };
  }
}
