"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { submitWordQuiz } from "@/server/student/words";
import { addJournalWord, starWord, submitWordReview } from "@/server/vocabulary/service";

export async function wordQuizAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const answers: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("q.")) answers[k.slice(2)] = String(v);
  const r = await submitWordQuiz(repo, actor, answers);
  redirect(`/student/words?tab=saved&score=${r.correct}-${r.total}&wrong=${encodeURIComponent(r.review.filter((x) => !x.correct).map((x) => x.word).join(","))}`);
}

/** 🔁 Today's word review: right → the word comes back later; wrong → tomorrow. */
export async function wordReviewAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const answers: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("a.")) answers[k.slice(2)] = String(v);
  const r = await submitWordReview(repo, actor, answers);
  redirect(`/student/words/review?done=${r.correct}-${r.total}&wrong=${encodeURIComponent(r.results.filter((x) => !x.correct).map((x) => x.word).join(","))}`);
}

/** ✍️ Word journal: a word with my sentence and a “not an example” sentence. */
export async function journalAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  let msg: string;
  try { const w = await addJournalWord(repo, actor, { word: String(f.get("word") ?? ""), myExample: String(f.get("myExample") ?? ""), notExample: String(f.get("notExample") ?? "") }); msg = `✓ “${w}” is in your word journal. It will come back in your review.`; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/student/words?tab=saved&msg=${encodeURIComponent(msg)}#journal`);
}

/** ⭐ Add a unit vocabulary word to my words (and my review). */
export async function starWordAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  let msg: string;
  try { const w = await starWord(repo, actor, String(f.get("word") ?? "")); msg = `⭐ “${w}” added to My Words.`; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/student/words?tab=saved&msg=${encodeURIComponent(msg)}#unit-words`);
}
