"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { analyzeQuestions, confirmSkillMetadata, queueDuplicates } from "@/server/questions/intelligence";

/** 🧠 Analyses the questions not analysed yet (DOK, difficulty estimate, text level, misconceptions; disagreements → review). */
export async function analyzeAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const r = await analyzeQuestions(repo, actor.schoolId!, { limit: 3000, actor });
  redirect(`/admin/question-intelligence?msg=${encodeURIComponent(`Analysed ${r.analysed} question(s): DOK filled for ${r.dokFilled}, ${r.misconceptions} wrong option(s) tagged, ${r.suggestions} difficulty disagreement(s) sent for review.`)}`);
}

/** 🔁 Re-analyses every question (after many edits). */
export async function reanalyzeAllAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const r = await analyzeQuestions(repo, actor.schoolId!, { limit: 10000, force: true, actor });
  redirect(`/admin/question-intelligence?msg=${encodeURIComponent(`Re-analysed ${r.analysed} question(s).`)}`);
}

/** 👯 Finds exact copies, near copies and the same objective in other words; they go to the review queue. */
export async function duplicatesAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const n = await queueDuplicates(repo, actor.schoolId!, new Date(), actor);
  redirect(`/admin/question-intelligence?msg=${encodeURIComponent(`${n} new duplicate candidate(s) in the review queue.`)}`);
}

/** ✅ Confirms the automatic metadata of a skill's questions (a person checked them). */
export async function confirmSkillAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const skillId = String(f.get("skillId") ?? "").slice(0, 191);
  const n = await confirmSkillMetadata(repo, actor, skillId); // refuses a skill of another school
  redirect(`/admin/question-intelligence?tab=coverage&msg=${encodeURIComponent(`${n} question(s) confirmed.`)}`);
}
