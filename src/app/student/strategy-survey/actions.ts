"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { STRATEGY_ITEMS, submitStrategySurvey } from "@/server/surveys/strategy";

/** Saves the student's Reading Strategy Survey (once per term). */
export async function submitStrategySurveyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  const answers: Record<string, unknown> = {};
  for (const it of STRATEGY_ITEMS) { const v = f.get(it.id); answers[it.id] = v === null || v === "" ? null : Number(v); }
  let to = "/student/strategy-survey?done=1";
  try { await submitStrategySurvey(repo, actor, answers); }
  catch (e) { if (!(e instanceof ValidationError)) throw e; to = `/student/strategy-survey?msg=${encodeURIComponent(e.message)}`; }
  redirect(to);
}
