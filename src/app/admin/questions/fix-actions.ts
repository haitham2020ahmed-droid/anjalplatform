"use server";
/** 🛠 “Fix stuck questions”: one batch per call (the page loops with a progress bar). See src/server/admin/stuck-questions.ts. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { fixStuckStep, type Cursor, type FixReport } from "@/server/admin/stuck-questions";

const CursorSchema = z.object({ phase: z.enum(["passages", "classify", "repair", "done"]), after: z.string().max(191).nullable() }).nullable();

export async function fixStuckStepAction(cursor: Cursor | null): Promise<{ error?: string; cursor?: Cursor; processed?: number; report?: FixReport; waitMs?: number }> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  try {
    const r = await fixStuckStep(repo, actor, CursorSchema.parse(cursor));
    if (r.cursor.phase === "done") { revalidatePath("/admin/questions"); revalidatePath("/admin/system"); }
    return { cursor: r.cursor, processed: r.processed, report: r.report, waitMs: r.waitMs };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Invalid request." };
    if (e instanceof ForbiddenError) return { error: e.message };
    return { error: (e as Error).message || "The server did not answer. Try again." };
  }
}
