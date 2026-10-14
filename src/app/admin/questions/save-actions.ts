"use server";
/**
 * Saves a question from the question editor, including the fields of the newer item types (Part A / Part B, table
 * match, hot text) and of the upgraded error correction. The server re-validates everything with the bank rules.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { createDraft, duplicateOfInput, editPublishedAsNewVersion, updateDraft, type EditorInput } from "@/server/admin/questions";
import { editNeedsApproval, requestEdit } from "@/server/admin/question-edits";

const id = z.string().min(1).max(191);
const option = z.object({ label: z.string().max(4), text: z.string().max(500), correct: z.boolean(), rationale: z.string().max(500).nullable(), misconception: z.string().max(40).nullish() });
const cell = z.object({ id: z.string().max(20), text: z.string().max(500) });

// the same fields as the bank editor's save (src/app/admin/actions.ts), plus those of the newer types
const editorSchema = z.object({
  skillId: id, type: z.string(), stem: z.string().max(2000), level: z.coerce.number().int().min(1).max(7), standardCode: z.string().max(40).nullish(),
  passageId: z.string().max(191).nullish(), passageText: z.string().max(20000).nullish(), imageId: z.string().max(191).nullish(), imageAlt: z.string().max(300).nullish(), hint: z.string().max(500).nullish(), cognitiveLevel: z.string().max(20).nullish(), whyCorrect: z.string().max(1000), tip: z.string().max(500).nullish(),
  estimatedSeconds: z.coerce.number().int().min(10).max(600).optional(), aiDrafted: z.boolean().optional(),
  options: z.array(option).max(8).optional(),
  answer: z.boolean().optional(), answers: z.array(z.string().max(200)).max(10).optional(),
  sequence: z.array(z.string().max(300)).max(12).optional(), segments: z.array(z.string().max(300)).max(20).optional(),
  errorIndex: z.number().int().min(0).max(19).optional(), correction: z.string().max(300).optional(),
  pairs: z.array(z.object({ left: z.string().max(200), right: z.string().max(200) })).max(10).optional(),
  // upgraded error correction
  errorIndexes: z.array(z.number().int().min(0).max(19)).max(20).optional(), corrections: z.array(z.string().max(300)).max(20).optional(),
  noErrorOption: z.boolean().optional(), typeCorrection: z.boolean().optional(), errorKind: z.string().max(40).nullish(),
  // newer types
  twoPart: z.object({ partA: z.object({ stem: z.string().max(1000), options: z.array(option).max(8) }), partB: z.object({ stem: z.string().max(1000), options: z.array(option).max(8), multiple: z.boolean().optional() }) }).optional(),
  grid: z.object({ rows: z.array(cell).max(12), columns: z.array(cell).max(6), answer: z.record(z.string().max(20)) }).optional(),
  hotText: z.object({ segments: z.array(cell).max(20), correct: z.array(z.string().max(20)).max(20), maxSelect: z.number().int().min(1).max(20) }).optional(),
  dictation: z.object({ word: z.string().max(40), sentence: z.string().max(300).nullish() }).optional(),
  combine: z.object({ sentences: z.array(z.string().max(300)).max(6), connector: z.string().max(30).nullish(), hint: z.string().max(300).nullish(), accepted: z.array(z.string().max(400)).max(10) }).optional(),
});

export async function saveQuestionWithTypesAction(questionId: string | null, input: unknown): Promise<{ ok?: boolean; error?: string; message?: string; id?: string; duplicateId?: string }> {
  const actor = await requireActor({ permission: "questions:edit" });
  try {
    const parsed = editorSchema.parse(input) as EditorInput;
    // 👯 an exact copy of another question of the same skill family is not saved twice
    const dup = await duplicateOfInput(repo, actor, parsed, questionId ? id.parse(questionId) : null);
    if (dup) return { error: "This question already exists.", duplicateId: dup.id };
    let r: { id: string; message: string };
    // ✏️ a teacher's change of a question that is not their own draft waits for the admin (students keep the current version)
    const current = questionId ? await repo.findUnique("Question", { id: id.parse(questionId) }) : null;
    if (questionId && current && editNeedsApproval(actor, current)) {
      await requestEdit(repo, actor, id.parse(questionId), parsed);
      revalidatePath(`/admin/questions/${questionId}`);
      return { ok: true, id: questionId, message: "Sent to the admin for approval. Students keep seeing the current version until it is approved." };
    }
    // ✏️ an admin's Edit anyway of a published question students answered: saved and published as a new version
    if (questionId && current && current.status === "PUBLISHED" && (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN")
      && (await repo.findMany("QuestionAttempt", { questionId: current.id }, { select: ["questionId"], take: 1 })).length) {
      const newId = await editPublishedAsNewVersion(repo, actor, id.parse(questionId), parsed);
      revalidatePath("/admin/questions");
      return { ok: true, id: newId, message: "Saved and published as a new version. It replaces the old one everywhere; students' past answers stay with the old one." };
    }
    if (questionId) {
      await updateDraft(repo, actor, id.parse(questionId), parsed);
      revalidatePath(`/admin/questions/${questionId}`);
      r = { id: questionId, message: "Saved." };
    } else r = { id: await createDraft(repo, actor, parsed), message: "Draft created." };
    revalidatePath("/admin/questions");
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403 || e instanceof z.ZodError) return { error: e instanceof z.ZodError ? "Some fields are missing or invalid." : (e as Error).message };
    throw e;
  }
}
