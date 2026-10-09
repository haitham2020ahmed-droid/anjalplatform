"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { submitWordQuiz } from "@/server/student/words";

export async function wordQuizAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const answers: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("q.")) answers[k.slice(2)] = String(v);
  const r = await submitWordQuiz(repo, actor, answers);
  redirect(`/student/words?score=${r.correct}-${r.total}&wrong=${encodeURIComponent(r.review.filter((x) => !x.correct).map((x) => x.word).join(","))}`);
}
