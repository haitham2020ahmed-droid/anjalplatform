"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { recalibrateRit, unverifyQuestions, verifyBatch, verifyQuestions } from "@/server/questions/tag-review";

/** 🏷️ Verify the ticked sample questions, the whole batch, undo, or recalibrate RIT. */
export async function reviewAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const grade = String(f.get("grade") ?? ""), skillId = String(f.get("skillId") ?? ""), op = String(f.get("op") ?? "");
  let msg: string;
  try {
    if (op === "batch") msg = `✓ Verified the whole batch (${await verifyBatch(repo, actor, skillId)} questions).`;
    else if (op === "undo") msg = `Back to “Suggested”: ${await unverifyQuestions(repo, actor, f.getAll("q").map(String))} question(s).`;
    else if (op === "recalibrate") { const r = await recalibrateRit(repo, actor, Number(grade)); msg = `📐 RIT recalibrated for ${r.calibrated} of ${r.questions} question(s) (the others need more answers from students with a MAP score).`; }
    else { const ids = f.getAll("q").map(String); if (!ids.length) throw new ValidationError("Tick at least one question."); msg = `✓ Verified ${await verifyQuestions(repo, actor, ids)} question(s).`; }
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(`/admin/question-review?${new URLSearchParams({ grade, ...(skillId ? { skillId } : {}), msg })}`);
}
